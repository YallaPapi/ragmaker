# Local RAG Engine Technical Specification

## Overview

The Local RAG Engine is the core component of the standalone RAGMaker desktop application, providing complete Retrieval-Augmented Generation capabilities without external dependencies.

## Architecture Components

### 1. Embedding Model Manager

```rust
pub struct EmbeddingModelManager {
    primary_model: Arc<Mutex<EmbeddingModel>>,
    fallback_models: Vec<EmbeddingModel>,
    model_cache: Arc<RwLock<LruCache<String, Vec<f32>>>>,
    performance_monitor: PerformanceMonitor,
}

impl EmbeddingModelManager {
    pub async fn new(config: EmbeddingConfig) -> Result<Self> {
        // Initialize primary model based on system capabilities
        let primary_model = match config.model_preference {
            ModelPreference::Performance => Self::load_model("nomic-embed-text-v1.5").await?,
            ModelPreference::Accuracy => Self::load_model("bge-large-en-v1.5").await?,
            ModelPreference::Balanced => Self::load_model("all-MiniLM-L6-v2").await?,
            ModelPreference::Lightweight => Self::load_model("all-MiniLM-L12-v2").await?,
        };

        // Load fallback models for redundancy
        let fallback_models = vec![
            Self::load_model("all-MiniLM-L6-v2").await?,
            Self::load_model("paraphrase-albert-small-v2").await?,
        ];

        Ok(Self {
            primary_model: Arc::new(Mutex::new(primary_model)),
            fallback_models,
            model_cache: Arc::new(RwLock::new(LruCache::new(1000))),
            performance_monitor: PerformanceMonitor::new(),
        })
    }

    pub async fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        // Check cache first
        let cache_key = self.generate_cache_key(text);
        if let Some(cached) = self.model_cache.read().await.get(&cache_key) {
            return Ok(cached.clone());
        }

        // Try primary model
        match self.embed_with_model(&self.primary_model, text).await {
            Ok(embedding) => {
                // Cache successful embedding
                self.model_cache.write().await.put(cache_key, embedding.clone());
                Ok(embedding)
            },
            Err(_) => {
                // Fallback to secondary models
                for fallback_model in &self.fallback_models {
                    if let Ok(embedding) = self.embed_with_model_direct(fallback_model, text).await {
                        self.model_cache.write().await.put(cache_key, embedding.clone());
                        return Ok(embedding);
                    }
                }
                Err(RagError::EmbeddingGenerationFailed)
            }
        }
    }

    pub async fn embed_batch(&self, texts: Vec<&str>) -> Result<Vec<Vec<f32>>> {
        let batch_size = self.optimal_batch_size().await;
        let mut results = Vec::new();

        for chunk in texts.chunks(batch_size) {
            let batch_embeddings = self.process_batch(chunk).await?;
            results.extend(batch_embeddings);
        }

        Ok(results)
    }

    async fn optimal_batch_size(&self) -> usize {
        // Determine optimal batch size based on available memory and model size
        let available_memory = self.performance_monitor.get_available_memory().await;
        let model_memory_requirement = self.get_model_memory_requirement().await;
        
        match available_memory / model_memory_requirement {
            ratio if ratio > 100 => 32,
            ratio if ratio > 50 => 16,
            ratio if ratio > 20 => 8,
            _ => 4,
        }
    }
}
```

### 2. Vector Database Interface

```rust
pub struct LocalVectorDatabase {
    qdrant_client: Arc<Mutex<QdrantClient>>,
    collections: HashMap<String, CollectionInfo>,
    index_manager: IndexManager,
    compression_manager: CompressionManager,
}

impl LocalVectorDatabase {
    pub async fn new(data_path: PathBuf) -> Result<Self> {
        // Initialize embedded Qdrant instance
        let qdrant_client = QdrantClient::new(&QdrantClientConfig {
            url: format!("file://{}", data_path.join("vector_db").display()),
            prefer_grpc: false,
            timeout: Some(Duration::from_secs(30)),
        }).await?;

        let mut db = Self {
            qdrant_client: Arc::new(Mutex::new(qdrant_client)),
            collections: HashMap::new(),
            index_manager: IndexManager::new(),
            compression_manager: CompressionManager::new(),
        };

        // Initialize default collections
        db.ensure_default_collections().await?;
        Ok(db)
    }

    pub async fn create_collection(&self, name: &str, vector_size: usize) -> Result<()> {
        let client = self.qdrant_client.lock().await;
        
        client.create_collection(&CreateCollection {
            collection_name: name.to_string(),
            vectors_config: Some(VectorsConfig {
                config: Some(Config::Params(VectorParams {
                    size: vector_size as u64,
                    distance: Distance::Cosine as i32,
                    hnsw_config: Some(HnswConfig {
                        m: 16,
                        ef_construct: 100,
                        full_scan_threshold: Some(10000),
                        max_indexing_threads: Some(0),
                        on_disk: Some(true), // Enable disk storage for large collections
                        ..Default::default()
                    }),
                    quantization_config: Some(QuantizationConfig {
                        quantization: Some(Quantization::Scalar(ScalarQuantization {
                            r#type: QuantizationType::Int8 as i32,
                            quantile: Some(0.99),
                            always_ram: Some(false),
                        })),
                    }),
                    ..Default::default()
                })),
            }),
            ..Default::default()
        }).await?;

        self.collections.insert(name.to_string(), CollectionInfo {
            name: name.to_string(),
            vector_size,
            created_at: Utc::now(),
            document_count: 0,
        });

        Ok(())
    }

    pub async fn upsert_vectors(&self, collection: &str, vectors: Vec<VectorData>) -> Result<()> {
        let client = self.qdrant_client.lock().await;
        
        // Process in batches to manage memory
        let batch_size = 100;
        for batch in vectors.chunks(batch_size) {
            let points: Vec<PointStruct> = batch.iter().map(|v| PointStruct {
                id: Some(PointId::from(v.id.clone())),
                payload: v.metadata.clone(),
                vectors: Some(Vectors::from(v.vector.clone())),
            }).collect();

            client.upsert_points(UpsertPoints {
                collection_name: collection.to_string(),
                points,
                wait: Some(true),
                ordering: None,
            }).await?;
        }

        // Update collection info
        if let Some(collection_info) = self.collections.get_mut(collection) {
            collection_info.document_count += vectors.len();
        }

        // Trigger optimization if needed
        self.maybe_optimize_collection(collection).await?;

        Ok(())
    }

    pub async fn search(&self, collection: &str, vector: Vec<f32>, limit: usize) -> Result<Vec<SearchResult>> {
        let client = self.qdrant_client.lock().await;
        
        let search_request = SearchPoints {
            collection_name: collection.to_string(),
            vector: vector,
            limit: limit as u64,
            with_payload: Some(true.into()),
            with_vectors: Some(false.into()),
            score_threshold: Some(0.3), // Minimum similarity threshold
            params: Some(SearchParams {
                hnsw_ef: Some(128), // Higher ef for better recall
                exact: Some(false),
                quantization: None,
                indexed_only: Some(true),
            }),
            ..Default::default()
        };

        let response = client.search_points(search_request).await?;
        
        let results: Vec<SearchResult> = response.result.into_iter().map(|point| {
            SearchResult {
                id: point.id.unwrap().to_string(),
                score: point.score,
                metadata: point.payload,
            }
        }).collect();

        Ok(results)
    }

    pub async fn hybrid_search(
        &self, 
        collection: &str, 
        vector: Vec<f32>, 
        text_query: Option<&str>,
        limit: usize
    ) -> Result<Vec<SearchResult>> {
        let client = self.qdrant_client.lock().await;
        
        let mut search_request = SearchPoints {
            collection_name: collection.to_string(),
            vector: vector,
            limit: limit as u64,
            with_payload: Some(true.into()),
            with_vectors: Some(false.into()),
            score_threshold: Some(0.2),
            ..Default::default()
        };

        // Add text filtering if provided
        if let Some(query) = text_query {
            let filter = Filter {
                must: Some(vec![Condition {
                    condition_one_of: Some(ConditionOneOf::Field(FieldCondition {
                        key: "content".to_string(),
                        match_: Some(Match {
                            match_value: Some(MatchValue::Text(query.to_string())),
                        }),
                        ..Default::default()
                    })),
                }]),
                ..Default::default()
            };
            search_request.filter = Some(filter);
        }

        let response = client.search_points(search_request).await?;
        
        let results: Vec<SearchResult> = response.result.into_iter().map(|point| {
            SearchResult {
                id: point.id.unwrap().to_string(),
                score: point.score,
                metadata: point.payload,
            }
        }).collect();

        Ok(results)
    }

    async fn maybe_optimize_collection(&self, collection: &str) -> Result<()> {
        if let Some(collection_info) = self.collections.get(collection) {
            // Optimize every 10,000 documents
            if collection_info.document_count % 10000 == 0 {
                let client = self.qdrant_client.lock().await;
                client.update_collection(UpdateCollection {
                    collection_name: collection.to_string(),
                    optimizers_config: Some(OptimizersConfigDiff {
                        deleted_threshold: Some(0.2),
                        vacuum_min_vector_number: Some(1000),
                        default_segment_number: Some(0),
                        max_segment_size: Some(20000),
                        memmap_threshold: Some(50000),
                        indexing_threshold: Some(20000),
                        flush_interval_sec: Some(5),
                        max_optimization_threads: Some(1),
                    }),
                    ..Default::default()
                }).await?;
            }
        }
        Ok(())
    }
}
```

### 3. Content Retrieval System

```rust
pub struct ContentRetriever {
    vector_db: Arc<LocalVectorDatabase>,
    reranker: Option<Reranker>,
    context_expander: ContextExpander,
    relevance_filter: RelevanceFilter,
}

impl ContentRetriever {
    pub async fn retrieve_relevant_content(
        &self,
        query: &str,
        collection: &str,
        top_k: usize
    ) -> Result<Vec<RetrievedContent>> {
        // 1. Generate query embedding
        let query_embedding = self.embed_query(query).await?;
        
        // 2. Perform initial vector search
        let initial_results = self.vector_db
            .search(collection, query_embedding, top_k * 2).await?;
        
        // 3. Apply relevance filtering
        let filtered_results = self.relevance_filter
            .filter_results(query, initial_results).await?;
        
        // 4. Re-rank if reranker is available
        let reranked_results = if let Some(reranker) = &self.reranker {
            reranker.rerank(query, filtered_results).await?
        } else {
            filtered_results
        };
        
        // 5. Expand context for top results
        let expanded_results = self.context_expander
            .expand_context(reranked_results, top_k).await?;
        
        Ok(expanded_results)
    }

    pub async fn retrieve_with_filters(
        &self,
        query: &str,
        collection: &str,
        filters: RetrievalFilters,
        top_k: usize
    ) -> Result<Vec<RetrievedContent>> {
        let query_embedding = self.embed_query(query).await?;
        
        // Apply temporal, source, and content type filters
        let mut search_results = Vec::new();
        
        // Search with date range filter
        if let Some(date_range) = filters.date_range {
            let filtered_results = self.vector_db.search_with_date_filter(
                collection,
                query_embedding.clone(),
                date_range,
                top_k
            ).await?;
            search_results.extend(filtered_results);
        }
        
        // Search with source filter
        if let Some(sources) = filters.sources {
            let source_results = self.vector_db.search_with_source_filter(
                collection,
                query_embedding.clone(),
                sources,
                top_k
            ).await?;
            search_results.extend(source_results);
        }
        
        // Deduplicate and merge results
        let merged_results = self.merge_and_deduplicate(search_results).await?;
        
        Ok(merged_results)
    }
}
```

### 4. Response Generation System

```rust
pub struct ResponseGenerator {
    llm_client: Arc<Mutex<OllamaClient>>,
    prompt_templates: PromptTemplateManager,
    response_cache: Arc<RwLock<LruCache<String, GeneratedResponse>>>,
    quality_assessor: QualityAssessor,
}

impl ResponseGenerator {
    pub async fn generate_response(
        &self,
        question: &str,
        retrieved_content: Vec<RetrievedContent>,
        response_style: ResponseStyle
    ) -> Result<GeneratedResponse> {
        // 1. Check cache for similar questions
        let cache_key = self.generate_cache_key(question, &retrieved_content);
        if let Some(cached_response) = self.response_cache.read().await.get(&cache_key) {
            if self.is_cache_valid(cached_response).await {
                return Ok(cached_response.clone());
            }
        }

        // 2. Build context from retrieved content
        let context = self.build_context(retrieved_content).await?;
        
        // 3. Select appropriate prompt template
        let prompt_template = self.prompt_templates
            .get_template_for_style(response_style)?;
        
        // 4. Generate prompt
        let prompt = prompt_template.format(&PromptContext {
            question: question.to_string(),
            context: context.clone(),
            style: response_style,
            max_tokens: 2048,
        })?;

        // 5. Generate response using local LLM
        let llm_response = self.generate_with_llm(prompt).await?;
        
        // 6. Post-process and quality check
        let processed_response = self.post_process_response(llm_response).await?;
        let quality_score = self.quality_assessor
            .assess_response(question, &processed_response, &context).await?;
        
        // 7. Create final response object
        let final_response = GeneratedResponse {
            text: processed_response,
            sources: self.extract_sources_from_context(&context),
            confidence_score: quality_score,
            model_info: ModelInfo {
                name: "llama2-7b-chat".to_string(),
                version: "latest".to_string(),
                parameters: self.get_current_model_params().await?,
            },
            generation_metadata: GenerationMetadata {
                tokens_used: llm_response.tokens_used,
                generation_time: llm_response.generation_time,
                prompt_tokens: llm_response.prompt_tokens,
                completion_tokens: llm_response.completion_tokens,
            },
        };

        // 8. Cache successful response
        if quality_score > 0.7 {
            self.response_cache.write().await.put(cache_key, final_response.clone());
        }

        Ok(final_response)
    }

    async fn generate_with_llm(&self, prompt: String) -> Result<LlmResponse> {
        let client = self.llm_client.lock().await;
        
        let generation_request = GenerateRequest::new(
            "llama2:7b-chat".to_string(),
            prompt
        )
        .with_options(GenerateOptions {
            temperature: Some(0.7),
            top_k: Some(40),
            top_p: Some(0.9),
            repeat_penalty: Some(1.1),
            seed: None,
            num_predict: Some(2048),
            stop: Some(vec!["Human:".to_string(), "Assistant:".to_string()]),
        });

        let response = client.generate(generation_request).await?;
        
        Ok(LlmResponse {
            text: response.response,
            tokens_used: response.eval_count.unwrap_or(0) as usize,
            generation_time: Duration::from_nanos(response.total_duration.unwrap_or(0)),
            prompt_tokens: response.prompt_eval_count.unwrap_or(0) as usize,
            completion_tokens: response.eval_count.unwrap_or(0) as usize,
        })
    }

    async fn build_context(&self, retrieved_content: Vec<RetrievedContent>) -> Result<String> {
        let mut context_builder = ContextBuilder::new();
        
        for content in retrieved_content {
            context_builder.add_source(ContextSource {
                title: content.title,
                content: content.text,
                metadata: content.metadata,
                relevance_score: content.score,
                source_type: content.source_type,
            });
        }

        let context = context_builder
            .with_max_length(4000) // Leave room for question and response
            .with_smart_truncation(true)
            .with_source_attribution(true)
            .build()?;

        Ok(context)
    }
}
```

### 5. Performance Monitoring and Optimization

```rust
pub struct PerformanceMonitor {
    metrics_collector: MetricsCollector,
    resource_monitor: ResourceMonitor,
    optimization_scheduler: OptimizationScheduler,
}

impl PerformanceMonitor {
    pub async fn monitor_rag_performance(&self) -> Result<PerformanceReport> {
        // Collect various performance metrics
        let embedding_metrics = self.collect_embedding_metrics().await?;
        let search_metrics = self.collect_search_metrics().await?;
        let generation_metrics = self.collect_generation_metrics().await?;
        let resource_metrics = self.collect_resource_metrics().await?;

        let report = PerformanceReport {
            timestamp: Utc::now(),
            embedding_performance: EmbeddingPerformance {
                average_embedding_time: embedding_metrics.avg_time,
                embeddings_per_second: embedding_metrics.throughput,
                cache_hit_rate: embedding_metrics.cache_hit_rate,
                memory_usage: embedding_metrics.memory_usage,
            },
            search_performance: SearchPerformance {
                average_search_time: search_metrics.avg_time,
                searches_per_second: search_metrics.throughput,
                index_size: search_metrics.index_size,
                recall_at_k: search_metrics.recall_at_k,
            },
            generation_performance: GenerationPerformance {
                average_generation_time: generation_metrics.avg_time,
                tokens_per_second: generation_metrics.tokens_per_second,
                quality_scores: generation_metrics.quality_distribution,
            },
            system_resources: SystemResources {
                memory_usage: resource_metrics.memory_usage,
                cpu_usage: resource_metrics.cpu_usage,
                disk_usage: resource_metrics.disk_usage,
                gpu_usage: resource_metrics.gpu_usage,
            },
            recommendations: self.generate_optimization_recommendations(&embedding_metrics, &search_metrics, &generation_metrics).await?,
        };

        // Schedule optimizations if needed
        self.schedule_optimizations_if_needed(&report).await?;

        Ok(report)
    }

    async fn generate_optimization_recommendations(
        &self,
        embedding_metrics: &EmbeddingMetrics,
        search_metrics: &SearchMetrics,
        generation_metrics: &GenerationMetrics
    ) -> Result<Vec<OptimizationRecommendation>> {
        let mut recommendations = Vec::new();

        // Embedding optimization recommendations
        if embedding_metrics.cache_hit_rate < 0.8 {
            recommendations.push(OptimizationRecommendation {
                component: "embedding_cache".to_string(),
                action: "increase_cache_size".to_string(),
                priority: Priority::Medium,
                expected_improvement: "20-30% faster embedding generation".to_string(),
            });
        }

        // Search optimization recommendations
        if search_metrics.avg_time > Duration::from_millis(100) {
            recommendations.push(OptimizationRecommendation {
                component: "vector_search".to_string(),
                action: "optimize_index_parameters".to_string(),
                priority: Priority::High,
                expected_improvement: "50% faster search times".to_string(),
            });
        }

        // Generation optimization recommendations
        if generation_metrics.tokens_per_second < 10.0 {
            recommendations.push(OptimizationRecommendation {
                component: "llm_generation".to_string(),
                action: "consider_smaller_model".to_string(),
                priority: Priority::Medium,
                expected_improvement: "2-3x faster generation".to_string(),
            });
        }

        Ok(recommendations)
    }
}
```

This Local RAG Engine specification provides a comprehensive foundation for implementing a high-performance, local RAG system that operates entirely offline while maintaining quality and responsiveness.