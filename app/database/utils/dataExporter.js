/**
 * Data Exporter - Export data to various formats (JSON, CSV, JSONL, XML)
 * Supports flexible filtering and custom field selection
 */

const fs = require('fs').promises;
const path = require('path');
const { Transform } = require('stream');

class DataExporter {
  constructor(database) {
    this.db = database;
  }

  /**
   * Export project data to various formats
   */
  async exportProject(projectId, format, options = {}) {
    const {
      outputPath = null,
      includeEmbeddings = false,
      includeChatLogs = true,
      includeAnalytics = false,
      dateFrom = null,
      dateTo = null,
      compress = false
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = outputPath || `export-${projectId}-${timestamp}`;

    console.log(`Exporting project ${projectId} to ${format.toUpperCase()}...`);

    try {
      // Get project data
      const projectData = await this.gatherProjectData(projectId, {
        includeEmbeddings,
        includeChatLogs,
        includeAnalytics,
        dateFrom,
        dateTo
      });

      let result;
      switch (format.toLowerCase()) {
        case 'json':
          result = await this.exportToJSON(projectData, defaultPath + '.json', options);
          break;
        case 'csv':
          result = await this.exportToCSV(projectData, defaultPath, options);
          break;
        case 'jsonl':
          result = await this.exportToJSONL(projectData, defaultPath + '.jsonl', options);
          break;
        case 'xml':
          result = await this.exportToXML(projectData, defaultPath + '.xml', options);
          break;
        case 'markdown':
          result = await this.exportToMarkdown(projectData, defaultPath + '.md', options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      console.log(`Export completed: ${result.filePath}`);
      return result;

    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Export search results to file
   */
  async exportSearchResults(searchResults, format, outputPath, options = {}) {
    const exportData = {
      meta: {
        export_type: 'search_results',
        exported_at: new Date().toISOString(),
        query: searchResults.query,
        total_results: searchResults.total
      },
      results: searchResults.results
    };

    switch (format.toLowerCase()) {
      case 'json':
        return await this.exportToJSON(exportData, outputPath, options);
      case 'csv':
        return await this.exportSearchResultsToCSV(searchResults.results, outputPath, options);
      case 'markdown':
        return await this.exportSearchResultsToMarkdown(searchResults, outputPath, options);
      default:
        throw new Error(`Unsupported export format for search results: ${format}`);
    }
  }

  /**
   * Export chat history to various formats
   */
  async exportChatHistory(projectId, format, outputPath = null, options = {}) {
    const {
      sessionId = null,
      dateFrom = null,
      dateTo = null,
      includeRatings = true
    } = options;

    let chatLogs;
    if (sessionId) {
      chatLogs = this.db.prepare(`
        SELECT * FROM chat_logs 
        WHERE session_id = ? 
        ORDER BY created_at
      `).all(sessionId);
    } else {
      let query = `
        SELECT * FROM chat_logs 
        WHERE project_id = ?
      `;
      const params = [projectId];

      if (dateFrom) {
        query += ` AND created_at >= ?`;
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ` AND created_at <= ?`;
        params.push(dateTo);
      }

      query += ` ORDER BY created_at`;
      chatLogs = this.db.prepare(query).all(...params);
    }

    const exportData = {
      meta: {
        export_type: 'chat_history',
        exported_at: new Date().toISOString(),
        project_id: projectId,
        session_id: sessionId,
        total_chats: chatLogs.length
      },
      chats: chatLogs
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = outputPath || `chat-export-${projectId}-${timestamp}`;

    switch (format.toLowerCase()) {
      case 'json':
        return await this.exportToJSON(exportData, defaultPath + '.json', options);
      case 'csv':
        return await this.exportChatHistoryToCSV(chatLogs, defaultPath + '.csv', options);
      case 'markdown':
        return await this.exportChatHistoryToMarkdown(exportData, defaultPath + '.md', options);
      default:
        throw new Error(`Unsupported export format for chat history: ${format}`);
    }
  }

  /**
   * Gather all project data
   */
  async gatherProjectData(projectId, options = {}) {
    const {
      includeEmbeddings = false,
      includeChatLogs = true,
      includeAnalytics = false,
      dateFrom = null,
      dateTo = null
    } = options;

    const projectData = {
      meta: {
        export_type: 'project_data',
        exported_at: new Date().toISOString(),
        project_id: projectId,
        options: options
      },
      project: null,
      documents: [],
      text_chunks: [],
      embeddings: [],
      channels: [],
      chat_logs: [],
      analytics: []
    };

    // Get project info
    projectData.project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!projectData.project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Get documents
    projectData.documents = this.db.prepare('SELECT * FROM documents WHERE project_id = ?').all(projectId);

    // Get text chunks
    projectData.text_chunks = this.db.prepare('SELECT * FROM text_chunks WHERE project_id = ?').all(projectId);

    // Get embeddings (if requested)
    if (includeEmbeddings) {
      projectData.embeddings = this.db.prepare('SELECT * FROM embeddings WHERE project_id = ?').all(projectId);
    }

    // Get channels
    projectData.channels = this.db.prepare('SELECT * FROM channels WHERE project_id = ?').all(projectId);

    // Get chat logs (if requested)
    if (includeChatLogs) {
      let query = 'SELECT * FROM chat_logs WHERE project_id = ?';
      const params = [projectId];

      if (dateFrom) {
        query += ' AND created_at >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ' AND created_at <= ?';
        params.push(dateTo);
      }

      query += ' ORDER BY created_at';
      projectData.chat_logs = this.db.prepare(query).all(...params);
    }

    // Get analytics (if requested)
    if (includeAnalytics) {
      let query = 'SELECT * FROM analytics WHERE project_id = ?';
      const params = [projectId];

      if (dateFrom) {
        query += ' AND created_at >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ' AND created_at <= ?';
        params.push(dateTo);
      }

      query += ' ORDER BY created_at';
      projectData.analytics = this.db.prepare(query).all(...params);
    }

    return projectData;
  }

  /**
   * Export to JSON format
   */
  async exportToJSON(data, filePath, options = {}) {
    const { pretty = true, compress = false } = options;

    const jsonString = pretty ? 
      JSON.stringify(data, null, 2) : 
      JSON.stringify(data);

    await fs.writeFile(filePath, jsonString, 'utf8');

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'json',
      size: stats.size,
      records: this.countRecords(data)
    };
  }

  /**
   * Export to CSV format (multiple files for different data types)
   */
  async exportToCSV(data, basePath, options = {}) {
    const { delimiter = ',', includeHeaders = true } = options;
    const files = [];

    // Export each data type to separate CSV files
    const dataTypes = ['documents', 'text_chunks', 'channels', 'chat_logs'];

    for (const dataType of dataTypes) {
      if (data[dataType] && data[dataType].length > 0) {
        const csvPath = `${basePath}-${dataType}.csv`;
        await this.arrayToCSV(data[dataType], csvPath, { delimiter, includeHeaders });
        
        const stats = await fs.stat(csvPath);
        files.push({
          filePath: csvPath,
          dataType: dataType,
          size: stats.size,
          records: data[dataType].length
        });
      }
    }

    return {
      format: 'csv',
      files: files,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      totalRecords: files.reduce((sum, f) => sum + f.records, 0)
    };
  }

  /**
   * Export to JSONL format (newline-delimited JSON)
   */
  async exportToJSONL(data, filePath, options = {}) {
    const lines = [];

    // Add metadata line
    lines.push(JSON.stringify(data.meta));

    // Add data records
    const dataTypes = ['documents', 'text_chunks', 'channels', 'chat_logs'];
    for (const dataType of dataTypes) {
      if (data[dataType] && Array.isArray(data[dataType])) {
        for (const record of data[dataType]) {
          lines.push(JSON.stringify({ type: dataType, data: record }));
        }
      }
    }

    await fs.writeFile(filePath, lines.join('\\n'), 'utf8');

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'jsonl',
      size: stats.size,
      lines: lines.length
    };
  }

  /**
   * Export to XML format
   */
  async exportToXML(data, filePath, options = {}) {
    const { pretty = true } = options;
    
    const xmlBuilder = require('xmlbuilder');
    const root = xmlBuilder.create('export');

    // Add metadata
    const meta = root.ele('meta');
    for (const [key, value] of Object.entries(data.meta)) {
      meta.ele(key).txt(String(value));
    }

    // Add project data
    if (data.project) {
      const project = root.ele('project');
      for (const [key, value] of Object.entries(data.project)) {
        project.ele(key).txt(String(value || ''));
      }
    }

    // Add other data types
    const dataTypes = ['documents', 'text_chunks', 'channels', 'chat_logs'];
    for (const dataType of dataTypes) {
      if (data[dataType] && data[dataType].length > 0) {
        const section = root.ele(dataType);
        for (const record of data[dataType]) {
          const item = section.ele('item');
          for (const [key, value] of Object.entries(record)) {
            item.ele(key).txt(String(value || ''));
          }
        }
      }
    }

    const xmlString = pretty ? root.end({ pretty: true }) : root.end();
    await fs.writeFile(filePath, xmlString, 'utf8');

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'xml',
      size: stats.size,
      records: this.countRecords(data)
    };
  }

  /**
   * Export to Markdown format
   */
  async exportToMarkdown(data, filePath, options = {}) {
    const lines = [];
    
    // Title and metadata
    lines.push(`# Project Export: ${data.project?.name || data.meta.project_id}`);
    lines.push('');
    lines.push('## Export Information');
    lines.push(`- Exported at: ${data.meta.exported_at}`);
    lines.push(`- Project ID: ${data.meta.project_id}`);
    lines.push('');

    // Project details
    if (data.project) {
      lines.push('## Project Details');
      lines.push(`- **Name**: ${data.project.name}`);
      lines.push(`- **Description**: ${data.project.description || 'N/A'}`);
      lines.push(`- **Type**: ${data.project.type}`);
      lines.push(`- **Created**: ${data.project.created_at}`);
      lines.push(`- **Last Updated**: ${data.project.updated_at}`);
      lines.push('');
    }

    // Documents
    if (data.documents && data.documents.length > 0) {
      lines.push('## Documents');
      for (const doc of data.documents) {
        lines.push(`### ${doc.title}`);
        lines.push(`- **Type**: ${doc.type}`);
        lines.push(`- **URL**: ${doc.url || 'N/A'}`);
        lines.push(`- **Word Count**: ${doc.word_count || 0}`);
        lines.push(`- **Created**: ${doc.created_at}`);
        lines.push('');
      }
    }

    // Chat logs (recent ones)
    if (data.chat_logs && data.chat_logs.length > 0) {
      lines.push('## Recent Conversations');
      const recentChats = data.chat_logs.slice(-10); // Last 10 chats
      for (const chat of recentChats) {
        lines.push(`### Chat from ${chat.created_at}`);
        lines.push(`**Q**: ${chat.question}`);
        lines.push(`**A**: ${chat.answer}`);
        lines.push('');
      }
    }

    const markdownString = lines.join('\\n');
    await fs.writeFile(filePath, markdownString, 'utf8');

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'markdown',
      size: stats.size,
      sections: 4
    };
  }

  /**
   * Export search results to CSV
   */
  async exportSearchResultsToCSV(results, filePath, options = {}) {
    const { delimiter = ',', includeHeaders = true } = options;

    const csvData = results.map(result => ({
      document_id: result.document_id,
      project_id: result.project_id,
      title: result.title,
      document_type: result.document_type,
      relevance_score: result.relevance_score,
      snippet: result.snippet?.replace(/\\n/g, ' ').replace(/"/g, '""'),
      created_at: result.created_at
    }));

    await this.arrayToCSV(csvData, filePath, { delimiter, includeHeaders });

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'csv',
      size: stats.size,
      records: csvData.length
    };
  }

  /**
   * Export chat history to CSV
   */
  async exportChatHistoryToCSV(chats, filePath, options = {}) {
    const { delimiter = ',', includeHeaders = true } = options;

    const csvData = chats.map(chat => ({
      id: chat.id,
      project_id: chat.project_id,
      session_id: chat.session_id,
      question: chat.question.replace(/\\n/g, ' ').replace(/"/g, '""'),
      answer: chat.answer.replace(/\\n/g, ' ').replace(/"/g, '""'),
      response_style: chat.response_style,
      model_used: chat.model_used,
      processing_time: chat.processing_time,
      user_rating: chat.user_rating,
      created_at: chat.created_at
    }));

    await this.arrayToCSV(csvData, filePath, { delimiter, includeHeaders });

    const stats = await fs.stat(filePath);
    
    return {
      filePath: filePath,
      format: 'csv',
      size: stats.size,
      records: csvData.length
    };
  }

  /**
   * Convert array of objects to CSV
   */
  async arrayToCSV(data, filePath, options = {}) {
    const { delimiter = ',', includeHeaders = true } = options;

    if (!data || data.length === 0) {
      await fs.writeFile(filePath, '', 'utf8');
      return;
    }

    const lines = [];

    // Add headers
    if (includeHeaders) {
      const headers = Object.keys(data[0]);
      lines.push(headers.map(h => `"${h}"`).join(delimiter));
    }

    // Add data rows
    for (const row of data) {
      const values = Object.values(row).map(value => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains delimiter or quotes
        if (str.includes(delimiter) || str.includes('"') || str.includes('\\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      lines.push(values.join(delimiter));
    }

    await fs.writeFile(filePath, lines.join('\\n'), 'utf8');
  }

  /**
   * Count total records in export data
   */
  countRecords(data) {
    let total = 0;
    const dataTypes = ['documents', 'text_chunks', 'embeddings', 'channels', 'chat_logs', 'analytics'];
    
    for (const dataType of dataTypes) {
      if (data[dataType] && Array.isArray(data[dataType])) {
        total += data[dataType].length;
      }
    }
    
    return total;
  }

  /**
   * Get export statistics
   */
  getExportStats() {
    // This could track export history, popular formats, etc.
    return {
      total_exports: 0, // Would track in analytics table
      popular_formats: ['json', 'csv', 'markdown'],
      last_export: null
    };
  }
}

module.exports = DataExporter;