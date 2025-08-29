# Local YouTube Processor Technical Specification

## Overview

The Local YouTube Processor handles all YouTube content extraction, transcript processing, and metadata management without relying on external APIs beyond the initial video discovery phase.

## Architecture Components

### 1. Video Discovery and Metadata Extraction

```rust
pub struct VideoDiscoveryEngine {
    youtube_api_client: Option<YouTubeApiClient>,
    web_scraper: WebScraper,
    channel_cache: Arc<RwLock<ChannelCache>>,
    rate_limiter: RateLimiter,
}

impl VideoDiscoveryEngine {
    pub async fn discover_channel_videos(&self, channel_identifier: &str) -> Result<Vec<VideoMetadata>> {
        // Try multiple discovery methods in order of preference
        let discovery_methods = vec![
            DiscoveryMethod::YoutubeApi,
            DiscoveryMethod::WebScraping,
            DiscoveryMethod::RSSFeed,
            DiscoveryMethod::CachedData,
        ];

        for method in discovery_methods {
            match self.discover_with_method(channel_identifier, method).await {
                Ok(videos) => return Ok(videos),
                Err(e) => {
                    log::warn!("Discovery method {:?} failed: {}", method, e);
                    continue;
                }
            }
        }

        Err(DiscoveryError::AllMethodsFailed)
    }

    async fn discover_with_method(
        &self, 
        channel_identifier: &str, 
        method: DiscoveryMethod
    ) -> Result<Vec<VideoMetadata>> {
        match method {
            DiscoveryMethod::YoutubeApi => {
                if let Some(api_client) = &self.youtube_api_client {
                    self.discover_via_api(api_client, channel_identifier).await
                } else {
                    Err(DiscoveryError::ApiClientNotAvailable)
                }
            },
            DiscoveryMethod::WebScraping => {
                self.discover_via_scraping(channel_identifier).await
            },
            DiscoveryMethod::RSSFeed => {
                self.discover_via_rss(channel_identifier).await
            },
            DiscoveryMethod::CachedData => {
                self.discover_from_cache(channel_identifier).await
            },
        }
    }

    async fn discover_via_scraping(&self, channel_identifier: &str) -> Result<Vec<VideoMetadata>> {
        // Use yt-dlp or similar tool for robust video discovery
        let channel_url = self.resolve_channel_url(channel_identifier)?;
        
        let scrape_command = Command::new("yt-dlp")
            .args([
                "--quiet",
                "--no-warnings",
                "--dump-json",
                "--flat-playlist",
                "--playlist-end", "1000", // Limit to first 1000 videos
                &channel_url
            ])
            .output()
            .await?;

        if !scrape_command.status.success() {
            return Err(DiscoveryError::ScrapeCommandFailed);
        }

        let output = String::from_utf8_lossy(&scrape_command.stdout);
        let mut videos = Vec::new();

        for line in output.lines() {
            if let Ok(video_data) = serde_json::from_str::<VideoData>(line) {
                videos.push(VideoMetadata {
                    id: video_data.id,
                    title: video_data.title,
                    description: video_data.description,
                    upload_date: video_data.upload_date,
                    duration: video_data.duration,
                    view_count: video_data.view_count,
                    thumbnail_url: video_data.thumbnail,
                    url: format!("https://www.youtube.com/watch?v={}", video_data.id),
                });
            }
        }

        // Cache the results for future use
        self.cache_channel_videos(channel_identifier, &videos).await?;

        Ok(videos)
    }

    async fn discover_via_rss(&self, channel_identifier: &str) -> Result<Vec<VideoMetadata>> {
        let channel_id = self.resolve_channel_id(channel_identifier).await?;
        let rss_url = format!("https://www.youtube.com/feeds/videos.xml?channel_id={}", channel_id);
        
        let rss_content = reqwest::get(&rss_url)
            .await?
            .text()
            .await?;

        let feed = rss::Channel::read_from(rss_content.as_bytes())?;
        let mut videos = Vec::new();

        for item in feed.items() {
            if let Some(video_id) = self.extract_video_id_from_link(item.link()) {
                videos.push(VideoMetadata {
                    id: video_id.clone(),
                    title: item.title().unwrap_or("Unknown").to_string(),
                    description: item.description().unwrap_or("").to_string(),
                    upload_date: item.pub_date()
                        .and_then(|date| DateTime::parse_from_rfc2822(date).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                    url: format!("https://www.youtube.com/watch?v={}", video_id),
                    ..Default::default()
                });
            }
        }

        Ok(videos)
    }
}
```

### 2. Local Transcript Extraction

```rust
pub struct TranscriptExtractor {
    extractor_engines: Vec<Box<dyn TranscriptEngine>>,
    transcript_cache: Arc<RwLock<TranscriptCache>>,
    quality_assessor: TranscriptQualityAssessor,
    language_detector: LanguageDetector,
}

impl TranscriptExtractor {
    pub async fn new() -> Result<Self> {
        let engines: Vec<Box<dyn TranscriptEngine>> = vec![
            Box::new(YtDlpEngine::new().await?),
            Box::new(YoutubeTranscriptApiEngine::new()),
            Box::new(WhisperEngine::new().await?),
            Box::new(CachedTranscriptEngine::new()),
        ];

        Ok(Self {
            extractor_engines: engines,
            transcript_cache: Arc::new(RwLock::new(TranscriptCache::new())),
            quality_assessor: TranscriptQualityAssessor::new(),
            language_detector: LanguageDetector::new(),
        })
    }

    pub async fn extract_transcript(&self, video_id: &str) -> Result<ExtractedTranscript> {
        // Check cache first
        if let Some(cached_transcript) = self.get_cached_transcript(video_id).await? {
            return Ok(cached_transcript);
        }

        // Try each extraction engine in order of reliability
        for engine in &self.extractor_engines {
            match engine.extract_transcript(video_id).await {
                Ok(raw_transcript) => {
                    // Assess transcript quality
                    let quality_score = self.quality_assessor
                        .assess_quality(&raw_transcript).await?;

                    if quality_score >= QualityThreshold::Acceptable {
                        // Process and enhance transcript
                        let processed_transcript = self.process_transcript(raw_transcript).await?;
                        
                        // Cache successful extraction
                        self.cache_transcript(video_id, &processed_transcript).await?;
                        
                        return Ok(processed_transcript);
                    }
                },
                Err(e) => {
                    log::warn!("Transcript extraction failed with engine {}: {}", 
                              engine.name(), e);
                    continue;
                }
            }
        }

        Err(TranscriptError::AllEnginesFailed)
    }

    async fn process_transcript(&self, raw_transcript: RawTranscript) -> Result<ExtractedTranscript> {
        // 1. Detect primary language
        let detected_language = self.language_detector
            .detect_language(&raw_transcript.text).await?;

        // 2. Clean and normalize text
        let cleaned_text = self.clean_transcript_text(&raw_transcript.text).await?;

        // 3. Extract and validate timestamps
        let validated_segments = self.validate_segments(&raw_transcript.segments).await?;

        // 4. Extract chapter markers if available
        let chapters = self.extract_chapters(&validated_segments).await?;

        // 5. Generate content summary
        let summary = self.generate_content_summary(&cleaned_text).await?;

        Ok(ExtractedTranscript {
            video_id: raw_transcript.video_id,
            text: cleaned_text,
            segments: validated_segments,
            language: detected_language,
            chapters: chapters,
            summary: summary,
            extraction_method: raw_transcript.extraction_method,
            extraction_timestamp: Utc::now(),
            quality_score: self.quality_assessor.assess_quality(&raw_transcript).await?,
        })
    }

    async fn clean_transcript_text(&self, text: &str) -> Result<String> {
        let mut cleaned = text.to_string();

        // Remove common transcript artifacts
        let cleaning_patterns = vec![
            (r"\[Music\]", ""),
            (r"\[Applause\]", ""),
            (r"\[Laughter\]", ""),
            (r">> ", ""),
            (r"♪.*♪", ""),
            (r"\s+", " "), // Normalize whitespace
        ];

        for (pattern, replacement) in cleaning_patterns {
            let regex = Regex::new(pattern)?;
            cleaned = regex.replace_all(&cleaned, replacement).to_string();
        }

        // Fix common transcription errors
        cleaned = self.fix_common_errors(cleaned).await?;

        Ok(cleaned.trim().to_string())
    }

    async fn fix_common_errors(&self, text: String) -> Result<String> {
        // Use a local language model or rule-based system to fix common errors
        let error_corrections = HashMap::from([
            ("dont", "don't"),
            ("cant", "can't"),
            ("wont", "won't"),
            ("isnt", "isn't"),
            ("arent", "aren't"),
            ("wasnt", "wasn't"),
            ("werent", "weren't"),
            ("hasnt", "hasn't"),
            ("havent", "haven't"),
            ("hadnt", "hadn't"),
            ("wouldnt", "wouldn't"),
            ("couldnt", "couldn't"),
            ("shouldnt", "shouldn't"),
        ]);

        let mut corrected = text;
        for (error, correction) in error_corrections {
            corrected = corrected.replace(error, correction);
        }

        Ok(corrected)
    }
}

#[async_trait]
pub trait TranscriptEngine: Send + Sync {
    fn name(&self) -> &'static str;
    async fn extract_transcript(&self, video_id: &str) -> Result<RawTranscript>;
    async fn is_available(&self) -> bool;
}

pub struct YtDlpEngine {
    executable_path: PathBuf,
}

#[async_trait]
impl TranscriptEngine for YtDlpEngine {
    fn name(&self) -> &'static str {
        "yt-dlp"
    }

    async fn extract_transcript(&self, video_id: &str) -> Result<RawTranscript> {
        let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
        
        let output = Command::new(&self.executable_path)
            .args([
                "--write-auto-sub",
                "--write-sub",
                "--sub-format", "vtt",
                "--skip-download",
                "--output", "%(title)s.%(ext)s",
                &video_url
            ])
            .output()
            .await?;

        if !output.status.success() {
            return Err(TranscriptError::ExtractionFailed(
                String::from_utf8_lossy(&output.stderr).to_string()
            ));
        }

        // Parse VTT file
        let vtt_content = self.find_and_read_vtt_file(video_id).await?;
        let parsed_transcript = self.parse_vtt_content(&vtt_content).await?;

        Ok(RawTranscript {
            video_id: video_id.to_string(),
            text: parsed_transcript.text,
            segments: parsed_transcript.segments,
            extraction_method: "yt-dlp".to_string(),
            raw_data: Some(vtt_content),
        })
    }

    async fn is_available(&self) -> bool {
        self.executable_path.exists()
    }
}

pub struct WhisperEngine {
    model_path: PathBuf,
    whisper_executable: PathBuf,
}

#[async_trait]
impl TranscriptEngine for WhisperEngine {
    fn name(&self) -> &'static str {
        "whisper"
    }

    async fn extract_transcript(&self, video_id: &str) -> Result<RawTranscript> {
        // First, download audio using yt-dlp
        let audio_path = self.download_audio(video_id).await?;
        
        // Run Whisper transcription
        let transcript_output = Command::new(&self.whisper_executable)
            .args([
                &audio_path.to_string_lossy(),
                "--model", "base",
                "--output_format", "json",
                "--language", "en",
                "--word_timestamps", "true"
            ])
            .output()
            .await?;

        if !transcript_output.status.success() {
            return Err(TranscriptError::WhisperFailed(
                String::from_utf8_lossy(&transcript_output.stderr).to_string()
            ));
        }

        // Parse Whisper JSON output
        let json_output = String::from_utf8_lossy(&transcript_output.stdout);
        let whisper_result: WhisperResult = serde_json::from_str(&json_output)?;

        // Convert to our format
        let segments = whisper_result.segments.into_iter().map(|seg| {
            TranscriptSegment {
                start_time: Duration::from_secs_f64(seg.start),
                end_time: Duration::from_secs_f64(seg.end),
                text: seg.text,
                confidence: Some(seg.avg_logprob.exp()),
            }
        }).collect();

        let full_text = segments.iter()
            .map(|s| s.text.clone())
            .collect::<Vec<_>>()
            .join(" ");

        // Clean up temporary audio file
        tokio::fs::remove_file(audio_path).await?;

        Ok(RawTranscript {
            video_id: video_id.to_string(),
            text: full_text,
            segments,
            extraction_method: "whisper".to_string(),
            raw_data: Some(json_output.to_string()),
        })
    }

    async fn is_available(&self) -> bool {
        self.whisper_executable.exists() && self.model_path.exists()
    }
}
```

### 3. Content Processing and Chunking

```rust
pub struct ContentProcessor {
    chunking_strategy: ChunkingStrategy,
    content_enhancer: ContentEnhancer,
    metadata_extractor: MetadataExtractor,
    quality_filter: QualityFilter,
}

impl ContentProcessor {
    pub async fn process_transcript(
        &self, 
        transcript: ExtractedTranscript,
        video_metadata: VideoMetadata
    ) -> Result<ProcessedContent> {
        // 1. Enhance content quality
        let enhanced_transcript = self.content_enhancer
            .enhance_transcript(&transcript).await?;

        // 2. Extract additional metadata
        let content_metadata = self.metadata_extractor
            .extract_from_transcript(&enhanced_transcript, &video_metadata).await?;

        // 3. Apply intelligent chunking
        let chunks = self.chunking_strategy
            .chunk_content(&enhanced_transcript, &content_metadata).await?;

        // 4. Filter low-quality chunks
        let filtered_chunks = self.quality_filter
            .filter_chunks(chunks).await?;

        // 5. Enrich chunks with context
        let enriched_chunks = self.enrich_chunks_with_context(
            filtered_chunks, 
            &enhanced_transcript,
            &content_metadata
        ).await?;

        Ok(ProcessedContent {
            video_id: transcript.video_id,
            original_transcript: enhanced_transcript,
            metadata: content_metadata,
            chunks: enriched_chunks,
            processing_timestamp: Utc::now(),
            processing_stats: self.generate_processing_stats(&enriched_chunks),
        })
    }

    async fn enrich_chunks_with_context(
        &self,
        chunks: Vec<ContentChunk>,
        transcript: &ExtractedTranscript,
        metadata: &ContentMetadata
    ) -> Result<Vec<EnrichedChunk>> {
        let mut enriched_chunks = Vec::new();

        for (index, chunk) in chunks.into_iter().enumerate() {
            let enriched_chunk = EnrichedChunk {
                id: format!("{}_chunk_{}", transcript.video_id, index),
                content: chunk.text.clone(),
                start_timestamp: chunk.start_timestamp,
                end_timestamp: chunk.end_timestamp,
                
                // Add contextual information
                video_context: VideoContext {
                    video_id: transcript.video_id.clone(),
                    video_title: metadata.title.clone(),
                    channel_name: metadata.channel_name.clone(),
                    upload_date: metadata.upload_date,
                    video_url: metadata.video_url.clone(),
                },
                
                // Add semantic information
                semantic_context: SemanticContext {
                    topics: self.extract_topics(&chunk.text).await?,
                    entities: self.extract_entities(&chunk.text).await?,
                    sentiment: self.analyze_sentiment(&chunk.text).await?,
                    concepts: self.extract_concepts(&chunk.text).await?,
                },
                
                // Add positional context
                positional_context: PositionalContext {
                    chunk_index: index,
                    total_chunks: chunks.len(),
                    relative_position: index as f32 / chunks.len() as f32,
                    preceding_chunks: self.get_context_window(&chunks, index, -2),
                    following_chunks: self.get_context_window(&chunks, index, 2),
                },
                
                // Add quality metrics
                quality_metrics: QualityMetrics {
                    readability_score: self.calculate_readability(&chunk.text).await?,
                    information_density: self.calculate_information_density(&chunk.text).await?,
                    coherence_score: self.calculate_coherence(&chunk.text).await?,
                    completeness_score: self.calculate_completeness(&chunk).await?,
                },
                
                // Add embedding metadata (to be filled later)
                embedding_metadata: EmbeddingMetadata {
                    embedding_model: None,
                    embedding_version: None,
                    embedding_timestamp: None,
                    embedding_dimensions: None,
                },
            };

            enriched_chunks.push(enriched_chunk);
        }

        Ok(enriched_chunks)
    }
}

pub enum ChunkingStrategy {
    Semantic,
    Temporal,
    Hybrid,
    FixedSize,
}

impl ChunkingStrategy {
    pub async fn chunk_content(
        &self,
        transcript: &ExtractedTranscript,
        metadata: &ContentMetadata
    ) -> Result<Vec<ContentChunk>> {
        match self {
            ChunkingStrategy::Semantic => {
                self.semantic_chunking(transcript, metadata).await
            },
            ChunkingStrategy::Temporal => {
                self.temporal_chunking(transcript, metadata).await
            },
            ChunkingStrategy::Hybrid => {
                self.hybrid_chunking(transcript, metadata).await
            },
            ChunkingStrategy::FixedSize => {
                self.fixed_size_chunking(transcript, metadata).await
            },
        }
    }

    async fn semantic_chunking(
        &self,
        transcript: &ExtractedTranscript,
        metadata: &ContentMetadata
    ) -> Result<Vec<ContentChunk>> {
        // Use local NLP models to identify semantic boundaries
        let sentence_boundaries = self.detect_sentence_boundaries(&transcript.text).await?;
        let topic_changes = self.detect_topic_changes(&transcript.text).await?;
        let narrative_breaks = self.detect_narrative_breaks(&transcript.segments).await?;

        // Combine all boundary signals
        let mut chunk_boundaries = Vec::new();
        chunk_boundaries.extend(sentence_boundaries);
        chunk_boundaries.extend(topic_changes);
        chunk_boundaries.extend(narrative_breaks);

        // Sort and deduplicate boundaries
        chunk_boundaries.sort_unstable();
        chunk_boundaries.dedup();

        // Create chunks based on boundaries
        let mut chunks = Vec::new();
        let mut current_start = 0;

        for boundary in chunk_boundaries {
            if boundary > current_start {
                let chunk_text = transcript.text[current_start..boundary].to_string();
                
                // Find corresponding timestamp segments
                let (start_time, end_time) = self.find_timestamp_range(
                    &transcript.segments,
                    current_start,
                    boundary
                ).await?;

                chunks.push(ContentChunk {
                    text: chunk_text.trim().to_string(),
                    start_timestamp: start_time,
                    end_timestamp: end_time,
                    char_start: current_start,
                    char_end: boundary,
                    chunk_type: ChunkType::Semantic,
                });

                current_start = boundary;
            }
        }

        // Add final chunk if needed
        if current_start < transcript.text.len() {
            let chunk_text = transcript.text[current_start..].to_string();
            let (start_time, end_time) = self.find_timestamp_range(
                &transcript.segments,
                current_start,
                transcript.text.len()
            ).await?;

            chunks.push(ContentChunk {
                text: chunk_text.trim().to_string(),
                start_timestamp: start_time,
                end_timestamp: end_time,
                char_start: current_start,
                char_end: transcript.text.len(),
                chunk_type: ChunkType::Semantic,
            });
        }

        // Filter out very short or very long chunks
        let filtered_chunks = chunks.into_iter()
            .filter(|chunk| {
                chunk.text.len() >= 50 && chunk.text.len() <= 2000
            })
            .collect();

        Ok(filtered_chunks)
    }

    async fn temporal_chunking(
        &self,
        transcript: &ExtractedTranscript,
        _metadata: &ContentMetadata
    ) -> Result<Vec<ContentChunk>> {
        // Use chapter markers or fixed time intervals
        let chunk_duration = Duration::from_secs(120); // 2-minute chunks
        let mut chunks = Vec::new();
        let mut current_time = Duration::from_secs(0);

        while current_time < self.get_total_duration(&transcript.segments) {
            let end_time = current_time + chunk_duration;
            
            // Find segments in this time range
            let segments_in_range: Vec<&TranscriptSegment> = transcript.segments
                .iter()
                .filter(|seg| {
                    seg.start_time >= current_time && seg.start_time < end_time
                })
                .collect();

            if !segments_in_range.is_empty() {
                let chunk_text = segments_in_range
                    .iter()
                    .map(|seg| seg.text.clone())
                    .collect::<Vec<_>>()
                    .join(" ");

                chunks.push(ContentChunk {
                    text: chunk_text,
                    start_timestamp: Some(current_time),
                    end_timestamp: Some(end_time),
                    char_start: 0, // Not applicable for temporal chunking
                    char_end: 0,
                    chunk_type: ChunkType::Temporal,
                });
            }

            current_time = end_time;
        }

        Ok(chunks)
    }
}
```

### 4. Batch Processing System

```rust
pub struct BatchProcessor {
    processing_queue: Arc<Mutex<VecDeque<ProcessingJob>>>,
    worker_pool: Arc<ThreadPool>,
    progress_tracker: Arc<RwLock<BatchProgress>>,
    result_handler: BatchResultHandler,
}

impl BatchProcessor {
    pub async fn process_channel_batch(
        &self,
        channel_id: &str,
        video_ids: Vec<String>,
        processing_options: ProcessingOptions
    ) -> Result<BatchProcessingResult> {
        // Create processing jobs for each video
        let jobs: Vec<ProcessingJob> = video_ids.into_iter()
            .enumerate()
            .map(|(index, video_id)| {
                ProcessingJob {
                    id: format!("{}_video_{}", channel_id, index),
                    video_id,
                    channel_id: channel_id.to_string(),
                    priority: processing_options.priority,
                    retry_count: 0,
                    max_retries: processing_options.max_retries,
                    timeout: processing_options.timeout,
                }
            })
            .collect();

        // Initialize progress tracking
        self.progress_tracker.write().await.init_batch(
            channel_id.to_string(),
            jobs.len()
        );

        // Queue all jobs
        {
            let mut queue = self.processing_queue.lock().await;
            for job in jobs {
                queue.push_back(job);
            }
        }

        // Start processing workers
        let worker_handles = self.spawn_processing_workers(processing_options.worker_count).await?;

        // Wait for completion or timeout
        let result = self.wait_for_batch_completion(channel_id, processing_options.batch_timeout).await?;

        // Clean up workers
        for handle in worker_handles {
            handle.abort();
        }

        Ok(result)
    }

    async fn spawn_processing_workers(&self, worker_count: usize) -> Result<Vec<JoinHandle<()>>> {
        let mut handles = Vec::new();

        for worker_id in 0..worker_count {
            let queue = Arc::clone(&self.processing_queue);
            let progress_tracker = Arc::clone(&self.progress_tracker);
            let result_handler = self.result_handler.clone();

            let handle = tokio::spawn(async move {
                loop {
                    // Get next job from queue
                    let job = {
                        let mut queue_guard = queue.lock().await;
                        queue_guard.pop_front()
                    };

                    match job {
                        Some(job) => {
                            // Process the job
                            let result = Self::process_single_video(job.clone()).await;
                            
                            // Handle result
                            result_handler.handle_result(job, result).await;
                            
                            // Update progress
                            progress_tracker.write().await.increment_processed();
                        },
                        None => {
                            // No jobs available, sleep briefly
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                    }
                }
            });

            handles.push(handle);
        }

        Ok(handles)
    }

    async fn process_single_video(job: ProcessingJob) -> Result<ProcessedVideoResult> {
        let start_time = Instant::now();
        
        // 1. Extract video metadata
        let video_metadata = VideoDiscoveryEngine::get_video_metadata(&job.video_id).await?;
        
        // 2. Extract transcript
        let transcript = TranscriptExtractor::extract_transcript(&job.video_id).await?;
        
        // 3. Process content
        let processed_content = ContentProcessor::process_transcript(transcript, video_metadata).await?;
        
        // 4. Generate embeddings
        let embeddings = EmbeddingGenerator::generate_embeddings(&processed_content).await?;
        
        // 5. Store results
        let storage_result = LocalStorage::store_processed_video(&processed_content, embeddings).await?;

        Ok(ProcessedVideoResult {
            job_id: job.id,
            video_id: job.video_id,
            processing_time: start_time.elapsed(),
            chunks_generated: processed_content.chunks.len(),
            embeddings_generated: embeddings.len(),
            storage_location: storage_result.location,
            success: true,
            error: None,
        })
    }
}
```

This Local YouTube Processor specification provides a comprehensive system for extracting, processing, and managing YouTube content entirely locally while maintaining reliability and performance.