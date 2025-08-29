/**
 * File Type Detection and Processing Service
 * Advanced file type detection using magic numbers, headers, and content analysis
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class FileTypeDetector extends EventEmitter {
  constructor() {
    super();
    
    // Magic number signatures for file type detection
    this.magicNumbers = {
      // Documents
      'PDF': { signature: [0x25, 0x50, 0x44, 0x46], extension: 'pdf', mime: 'application/pdf' },
      'DOC': { signature: [0xD0, 0xCF, 0x11, 0xE0], extension: 'doc', mime: 'application/msword' },
      'DOCX': { signature: [0x50, 0x4B, 0x03, 0x04], extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      'RTF': { signature: [0x7B, 0x5C, 0x72, 0x74], extension: 'rtf', mime: 'application/rtf' },
      
      // Images
      'JPEG': { signature: [0xFF, 0xD8, 0xFF], extension: 'jpg', mime: 'image/jpeg' },
      'PNG': { signature: [0x89, 0x50, 0x4E, 0x47], extension: 'png', mime: 'image/png' },
      'GIF87': { signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], extension: 'gif', mime: 'image/gif' },
      'GIF89': { signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], extension: 'gif', mime: 'image/gif' },
      'BMP': { signature: [0x42, 0x4D], extension: 'bmp', mime: 'image/bmp' },
      'WEBP': { signature: [0x52, 0x49, 0x46, 0x46], extension: 'webp', mime: 'image/webp' },
      'ICO': { signature: [0x00, 0x00, 0x01, 0x00], extension: 'ico', mime: 'image/x-icon' },
      
      // Audio
      'MP3': { signature: [0x49, 0x44, 0x33], extension: 'mp3', mime: 'audio/mpeg' },
      'MP3_ALT': { signature: [0xFF, 0xFB], extension: 'mp3', mime: 'audio/mpeg' },
      'WAV': { signature: [0x52, 0x49, 0x46, 0x46], extension: 'wav', mime: 'audio/wav' },
      'FLAC': { signature: [0x66, 0x4C, 0x61, 0x43], extension: 'flac', mime: 'audio/flac' },
      'OGG': { signature: [0x4F, 0x67, 0x67, 0x53], extension: 'ogg', mime: 'audio/ogg' },
      
      // Video
      'MP4': { signature: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], extension: 'mp4', mime: 'video/mp4' },
      'AVI': { signature: [0x52, 0x49, 0x46, 0x46], extension: 'avi', mime: 'video/x-msvideo' },
      'MKV': { signature: [0x1A, 0x45, 0xDF, 0xA3], extension: 'mkv', mime: 'video/x-matroska' },
      'WEBM': { signature: [0x1A, 0x45, 0xDF, 0xA3], extension: 'webm', mime: 'video/webm' },
      
      // Archives
      'ZIP': { signature: [0x50, 0x4B, 0x03, 0x04], extension: 'zip', mime: 'application/zip' },
      'ZIP_EMPTY': { signature: [0x50, 0x4B, 0x05, 0x06], extension: 'zip', mime: 'application/zip' },
      'ZIP_SPANNED': { signature: [0x50, 0x4B, 0x07, 0x08], extension: 'zip', mime: 'application/zip' },
      'RAR': { signature: [0x52, 0x61, 0x72, 0x21], extension: 'rar', mime: 'application/vnd.rar' },
      '7Z': { signature: [0x37, 0x7A, 0xBC, 0xAF], extension: '7z', mime: 'application/x-7z-compressed' },
      'TAR': { signature: [0x75, 0x73, 0x74, 0x61, 0x72], extension: 'tar', mime: 'application/x-tar' },
      'GZIP': { signature: [0x1F, 0x8B], extension: 'gz', mime: 'application/gzip' },
      
      // Executables
      'EXE': { signature: [0x4D, 0x5A], extension: 'exe', mime: 'application/x-msdownload' },
      'ELF': { signature: [0x7F, 0x45, 0x4C, 0x46], extension: '', mime: 'application/x-elf' },
      'MACH': { signature: [0xFE, 0xED, 0xFA, 0xCE], extension: '', mime: 'application/x-mach-binary' }
    };

    // Text file indicators
    this.textIndicators = {
      xml: /<\?xml|<html|<root/i,
      html: /<html|<head|<body|<!doctype/i,
      json: /^\s*[{\[]/,
      csv: /^[^,\n]*,[^,\n]*(?:,[^,\n]*)*$/m,
      yaml: /^---\s*$|^\w+:\s*.+$/m,
      markdown: /^#\s|^\*\s|\[.*\]\(.*\)|```/m,
      code: {
        javascript: /function\s+\w+|const\s+\w+\s*=|class\s+\w+/,
        python: /def\s+\w+|import\s+\w+|class\s+\w+/,
        java: /public\s+class|import\s+java\./,
        cpp: /#include\s*<|using\s+namespace/,
        css: /[.#][\w-]+\s*{|@media/
      }
    };

    // MIME type categories
    this.categories = {
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/plain', 'text/markdown'],
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'image/x-icon'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4'],
      video: ['video/mp4', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/quicktime'],
      archive: ['application/zip', 'application/vnd.rar', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip'],
      code: ['text/javascript', 'text/css', 'text/html', 'application/json', 'text/xml', 'application/xml'],
      spreadsheet: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
      presentation: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    };
  }

  /**
   * Detect file type using multiple methods
   * @param {string} filePath - Path to file
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} File type information
   */
  async detectFileType(filePath, options = {}) {
    try {
      const result = {
        path: filePath,
        name: path.basename(filePath),
        detectionMethods: [],
        confidence: 0,
        type: 'unknown',
        category: 'unknown',
        mime: 'application/octet-stream',
        extension: path.extname(filePath).toLowerCase().slice(1),
        size: 0,
        isText: false,
        encoding: null,
        metadata: {}
      };

      // Get file stats
      const stats = await fs.stat(filePath);
      result.size = stats.size;
      result.modified = stats.mtime;
      result.created = stats.birthtime;

      // Skip empty files
      if (stats.size === 0) {
        result.type = 'empty';
        result.confidence = 100;
        return result;
      }

      // Read file header for magic number detection
      const headerSize = Math.min(512, stats.size);
      const buffer = Buffer.alloc(headerSize);
      const fileHandle = await fs.open(filePath, 'r');
      
      try {
        await fileHandle.read(buffer, 0, headerSize, 0);
        
        // 1. Magic number detection (highest confidence)
        const magicResult = this.detectByMagicNumber(buffer);
        if (magicResult) {
          result.type = magicResult.type;
          result.mime = magicResult.mime;
          result.extension = magicResult.extension;
          result.confidence = 95;
          result.detectionMethods.push('magic_number');
        }

        // 2. Extension-based detection
        const extResult = this.detectByExtension(result.extension);
        if (extResult && !magicResult) {
          result.type = extResult.type;
          result.mime = extResult.mime;
          result.confidence = 70;
          result.detectionMethods.push('extension');
        }

        // 3. Content analysis for text files
        if (this.mightBeTextFile(buffer, result.size)) {
          const textResult = await this.analyzeTextContent(filePath, buffer);
          if (textResult) {
            if (!magicResult && !extResult) {
              result.type = textResult.type;
              result.mime = textResult.mime;
              result.confidence = 80;
            }
            result.isText = true;
            result.encoding = textResult.encoding;
            result.metadata = { ...result.metadata, ...textResult.metadata };
            result.detectionMethods.push('content_analysis');
          }
        }

        // 4. Advanced analysis for specific types
        if (options.deepAnalysis) {
          const deepResult = await this.performDeepAnalysis(filePath, buffer, result);
          if (deepResult) {
            result.metadata = { ...result.metadata, ...deepResult };
            result.detectionMethods.push('deep_analysis');
          }
        }

      } finally {
        await fileHandle.close();
      }

      // Determine category
      result.category = this.getCategory(result.mime);

      // Calculate final confidence
      if (result.detectionMethods.length > 1) {
        result.confidence = Math.min(100, result.confidence + (result.detectionMethods.length - 1) * 10);
      }

      this.emit('fileTypeDetected', result);
      return result;

    } catch (error) {
      this.emit('detectionError', { filePath, error: error.message });
      throw new Error(`Failed to detect file type for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Batch detect file types
   * @param {Array} filePaths - Array of file paths
   * @param {Object} options - Detection options
   * @returns {Promise<Array>} Array of detection results
   */
  async batchDetect(filePaths, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    
    this.emit('batchDetectionStarted', { totalFiles: filePaths.length });

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (filePath, index) => {
        try {
          const result = await this.detectFileType(filePath, options);
          
          this.emit('batchProgress', {
            current: i + index + 1,
            total: filePaths.length,
            progress: ((i + index + 1) / filePaths.length) * 100
          });

          return result;
        } catch (error) {
          return {
            path: filePath,
            error: error.message,
            type: 'error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.emit('batchDetectionCompleted', { results, totalFiles: filePaths.length });
    return results;
  }

  /**
   * Detect file type by magic number
   * @private
   */
  detectByMagicNumber(buffer) {
    for (const [name, info] of Object.entries(this.magicNumbers)) {
      if (this.matchesSignature(buffer, info.signature)) {
        return {
          type: name.toLowerCase(),
          mime: info.mime,
          extension: info.extension
        };
      }
    }
    return null;
  }

  /**
   * Check if buffer matches signature
   * @private
   */
  matchesSignature(buffer, signature) {
    if (buffer.length < signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect file type by extension
   * @private
   */
  detectByExtension(extension) {
    const extensionMap = {
      // Documents
      pdf: { type: 'pdf', mime: 'application/pdf' },
      doc: { type: 'doc', mime: 'application/msword' },
      docx: { type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      txt: { type: 'text', mime: 'text/plain' },
      md: { type: 'markdown', mime: 'text/markdown' },
      rtf: { type: 'rtf', mime: 'application/rtf' },
      odt: { type: 'odt', mime: 'application/vnd.oasis.opendocument.text' },
      
      // Images
      jpg: { type: 'jpeg', mime: 'image/jpeg' },
      jpeg: { type: 'jpeg', mime: 'image/jpeg' },
      png: { type: 'png', mime: 'image/png' },
      gif: { type: 'gif', mime: 'image/gif' },
      bmp: { type: 'bmp', mime: 'image/bmp' },
      webp: { type: 'webp', mime: 'image/webp' },
      svg: { type: 'svg', mime: 'image/svg+xml' },
      ico: { type: 'ico', mime: 'image/x-icon' },
      
      // Audio
      mp3: { type: 'mp3', mime: 'audio/mpeg' },
      wav: { type: 'wav', mime: 'audio/wav' },
      flac: { type: 'flac', mime: 'audio/flac' },
      aac: { type: 'aac', mime: 'audio/aac' },
      ogg: { type: 'ogg', mime: 'audio/ogg' },
      m4a: { type: 'm4a', mime: 'audio/mp4' },
      
      // Video
      mp4: { type: 'mp4', mime: 'video/mp4' },
      avi: { type: 'avi', mime: 'video/x-msvideo' },
      mkv: { type: 'mkv', mime: 'video/x-matroska' },
      mov: { type: 'mov', mime: 'video/quicktime' },
      wmv: { type: 'wmv', mime: 'video/x-ms-wmv' },
      webm: { type: 'webm', mime: 'video/webm' },
      
      // Code
      js: { type: 'javascript', mime: 'text/javascript' },
      ts: { type: 'typescript', mime: 'text/typescript' },
      py: { type: 'python', mime: 'text/x-python' },
      java: { type: 'java', mime: 'text/x-java-source' },
      cpp: { type: 'cpp', mime: 'text/x-c++src' },
      c: { type: 'c', mime: 'text/x-csrc' },
      h: { type: 'c-header', mime: 'text/x-chdr' },
      css: { type: 'css', mime: 'text/css' },
      html: { type: 'html', mime: 'text/html' },
      json: { type: 'json', mime: 'application/json' },
      xml: { type: 'xml', mime: 'application/xml' },
      
      // Spreadsheets
      xlsx: { type: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      xls: { type: 'xls', mime: 'application/vnd.ms-excel' },
      csv: { type: 'csv', mime: 'text/csv' },
      ods: { type: 'ods', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
      
      // Presentations
      pptx: { type: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      ppt: { type: 'ppt', mime: 'application/vnd.ms-powerpoint' },
      odp: { type: 'odp', mime: 'application/vnd.oasis.opendocument.presentation' },
      
      // Archives
      zip: { type: 'zip', mime: 'application/zip' },
      rar: { type: 'rar', mime: 'application/vnd.rar' },
      '7z': { type: '7z', mime: 'application/x-7z-compressed' },
      tar: { type: 'tar', mime: 'application/x-tar' },
      gz: { type: 'gzip', mime: 'application/gzip' }
    };

    return extensionMap[extension] || null;
  }

  /**
   * Check if file might be text
   * @private
   */
  mightBeTextFile(buffer, fileSize) {
    // Files larger than 10MB are unlikely to be text
    if (fileSize > 10 * 1024 * 1024) {
      return false;
    }

    // Check for null bytes (binary indicator)
    const sampleSize = Math.min(1024, buffer.length);
    let nullBytes = 0;
    let controlBytes = 0;

    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      
      if (byte === 0) {
        nullBytes++;
      }
      
      // Control characters (except common whitespace)
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        controlBytes++;
      }
    }

    // If more than 1% null bytes or 5% control chars, likely binary
    const nullPercentage = (nullBytes / sampleSize) * 100;
    const controlPercentage = (controlBytes / sampleSize) * 100;

    return nullPercentage < 1 && controlPercentage < 5;
  }

  /**
   * Analyze text content for specific formats
   * @private
   */
  async analyzeTextContent(filePath, buffer) {
    try {
      // Detect encoding
      const encoding = this.detectEncoding(buffer);
      
      // Read a larger sample for content analysis
      const sampleSize = Math.min(4096, buffer.length);
      const text = buffer.toString(encoding, 0, sampleSize);

      // Analyze content patterns
      const metadata = {
        lineCount: (text.match(/\n/g) || []).length + 1,
        charCount: text.length,
        hasUTF8BOM: buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
      };

      // Detect specific text formats
      if (this.textIndicators.json.test(text)) {
        return { type: 'json', mime: 'application/json', encoding, metadata };
      }

      if (this.textIndicators.xml.test(text)) {
        return { type: 'xml', mime: 'application/xml', encoding, metadata };
      }

      if (this.textIndicators.html.test(text)) {
        return { type: 'html', mime: 'text/html', encoding, metadata };
      }

      if (this.textIndicators.csv.test(text)) {
        metadata.delimiter = this.detectCSVDelimiter(text);
        return { type: 'csv', mime: 'text/csv', encoding, metadata };
      }

      if (this.textIndicators.yaml.test(text)) {
        return { type: 'yaml', mime: 'text/yaml', encoding, metadata };
      }

      if (this.textIndicators.markdown.test(text)) {
        return { type: 'markdown', mime: 'text/markdown', encoding, metadata };
      }

      // Check for code patterns
      for (const [lang, pattern] of Object.entries(this.textIndicators.code)) {
        if (pattern.test(text)) {
          return { type: lang, mime: `text/x-${lang}`, encoding, metadata };
        }
      }

      // Default to plain text
      return { type: 'text', mime: 'text/plain', encoding, metadata };

    } catch (error) {
      return null;
    }
  }

  /**
   * Detect text encoding
   * @private
   */
  detectEncoding(buffer) {
    // Check for BOM
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return 'utf8';
    }

    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return 'utf16le';
    }

    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return 'utf16be';
    }

    // Basic heuristic: if all bytes are valid UTF-8, assume UTF-8
    try {
      buffer.toString('utf8');
      return 'utf8';
    } catch (error) {
      return 'latin1';
    }
  }

  /**
   * Detect CSV delimiter
   * @private
   */
  detectCSVDelimiter(text) {
    const delimiters = [',', ';', '\t', '|'];
    const lines = text.split('\n').slice(0, 5); // Check first 5 lines
    
    let maxCount = 0;
    let bestDelimiter = ',';

    for (const delimiter of delimiters) {
      let consistent = true;
      let firstLineCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const count = (lines[i].match(new RegExp('\\' + delimiter, 'g')) || []).length;
        
        if (i === 0) {
          firstLineCount = count;
        } else if (count !== firstLineCount) {
          consistent = false;
          break;
        }
      }

      if (consistent && firstLineCount > maxCount) {
        maxCount = firstLineCount;
        bestDelimiter = delimiter;
      }
    }

    return bestDelimiter;
  }

  /**
   * Perform deep analysis for specific file types
   * @private
   */
  async performDeepAnalysis(filePath, buffer, currentResult) {
    const metadata = {};

    try {
      // Image analysis
      if (currentResult.category === 'image') {
        if (currentResult.type === 'jpeg') {
          const exifData = this.extractBasicEXIF(buffer);
          if (exifData) {
            metadata.exif = exifData;
          }
        }
      }

      // PDF analysis
      if (currentResult.type === 'pdf') {
        const pdfInfo = this.extractPDFInfo(buffer);
        if (pdfInfo) {
          metadata.pdf = pdfInfo;
        }
      }

      // Archive analysis
      if (currentResult.category === 'archive') {
        metadata.compressed = true;
        metadata.archiveType = currentResult.type;
      }

      return metadata;
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract basic EXIF data from JPEG
   * @private
   */
  extractBasicEXIF(buffer) {
    // Simple EXIF extraction (basic implementation)
    try {
      const exifMarker = Buffer.from([0xFF, 0xE1]);
      const exifIndex = buffer.indexOf(exifMarker);
      
      if (exifIndex !== -1 && buffer.length > exifIndex + 10) {
        const exifData = buffer.slice(exifIndex + 4, exifIndex + 20);
        
        // Check for EXIF header
        if (exifData.toString('ascii', 0, 4) === 'Exif') {
          return {
            hasExif: true,
            offset: exifIndex
          };
        }
      }

      return { hasExif: false };
    } catch (error) {
      return { hasExif: false };
    }
  }

  /**
   * Extract basic PDF info
   * @private
   */
  extractPDFInfo(buffer) {
    try {
      const pdfVersion = buffer.toString('ascii', 0, 8);
      const versionMatch = pdfVersion.match(/%PDF-(\d+\.\d+)/);
      
      return {
        version: versionMatch ? versionMatch[1] : 'unknown',
        hasVersion: !!versionMatch
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Get category from MIME type
   * @private
   */
  getCategory(mimeType) {
    for (const [category, mimes] of Object.entries(this.categories)) {
      if (mimes.includes(mimeType)) {
        return category;
      }
    }

    // Fallback category detection
    if (mimeType.startsWith('text/')) {
      return 'document';
    } else if (mimeType.startsWith('image/')) {
      return 'image';
    } else if (mimeType.startsWith('audio/')) {
      return 'audio';
    } else if (mimeType.startsWith('video/')) {
      return 'video';
    }

    return 'unknown';
  }

  /**
   * Get supported file types
   * @returns {Object} Supported file types by category
   */
  getSupportedTypes() {
    const types = {};
    
    for (const [category, mimes] of Object.entries(this.categories)) {
      types[category] = mimes;
    }

    return types;
  }

  /**
   * Check if file type is supported
   * @param {string} mimeType - MIME type to check
   * @returns {boolean} Is supported
   */
  isSupported(mimeType) {
    for (const mimes of Object.values(this.categories)) {
      if (mimes.includes(mimeType)) {
        return true;
      }
    }
    return false;
  }
}

module.exports = FileTypeDetector;