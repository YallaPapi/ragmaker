/**
 * File Preview and Thumbnail Generation Service
 * Generates previews and thumbnails for various file types
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');

class PreviewGenerator extends EventEmitter {
  constructor() {
    super();
    this.previewCache = new Map(); // filePath -> preview info
    this.thumbnailSizes = {
      small: { width: 64, height: 64 },
      medium: { width: 128, height: 128 },
      large: { width: 256, height: 256 },
      xlarge: { width: 512, height: 512 }
    };
    this.previewSizes = {
      small: { width: 300, height: 200 },
      medium: { width: 600, height: 400 },
      large: { width: 1200, height: 800 }
    };
    this.maxCacheSize = 1000;
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    this.supportedFormats = {
      image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'],
      document: ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.odt'],
      video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm', '.flv'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
      code: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml'],
      spreadsheet: ['.xlsx', '.xls', '.csv', '.ods'],
      presentation: ['.pptx', '.ppt', '.odp'],
      archive: ['.zip', '.rar', '.7z', '.tar', '.gz']
    };
  }

  /**
   * Generate thumbnail for a file
   * @param {string} filePath - Path to file
   * @param {string} size - Thumbnail size (small, medium, large, xlarge)
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Thumbnail info
   */
  async generateThumbnail(filePath, size = 'medium', options = {}) {
    try {
      const cacheKey = `${filePath}_thumb_${size}`;
      
      // Check cache first
      if (!options.forceRegenerate) {
        const cached = this.previewCache.get(cacheKey);
        if (cached && this.isCacheValid(cached)) {
          return cached;
        }
      }

      const extension = path.extname(filePath).toLowerCase();
      const thumbnailSize = this.thumbnailSizes[size];
      
      let thumbnailInfo;

      // Generate thumbnail based on file type
      if (this.supportedFormats.image.includes(extension)) {
        thumbnailInfo = await this.generateImageThumbnail(filePath, thumbnailSize, options);
      } else if (this.supportedFormats.document.includes(extension)) {
        thumbnailInfo = await this.generateDocumentThumbnail(filePath, thumbnailSize, options);
      } else if (this.supportedFormats.video.includes(extension)) {
        thumbnailInfo = await this.generateVideoThumbnail(filePath, thumbnailSize, options);
      } else if (this.supportedFormats.audio.includes(extension)) {
        thumbnailInfo = await this.generateAudioThumbnail(filePath, thumbnailSize, options);
      } else if (this.supportedFormats.code.includes(extension)) {
        thumbnailInfo = await this.generateCodeThumbnail(filePath, thumbnailSize, options);
      } else {
        // Generate generic file type thumbnail
        thumbnailInfo = await this.generateGenericThumbnail(filePath, thumbnailSize, options);
      }

      // Add metadata
      thumbnailInfo.cacheKey = cacheKey;
      thumbnailInfo.generated = new Date();
      thumbnailInfo.size = size;
      thumbnailInfo.filePath = filePath;

      // Cache the result
      this.addToCache(cacheKey, thumbnailInfo);

      this.emit('thumbnailGenerated', thumbnailInfo);
      return thumbnailInfo;

    } catch (error) {
      this.emit('thumbnailError', { filePath, error: error.message });
      throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
  }

  /**
   * Generate preview for a file
   * @param {string} filePath - Path to file
   * @param {string} size - Preview size (small, medium, large)
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Preview info
   */
  async generatePreview(filePath, size = 'medium', options = {}) {
    try {
      const cacheKey = `${filePath}_preview_${size}`;
      
      // Check cache first
      if (!options.forceRegenerate) {
        const cached = this.previewCache.get(cacheKey);
        if (cached && this.isCacheValid(cached)) {
          return cached;
        }
      }

      const extension = path.extname(filePath).toLowerCase();
      const previewSize = this.previewSizes[size];
      
      let previewInfo;

      // Generate preview based on file type
      if (this.supportedFormats.image.includes(extension)) {
        previewInfo = await this.generateImagePreview(filePath, previewSize, options);
      } else if (this.supportedFormats.document.includes(extension)) {
        previewInfo = await this.generateDocumentPreview(filePath, previewSize, options);
      } else if (this.supportedFormats.video.includes(extension)) {
        previewInfo = await this.generateVideoPreview(filePath, previewSize, options);
      } else if (this.supportedFormats.code.includes(extension)) {
        previewInfo = await this.generateCodePreview(filePath, previewSize, options);
      } else if (extension === '.txt' || extension === '.md') {
        previewInfo = await this.generateTextPreview(filePath, previewSize, options);
      } else {
        // Generate generic preview
        previewInfo = await this.generateGenericPreview(filePath, previewSize, options);
      }

      // Add metadata
      previewInfo.cacheKey = cacheKey;
      previewInfo.generated = new Date();
      previewInfo.size = size;
      previewInfo.filePath = filePath;

      // Cache the result
      this.addToCache(cacheKey, previewInfo);

      this.emit('previewGenerated', previewInfo);
      return previewInfo;

    } catch (error) {
      this.emit('previewError', { filePath, error: error.message });
      throw new Error(`Failed to generate preview: ${error.message}`);
    }
  }

  /**
   * Generate image thumbnail
   * @private
   */
  async generateImageThumbnail(filePath, size, options) {
    try {
      const buffer = await sharp(filePath)
        .resize(size.width, size.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      return {
        type: 'image',
        format: 'jpeg',
        data: buffer,
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height
      };
    } catch (error) {
      throw new Error(`Image thumbnail generation failed: ${error.message}`);
    }
  }

  /**
   * Generate image preview
   * @private
   */
  async generateImagePreview(filePath, size, options) {
    try {
      const metadata = await sharp(filePath).metadata();
      const buffer = await sharp(filePath)
        .resize(size.width, size.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      return {
        type: 'image',
        format: 'jpeg',
        data: buffer,
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        originalFormat: metadata.format
      };
    } catch (error) {
      throw new Error(`Image preview generation failed: ${error.message}`);
    }
  }

  /**
   * Generate document thumbnail
   * @private
   */
  async generateDocumentThumbnail(filePath, size, options) {
    const extension = path.extname(filePath).toLowerCase();
    
    // Create a generic document icon
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);

    // Document outline
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size.width - 16, size.height - 16);

    // File type indicator
    const typeColors = {
      '.pdf': '#dc3545',
      '.docx': '#0d6efd', '.doc': '#0d6efd',
      '.txt': '#6c757d', '.md': '#6c757d',
      '.rtf': '#fd7e14',
      '.odt': '#198754'
    };

    ctx.fillStyle = typeColors[extension] || '#6c757d';
    ctx.fillRect(8, 8, size.width - 16, 16);

    // Extension text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(12, size.width / 8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(extension.slice(1).toUpperCase(), size.width / 2, 20);

    // Lines representing text
    ctx.fillStyle = '#e9ecef';
    for (let i = 0; i < 5; i++) {
      const y = 35 + i * 10;
      if (y < size.height - 20) {
        ctx.fillRect(16, y, size.width - 32, 3);
      }
    }

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'document',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate document preview
   * @private
   */
  async generateDocumentPreview(filePath, size, options) {
    const extension = path.extname(filePath).toLowerCase();
    
    if (extension === '.txt' || extension === '.md') {
      return await this.generateTextPreview(filePath, size, options);
    }

    // For other document types, create a larger version of the thumbnail
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);

    // Document outline
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, size.width - 40, size.height - 40);

    // Header
    const typeColors = {
      '.pdf': '#dc3545',
      '.docx': '#0d6efd', '.doc': '#0d6efd',
      '.rtf': '#fd7e14',
      '.odt': '#198754'
    };

    ctx.fillStyle = typeColors[extension] || '#6c757d';
    ctx.fillRect(20, 20, size.width - 40, 40);

    // Extension text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(extension.slice(1).toUpperCase(), size.width / 2, 45);

    // File name
    ctx.fillStyle = '#212529';
    ctx.font = '14px sans-serif';
    const fileName = path.basename(filePath, extension);
    const maxWidth = size.width - 60;
    const truncated = this.truncateText(ctx, fileName, maxWidth);
    ctx.fillText(truncated, size.width / 2, 80);

    // Simulated document content
    ctx.fillStyle = '#e9ecef';
    for (let i = 0; i < 10; i++) {
      const y = 100 + i * 20;
      if (y < size.height - 40) {
        const width = Math.random() * (size.width - 80) + 40;
        ctx.fillRect(40, y, width, 8);
      }
    }

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'document',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate video thumbnail
   * @private
   */
  async generateVideoThumbnail(filePath, size, options) {
    // For now, create a generic video thumbnail
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size.width, size.height);

    // Play button
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const radius = Math.min(size.width, size.height) / 6;
    
    ctx.moveTo(centerX - radius/2, centerY - radius);
    ctx.lineTo(centerX + radius, centerY);
    ctx.lineTo(centerX - radius/2, centerY + radius);
    ctx.closePath();
    ctx.fill();

    // Video icon border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, size.width - 8, size.height - 8);

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'video',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate video preview
   * @private
   */
  async generateVideoPreview(filePath, size, options) {
    // Similar to thumbnail but larger
    return await this.generateVideoThumbnail(filePath, size, options);
  }

  /**
   * Generate audio thumbnail
   * @private
   */
  async generateAudioThumbnail(filePath, size, options) {
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#6f42c1';
    ctx.fillRect(0, 0, size.width, size.height);

    // Audio waveform representation
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    const bars = 8;
    const barWidth = size.width / bars * 0.6;
    const spacing = size.width / bars * 0.4;
    
    for (let i = 0; i < bars; i++) {
      const x = i * (barWidth + spacing) + spacing / 2;
      const height = Math.random() * (size.height * 0.8) + size.height * 0.1;
      const y = (size.height - height) / 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, barWidth, height);
    }

    // Audio icon
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, size.width / 8, 0, Math.PI * 2);
    ctx.fill();

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'audio',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate code thumbnail
   * @private
   */
  async generateCodeThumbnail(filePath, size, options) {
    const extension = path.extname(filePath).toLowerCase();
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, size.width, size.height);

    // Language colors
    const langColors = {
      '.js': '#f7df1e', '.ts': '#3178c6',
      '.py': '#3776ab', '.java': '#ed8b00',
      '.cpp': '#00599c', '.c': '#a8b9cc',
      '.css': '#1572b6', '.html': '#e34f26',
      '.json': '#000000', '.xml': '#ff6600'
    };

    // Language indicator
    ctx.fillStyle = langColors[extension] || '#6c757d';
    ctx.fillRect(0, 0, size.width, 8);

    // Code lines
    const lines = [
      { color: '#569cd6', text: 'function' },
      { color: '#dcdcaa', text: 'getData' },
      { color: '#ffffff', text: '() {' },
      { color: '#ce9178', text: '  return' },
      { color: '#9cdcfe', text: '  data;' },
      { color: '#ffffff', text: '}' }
    ];

    ctx.font = `${Math.min(10, size.width / 12)}px monospace`;
    ctx.textAlign = 'left';

    lines.forEach((line, i) => {
      const y = 20 + i * 8;
      if (y < size.height - 5) {
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, 4, y);
      }
    });

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'code',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate code preview
   * @private
   */
  async generateCodePreview(filePath, size, options) {
    try {
      // Read first few lines of the code file
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').slice(0, 20); // First 20 lines
      
      const canvas = createCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, size.width, size.height);

      // Header with file name
      const extension = path.extname(filePath).toLowerCase();
      const langColors = {
        '.js': '#f7df1e', '.ts': '#3178c6',
        '.py': '#3776ab', '.java': '#ed8b00',
        '.cpp': '#00599c', '.c': '#a8b9cc',
        '.css': '#1572b6', '.html': '#e34f26',
        '.json': '#000000', '.xml': '#ff6600'
      };

      ctx.fillStyle = langColors[extension] || '#6c757d';
      ctx.fillRect(0, 0, size.width, 30);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(path.basename(filePath), 10, 20);

      // Code content
      ctx.font = '12px monospace';
      ctx.fillStyle = '#d4d4d4';

      lines.forEach((line, i) => {
        const y = 50 + i * 16;
        if (y < size.height - 10) {
          // Line number
          ctx.fillStyle = '#858585';
          ctx.textAlign = 'right';
          ctx.fillText((i + 1).toString().padStart(2, ' '), 30, y);
          
          // Code line
          ctx.fillStyle = '#d4d4d4';
          ctx.textAlign = 'left';
          const truncated = this.truncateText(ctx, line, size.width - 40);
          ctx.fillText(truncated, 35, y);
        }
      });

      const buffer = canvas.toBuffer('image/png');
      
      return {
        type: 'code',
        format: 'png',
        data: buffer,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height,
        content: lines.join('\n'),
        lineCount: lines.length
      };

    } catch (error) {
      // Fall back to generic code thumbnail
      return await this.generateCodeThumbnail(filePath, size, options);
    }
  }

  /**
   * Generate text preview
   * @private
   */
  async generateTextPreview(filePath, size, options) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').slice(0, 30); // First 30 lines
      
      const canvas = createCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);

      // Header
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, size.width, 40);
      ctx.strokeStyle = '#dee2e6';
      ctx.strokeRect(0, 0, size.width, size.height);

      // File name
      ctx.fillStyle = '#495057';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(path.basename(filePath), 15, 25);

      // Content
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#212529';

      lines.forEach((line, i) => {
        const y = 65 + i * 16;
        if (y < size.height - 10) {
          const truncated = this.truncateText(ctx, line, size.width - 30);
          ctx.fillText(truncated, 15, y);
        }
      });

      const buffer = canvas.toBuffer('image/png');
      
      return {
        type: 'text',
        format: 'png',
        data: buffer,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height,
        content: lines.slice(0, 10).join('\n'),
        lineCount: lines.length,
        wordCount: content.split(/\s+/).length
      };

    } catch (error) {
      throw new Error(`Text preview generation failed: ${error.message}`);
    }
  }

  /**
   * Generate generic thumbnail
   * @private
   */
  async generateGenericThumbnail(filePath, size, options) {
    const extension = path.extname(filePath).toLowerCase();
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#6c757d';
    ctx.fillRect(0, 0, size.width, size.height);

    // File icon
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    // Simple file shape
    const margin = size.width * 0.2;
    ctx.strokeRect(margin, margin, size.width - margin * 2, size.height - margin * 2);
    
    // Fold corner
    const cornerSize = size.width * 0.15;
    ctx.beginPath();
    ctx.moveTo(size.width - margin, margin);
    ctx.lineTo(size.width - margin - cornerSize, margin);
    ctx.lineTo(size.width - margin, margin + cornerSize);
    ctx.closePath();
    ctx.fill();

    // Extension text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(14, size.width / 6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(extension.slice(1).toUpperCase() || 'FILE', size.width / 2, size.height / 2 + 5);

    const buffer = canvas.toBuffer('image/png');
    
    return {
      type: 'generic',
      format: 'png',
      data: buffer,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Generate generic preview
   * @private
   */
  async generateGenericPreview(filePath, size, options) {
    // Use a larger version of the generic thumbnail
    return await this.generateGenericThumbnail(filePath, size, options);
  }

  /**
   * Batch generate thumbnails
   * @param {Array} filePaths - Array of file paths
   * @param {string} size - Thumbnail size
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of thumbnail results
   */
  async batchGenerateThumbnails(filePaths, size = 'medium', options = {}) {
    const results = [];
    const batchSize = options.batchSize || 5;

    this.emit('batchThumbnailStarted', { totalFiles: filePaths.length });

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (filePath, index) => {
        try {
          const thumbnail = await this.generateThumbnail(filePath, size, options);
          
          this.emit('batchThumbnailProgress', {
            current: i + index + 1,
            total: filePaths.length,
            progress: ((i + index + 1) / filePaths.length) * 100
          });

          return { success: true, filePath, thumbnail };
        } catch (error) {
          return { success: false, filePath, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.emit('batchThumbnailCompleted', { results, totalFiles: filePaths.length });
    return results;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.previewCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get cache stats
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let validItems = 0;
    let expiredItems = 0;

    for (const item of this.previewCache.values()) {
      if (now - item.generated.getTime() < this.cacheTTL) {
        validItems++;
      } else {
        expiredItems++;
      }
    }

    return {
      totalItems: this.previewCache.size,
      validItems,
      expiredItems,
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    const toDelete = [];

    for (const [key, item] of this.previewCache.entries()) {
      if (now - item.generated.getTime() > this.cacheTTL) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.previewCache.delete(key));
    
    this.emit('cacheCleanedUp', { removedItems: toDelete.length });
  }

  /**
   * Check if cache entry is valid
   * @private
   */
  isCacheValid(cacheEntry) {
    const now = Date.now();
    return (now - cacheEntry.generated.getTime()) < this.cacheTTL;
  }

  /**
   * Add item to cache with size management
   * @private
   */
  addToCache(key, item) {
    // Remove oldest items if cache is full
    if (this.previewCache.size >= this.maxCacheSize) {
      const oldestKey = this.previewCache.keys().next().value;
      this.previewCache.delete(oldestKey);
    }

    this.previewCache.set(key, item);
  }

  /**
   * Truncate text to fit width
   * @private
   */
  truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }

    return truncated + '...';
  }

  /**
   * Get supported formats
   * @returns {Object} Supported file formats
   */
  getSupportedFormats() {
    return this.supportedFormats;
  }

  /**
   * Check if file type is supported for preview generation
   * @param {string} filePath - File path
   * @returns {boolean} Is supported
   */
  isSupported(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    for (const formats of Object.values(this.supportedFormats)) {
      if (formats.includes(extension)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Cleanup preview generator
   */
  destroy() {
    this.clearCache();
    this.removeAllListeners();
  }
}

module.exports = PreviewGenerator;