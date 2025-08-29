const axios = require('axios');

class OllamaService {
  constructor(options = {}) {
    this.config = {
      baseUrl: options.baseUrl || 'http://localhost:11434',
      defaultModel: options.defaultModel || 'llama3.2:3b',
      timeout: options.timeout || 30000, // 30 seconds
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000 // 1 second
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];
      
      return {
        status: 'healthy',
        baseUrl: this.config.baseUrl,
        modelsAvailable: models.length,
        models: models.map(m => ({
          name: m.name,
          size: m.size,
          modified_at: m.modified_at
        })),
        defaultModel: this.config.defaultModel,
        defaultModelAvailable: models.some(m => m.name === this.config.defaultModel)
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        baseUrl: this.config.baseUrl,
        error: error.message,
        suggestion: 'Make sure Ollama is running and accessible'
      };
    }
  }

  async listModels() {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models || [];
    } catch (error) {
      console.error('Error listing Ollama models:', error);
      throw new Error('Failed to list models: ' + error.message);
    }
  }

  async pullModel(modelName, progressCallback = null) {
    try {
      const response = await this.client.post('/api/pull', {
        name: modelName
      });

      if (progressCallback) {
        progressCallback({
          model: modelName,
          status: 'pulling',
          message: 'Started pulling model: ' + modelName
        });
      }

      return {
        success: true,
        model: modelName,
        message: 'Model pull initiated'
      };
    } catch (error) {
      console.error('Error pulling model:', error);
      throw new Error('Failed to pull model ' + modelName + ': ' + error.message);
    }
  }

  async deleteModel(modelName) {
    try {
      await this.client.delete('/api/delete', {
        data: { name: modelName }
      });
      
      return {
        success: true,
        model: modelName,
        message: 'Model deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting model:', error);
      throw new Error('Failed to delete model ' + modelName + ': ' + error.message);
    }
  }

  async generate(prompt, model = null, options = {}) {
    model = model || this.config.defaultModel;
    
    const requestData = {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        num_predict: options.max_tokens || 1000,
        ...options.ollamaOptions
      }
    };

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.post('/api/generate', requestData);
      });

      return {
        response: response.data.response,
        model: model,
        done: response.data.done,
        context: response.data.context,
        total_duration: response.data.total_duration,
        load_duration: response.data.load_duration,
        prompt_eval_count: response.data.prompt_eval_count,
        prompt_eval_duration: response.data.prompt_eval_duration,
        eval_count: response.data.eval_count,
        eval_duration: response.data.eval_duration
      };
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Generation failed: ' + error.message);
    }
  }

  async chat(messages, options = {}) {
    const model = options.model || this.config.defaultModel;
    
    const requestData = {
      model: model,
      messages: messages,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        num_predict: options.max_tokens || 2000,
        ...options.ollamaOptions
      }
    };

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.post('/api/chat', requestData);
      });

      return {
        message: response.data.message,
        model: model,
        done: response.data.done,
        total_duration: response.data.total_duration,
        load_duration: response.data.load_duration,
        prompt_eval_count: response.data.prompt_eval_count,
        prompt_eval_duration: response.data.prompt_eval_duration,
        eval_count: response.data.eval_count,
        eval_duration: response.data.eval_duration
      };
    } catch (error) {
      console.error('Error in chat completion:', error);
      throw new Error('Chat completion failed: ' + error.message);
    }
  }

  async chatStream(messages, options = {}, onMessage = null) {
    const model = options.model || this.config.defaultModel;
    
    const requestData = {
      model: model,
      messages: messages,
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        num_predict: options.max_tokens || 2000,
        ...options.ollamaOptions
      }
    };

    try {
      const response = await this.client.post('/api/chat', requestData, {
        responseType: 'stream'
      });

      let fullResponse = '';
      
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          try {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              const data = JSON.parse(line);
              
              if (data.message && data.message.content) {
                fullResponse += data.message.content;
                
                if (onMessage) {
                  onMessage({
                    content: data.message.content,
                    delta: data.message.content,
                    done: data.done
                  });
                }
              }
              
              if (data.done) {
                resolve({
                  message: {
                    role: 'assistant',
                    content: fullResponse
                  },
                  model: model,
                  done: true,
                  total_duration: data.total_duration,
                  load_duration: data.load_duration,
                  prompt_eval_count: data.prompt_eval_count,
                  prompt_eval_duration: data.prompt_eval_duration,
                  eval_count: data.eval_count,
                  eval_duration: data.eval_duration
                });
              }
            }
          } catch (parseError) {
            console.error('Error parsing stream chunk:', parseError);
          }
        });

        response.data.on('error', (error) => {
          reject(new Error('Stream error: ' + error.message));
        });

        response.data.on('end', () => {
          if (fullResponse) {
            resolve({
              message: {
                role: 'assistant',
                content: fullResponse
              },
              model: model,
              done: true
            });
          }
        });
      });
    } catch (error) {
      console.error('Error in streaming chat:', error);
      throw new Error('Streaming chat failed: ' + error.message);
    }
  }

  async embed(text, model = 'nomic-embed-text') {
    const requestData = {
      model: model,
      prompt: text
    };

    try {
      const response = await this.retryRequest(async () => {
        return await this.client.post('/api/embeddings', requestData);
      });

      return {
        embedding: response.data.embedding,
        model: model
      };
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error('Embedding failed: ' + error.message);
    }
  }

  async retryRequest(requestFn) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.maxRetries) {
          console.log('Request attempt ' + attempt + ' failed, retrying in ' + this.config.retryDelay + 'ms...');
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }
    
    throw lastError;
  }

  // Model management helpers
  async ensureModelAvailable(modelName) {
    try {
      const models = await this.listModels();
      const modelExists = models.some(m => m.name === modelName);
      
      if (!modelExists) {
        console.log(`Model \${modelName} not found, attempting to pull...`);
        await this.pullModel(modelName);
        
        // Wait a bit for the model to be available
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verify the model is now available
        const updatedModels = await this.listModels();
        const nowExists = updatedModels.some(m => m.name === modelName);
        
        if (!nowExists) {
          throw new Error(`Failed to pull model \${modelName}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error ensuring model \${modelName} is available:`, error);
      throw error;
    }
  }

  async getModelInfo(modelName) {
    try {
      const response = await this.client.post('/api/show', {
        name: modelName
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting model info:', error);
      throw new Error(`Failed to get info for model \${modelName}: \${error.message}`);
    }
  }

  // Utility methods
  formatModelSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDuration(nanoseconds) {
    if (!nanoseconds) return '0ms';
    const ms = nanoseconds / 1000000;
    if (ms < 1000) return `\${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `\${Math.round(seconds * 10) / 10}s`;
    const minutes = seconds / 60;
    return `\${Math.round(minutes * 10) / 10}m`;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update axios client if baseURL changed
    if (newConfig.baseUrl) {
      this.client = axios.create({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  }

  getConfig() {
    return { ...this.config };
  }

  // Predefined model recommendations
  getRecommendedModels() {
    return {
      general: [
        { name: 'llama3.2:3b', description: 'Fast, lightweight model for general use', size: '2.0 GB' },
        { name: 'llama3.2:1b', description: 'Ultra-fast, smallest model', size: '1.3 GB' },
        { name: 'qwen2.5:7b', description: 'Balanced performance and speed', size: '4.4 GB' }
      ],
      coding: [
        { name: 'codellama:7b', description: 'Specialized for code generation', size: '3.8 GB' },
        { name: 'codegemma:7b', description: 'Google\'s code-focused model', size: '5.0 GB' }
      ],
      embeddings: [
        { name: 'nomic-embed-text', description: 'High-quality text embeddings', size: '274 MB' },
        { name: 'mxbai-embed-large', description: 'Large embedding model', size: '669 MB' }
      ]
    };
  }
}

module.exports = OllamaService;