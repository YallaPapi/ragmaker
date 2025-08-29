# Local AI Model Integration Architecture

## Overview

The Local AI Model Integration provides a comprehensive system for managing, running, and optimizing AI models entirely locally within the standalone RAGMaker desktop application. This includes embedding models, language models, and specialized processing models.

## Model Management Architecture

```
Local AI Model System
├── Model Manager
│   ├── Model Registry
│   ├── Download Manager
│   ├── Installation Manager
│   └── Version Manager
├── Ollama Integration
│   ├── Ollama Server Manager
│   ├── Model Loading/Unloading
│   ├── Request Queue Manager
│   └── Performance Monitor
├── Embedding Models
│   ├── SentenceTransformers
│   ├── OpenAI Compatible Models
│   ├── Custom Models
│   └── Model Switching
├── Inference Engine
│   ├── Request Dispatcher
│   ├── Load Balancer
│   ├── Caching Layer
│   └── Response Formatter
└── Resource Manager
    ├── Memory Management
    ├── GPU Detection/Usage
    ├── CPU Optimization
    └── Storage Management
```

## Core Model Manager

```rust
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use serde::{Serialize, Deserialize};

pub struct ModelManager {
    ollama_client: Arc<Mutex<OllamaClient>>,
    model_registry: Arc<RwLock<ModelRegistry>>,
    download_manager: DownloadManager,
    resource_monitor: ResourceMonitor,
    performance_tracker: PerformanceTracker,
    models_dir: PathBuf,
}

impl ModelManager {
    pub async fn new(models_dir: PathBuf) -> Result<Self, ModelError> {
        // Initialize Ollama client
        let ollama_client = OllamaClient::new("http://localhost:11434").await?;
        
        // Load existing model registry
        let registry_path = models_dir.join("registry.json");
        let model_registry = if registry_path.exists() {
            ModelRegistry::load_from_file(&registry_path).await?
        } else {
            ModelRegistry::new()
        };

        let manager = Self {
            ollama_client: Arc::new(Mutex::new(ollama_client)),
            model_registry: Arc::new(RwLock::new(model_registry)),
            download_manager: DownloadManager::new(),
            resource_monitor: ResourceMonitor::new(),
            performance_tracker: PerformanceTracker::new(),
            models_dir,
        };

        // Ensure Ollama is running
        manager.ensure_ollama_running().await?;
        
        // Discover and register existing models
        manager.discover_existing_models().await?;

        Ok(manager)
    }

    pub async fn ensure_required_models_available(&self) -> Result<(), ModelError> {
        let system_info = self.resource_monitor.get_system_info().await?;
        let recommended_models = self.get_recommended_models(&system_info).await?;

        for model_config in recommended_models {
            if !self.is_model_available(&model_config.name).await? {
                self.download_and_install_model(model_config).await?;
            }
        }

        Ok(())
    }

    async fn get_recommended_models(&self, system_info: &SystemInfo) -> Result<Vec<ModelConfig>, ModelError> {
        let mut models = Vec::new();

        // Select chat model based on available resources
        let chat_model = match system_info.available_ram_gb {
            ram if ram >= 32 => ModelConfig::llama2_70b_chat(),
            ram if ram >= 16 => ModelConfig::llama2_13b_chat(),
            ram if ram >= 8 => ModelConfig::llama2_7b_chat(),
            ram if ram >= 4 => ModelConfig::phi2_3b(),
            _ => ModelConfig::tinyllama_1b(),
        };
        models.push(chat_model);

        // Select embedding model
        let embedding_model = if system_info.available_ram_gb >= 8 {
            ModelConfig::nomic_embed_text_large()
        } else {
            ModelConfig::all_minilm_l6_v2()
        };
        models.push(embedding_model);

        // Add code model if sufficient resources
        if system_info.available_ram_gb >= 12 {
            models.push(ModelConfig::codellama_7b_instruct());
        }

        Ok(models)
    }

    pub async fn download_and_install_model(&self, model_config: ModelConfig) -> Result<(), ModelError> {
        // Update registry with pending status
        {
            let mut registry = self.model_registry.write().await;
            registry.add_model(model_config.clone(), ModelStatus::Downloading);
        }

        // Download model via Ollama
        let ollama_client = self.ollama_client.lock().await;
        
        let mut download_stream = ollama_client.pull_model(&model_config.name).await?;
        
        while let Some(progress) = download_stream.next().await {
            match progress? {
                PullProgress::Downloading { completed, total } => {
                    let progress_percent = (completed as f64 / total as f64) * 100.0;
                    
                    // Update registry with progress
                    {
                        let mut registry = self.model_registry.write().await;
                        registry.update_download_progress(&model_config.name, progress_percent);
                    }
                    
                    // Notify UI of progress
                    self.notify_download_progress(&model_config.name, progress_percent).await?;
                },
                PullProgress::Complete => {
                    // Update registry with completed status
                    {
                        let mut registry = self.model_registry.write().await;
                        registry.update_model_status(&model_config.name, ModelStatus::Available);
                    }
                    break;
                },
            }
        }

        // Verify model installation
        self.verify_model_installation(&model_config.name).await?;

        Ok(())
    }

    pub async fn load_model(&self, model_name: &str) -> Result<(), ModelError> {
        let ollama_client = self.ollama_client.lock().await;
        
        // Check if model is already loaded
        let loaded_models = ollama_client.list_loaded_models().await?;
        if loaded_models.iter().any(|m| m.name == model_name) {
            return Ok(());
        }

        // Load model into memory
        ollama_client.load_model(model_name).await?;

        // Update registry
        {
            let mut registry = self.model_registry.write().await;
            registry.update_model_status(model_name, ModelStatus::Loaded);
        }

        // Monitor resource usage
        self.resource_monitor.start_monitoring(model_name).await?;

        Ok(())
    }

    pub async fn unload_model(&self, model_name: &str) -> Result<(), ModelError> {
        let ollama_client = self.ollama_client.lock().await;
        
        ollama_client.unload_model(model_name).await?;

        // Update registry
        {
            let mut registry = self.model_registry.write().await;
            registry.update_model_status(model_name, ModelStatus::Available);
        }

        // Stop monitoring
        self.resource_monitor.stop_monitoring(model_name).await?;

        Ok(())
    }

    pub async fn optimize_model_selection(&self, task_type: TaskType) -> Result<String, ModelError> {
        let system_resources = self.resource_monitor.get_current_resources().await?;
        let performance_history = self.performance_tracker.get_history().await?;
        
        let available_models = {
            let registry = self.model_registry.read().await;
            registry.get_models_for_task(task_type)
        };

        // Score models based on performance and resource requirements
        let mut model_scores = Vec::new();
        
        for model in available_models {
            let score = self.calculate_model_score(&model, &system_resources, &performance_history).await?;
            model_scores.push((model.name.clone(), score));
        }

        // Sort by score and return best model
        model_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        model_scores
            .first()
            .map(|(name, _)| name.clone())
            .ok_or(ModelError::NoSuitableModel)
    }

    async fn calculate_model_score(
        &self,
        model: &ModelInfo,
        system_resources: &SystemResources,
        performance_history: &PerformanceHistory,
    ) -> Result<f64, ModelError> {
        let mut score = 0.0;

        // Performance score (40% weight)
        if let Some(perf) = performance_history.get_model_performance(&model.name) {
            score += perf.average_response_time_score() * 0.4;
        }

        // Resource efficiency score (30% weight)
        let memory_efficiency = 1.0 - (model.memory_requirements as f64 / system_resources.available_memory as f64);
        score += memory_efficiency.max(0.0) * 0.3;

        // Quality score (20% weight)
        if let Some(quality) = performance_history.get_quality_metrics(&model.name) {
            score += quality.average_quality_score() * 0.2;
        }

        // Availability score (10% weight)
        let availability_score = if model.status == ModelStatus::Loaded {
            1.0
        } else if model.status == ModelStatus::Available {
            0.8
        } else {
            0.0
        };
        score += availability_score * 0.1;

        Ok(score)
    }
}

// Ollama Integration Layer
pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
    server_process: Option<std::process::Child>,
}

impl OllamaClient {
    pub async fn new(base_url: &str) -> Result<Self, ModelError> {
        let client = reqwest::Client::new();
        
        let ollama_client = Self {
            base_url: base_url.to_string(),
            client,
            server_process: None,
        };

        // Ensure Ollama server is running
        if !ollama_client.is_server_running().await {
            ollama_client.start_server().await?;
        }

        Ok(ollama_client)
    }

    async fn is_server_running(&self) -> bool {
        self.client
            .get(&format!("{}/api/tags", self.base_url))
            .send()
            .await
            .is_ok()
    }

    async fn start_server(&mut self) -> Result<(), ModelError> {
        // Find Ollama executable
        let ollama_path = self.find_ollama_executable()
            .ok_or(ModelError::OllamaNotFound)?;

        // Start Ollama server
        let child = std::process::Command::new(ollama_path)
            .arg("serve")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;

        self.server_process = Some(child);

        // Wait for server to be ready
        for _ in 0..30 {
            if self.is_server_running().await {
                return Ok(());
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }

        Err(ModelError::ServerStartTimeout)
    }

    fn find_ollama_executable(&self) -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            // Check common installation paths on Windows
            let paths = [
                r"C:\Program Files\Ollama\ollama.exe",
                r"C:\Users\%USERNAME%\AppData\Local\Programs\Ollama\ollama.exe",
            ];
            
            for path in paths {
                let expanded_path = PathBuf::from(path.replace("%USERNAME%", &std::env::var("USERNAME").unwrap_or_default()));
                if expanded_path.exists() {
                    return Some(expanded_path);
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let paths = [
                "/usr/local/bin/ollama",
                "/Applications/Ollama.app/Contents/MacOS/ollama",
            ];
            
            for path in paths {
                let path_buf = PathBuf::from(path);
                if path_buf.exists() {
                    return Some(path_buf);
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Check PATH and common locations
            if let Ok(output) = std::process::Command::new("which").arg("ollama").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim();
                    return Some(PathBuf::from(path));
                }
            }

            let paths = [
                "/usr/local/bin/ollama",
                "/usr/bin/ollama",
            ];
            
            for path in paths {
                let path_buf = PathBuf::from(path);
                if path_buf.exists() {
                    return Some(path_buf);
                }
            }
        }

        None
    }

    pub async fn generate_response(&self, request: GenerateRequest) -> Result<GenerateResponse, ModelError> {
        let response = self.client
            .post(&format!("{}/api/generate", self.base_url))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(ModelError::GenerationFailed(response.status().to_string()));
        }

        let generate_response: GenerateResponse = response.json().await?;
        Ok(generate_response)
    }

    pub async fn create_embeddings(&self, request: EmbeddingsRequest) -> Result<EmbeddingsResponse, ModelError> {
        let response = self.client
            .post(&format!("{}/api/embeddings", self.base_url))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(ModelError::EmbeddingFailed(response.status().to_string()));
        }

        let embeddings_response: EmbeddingsResponse = response.json().await?;
        Ok(embeddings_response)
    }
}

// Embedding Model Manager
pub struct EmbeddingModelManager {
    primary_model: Arc<Mutex<Box<dyn EmbeddingModel>>>,
    fallback_models: Vec<Box<dyn EmbeddingModel>>,
    model_cache: Arc<RwLock<LruCache<String, Vec<f32>>>>,
    ollama_client: Arc<Mutex<OllamaClient>>,
}

impl EmbeddingModelManager {
    pub async fn new(ollama_client: Arc<Mutex<OllamaClient>>) -> Result<Self, ModelError> {
        // Initialize primary embedding model
        let primary_model = Box::new(OllamaEmbeddingModel::new(
            ollama_client.clone(),
            "nomic-embed-text".to_string(),
        ));

        // Initialize fallback models
        let fallback_models = vec![
            Box::new(SentenceTransformerModel::new("all-MiniLM-L6-v2").await?),
            Box::new(SentenceTransformerModel::new("paraphrase-albert-small-v2").await?),
        ];

        Ok(Self {
            primary_model: Arc::new(Mutex::new(primary_model)),
            fallback_models,
            model_cache: Arc::new(RwLock::new(LruCache::new(10000))),
            ollama_client,
        })
    }

    pub async fn generate_embeddings(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, ModelError> {
        // Check cache first
        let mut cached_embeddings = HashMap::new();
        let mut texts_to_process = Vec::new();

        {
            let cache = self.model_cache.read().await;
            for (index, text) in texts.iter().enumerate() {
                let cache_key = self.generate_cache_key(text);
                if let Some(embedding) = cache.get(&cache_key) {
                    cached_embeddings.insert(index, embedding.clone());
                } else {
                    texts_to_process.push((index, text.clone()));
                }
            }
        }

        // Generate embeddings for uncached texts
        let mut new_embeddings = HashMap::new();
        if !texts_to_process.is_empty() {
            let batch_texts: Vec<String> = texts_to_process.iter().map(|(_, text)| text.clone()).collect();
            
            // Try primary model
            match self.generate_with_primary_model(&batch_texts).await {
                Ok(embeddings) => {
                    for ((index, text), embedding) in texts_to_process.iter().zip(embeddings.iter()) {
                        new_embeddings.insert(*index, embedding.clone());
                        
                        // Cache the result
                        let cache_key = self.generate_cache_key(text);
                        self.model_cache.write().await.put(cache_key, embedding.clone());
                    }
                },
                Err(_) => {
                    // Try fallback models
                    for fallback_model in &self.fallback_models {
                        match fallback_model.generate_embeddings(&batch_texts).await {
                            Ok(embeddings) => {
                                for ((index, text), embedding) in texts_to_process.iter().zip(embeddings.iter()) {
                                    new_embeddings.insert(*index, embedding.clone());
                                    
                                    let cache_key = self.generate_cache_key(text);
                                    self.model_cache.write().await.put(cache_key, embedding.clone());
                                }
                                break;
                            },
                            Err(_) => continue,
                        }
                    }
                }
            }
        }

        // Combine cached and new embeddings
        let mut final_embeddings = Vec::new();
        for i in 0..texts.len() {
            if let Some(embedding) = cached_embeddings.get(&i) {
                final_embeddings.push(embedding.clone());
            } else if let Some(embedding) = new_embeddings.get(&i) {
                final_embeddings.push(embedding.clone());
            } else {
                return Err(ModelError::EmbeddingGenerationFailed);
            }
        }

        Ok(final_embeddings)
    }

    async fn generate_with_primary_model(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ModelError> {
        let model = self.primary_model.lock().await;
        model.generate_embeddings(texts).await
    }

    fn generate_cache_key(&self, text: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        format!("embed_{}", hasher.finish())
    }
}

#[async_trait]
pub trait EmbeddingModel: Send + Sync {
    async fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ModelError>;
    fn model_name(&self) -> &str;
    fn embedding_dimensions(&self) -> usize;
}

pub struct OllamaEmbeddingModel {
    ollama_client: Arc<Mutex<OllamaClient>>,
    model_name: String,
    dimensions: usize,
}

#[async_trait]
impl EmbeddingModel for OllamaEmbeddingModel {
    async fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ModelError> {
        let client = self.ollama_client.lock().await;
        let mut embeddings = Vec::new();

        for text in texts {
            let request = EmbeddingsRequest {
                model: self.model_name.clone(),
                prompt: text.clone(),
            };

            let response = client.create_embeddings(request).await?;
            embeddings.push(response.embedding);
        }

        Ok(embeddings)
    }

    fn model_name(&self) -> &str {
        &self.model_name
    }

    fn embedding_dimensions(&self) -> usize {
        self.dimensions
    }
}

// Performance Monitoring and Optimization
pub struct ResourceMonitor {
    system_info: Arc<RwLock<SystemInfo>>,
    monitoring_tasks: HashMap<String, tokio::task::JoinHandle<()>>,
}

impl ResourceMonitor {
    pub fn new() -> Self {
        Self {
            system_info: Arc::new(RwLock::new(SystemInfo::default())),
            monitoring_tasks: HashMap::new(),
        }
    }

    pub async fn get_system_info(&self) -> Result<SystemInfo, ModelError> {
        let system_info = self.system_info.read().await.clone();
        Ok(system_info)
    }

    pub async fn start_monitoring(&mut self, model_name: &str) -> Result<(), ModelError> {
        let model_name = model_name.to_string();
        let system_info = Arc::clone(&self.system_info);

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
            
            loop {
                interval.tick().await;
                
                // Update system information
                let mut info = system_info.write().await;
                info.update_current_stats().await;
            }
        });

        self.monitoring_tasks.insert(model_name, handle);
        Ok(())
    }

    pub async fn stop_monitoring(&mut self, model_name: &str) -> Result<(), ModelError> {
        if let Some(handle) = self.monitoring_tasks.remove(model_name) {
            handle.abort();
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct SystemInfo {
    pub total_memory: u64,
    pub available_memory: u64,
    pub available_ram_gb: u64,
    pub cpu_count: usize,
    pub gpu_available: bool,
    pub gpu_memory: Option<u64>,
}

impl SystemInfo {
    async fn update_current_stats(&mut self) {
        // Update memory statistics
        if let Ok(memory) = sysinfo::System::new_all().total_memory() {
            self.total_memory = memory;
        }
        
        if let Ok(memory) = sysinfo::System::new_all().available_memory() {
            self.available_memory = memory;
            self.available_ram_gb = memory / 1_073_741_824; // Convert to GB
        }

        // Update CPU information
        self.cpu_count = num_cpus::get();

        // Update GPU information (simplified)
        self.gpu_available = self.detect_gpu().await;
    }

    async fn detect_gpu(&self) -> bool {
        // Simplified GPU detection - in real implementation, use appropriate GPU libraries
        #[cfg(feature = "cuda")]
        {
            // Check for CUDA availability
            return cudarc::driver::CudaDevice::new(0).is_ok();
        }

        #[cfg(feature = "rocm")]
        {
            // Check for ROCm availability
            return false; // Implement ROCm detection
        }

        false
    }
}
```

This Local AI Model Integration specification provides a comprehensive framework for managing and running AI models locally, ensuring optimal performance while maintaining full offline capability.