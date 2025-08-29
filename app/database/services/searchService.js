/**
 * Search Service - Full-text search capabilities with advanced filtering
 * Provides comprehensive search across documents, chunks, and metadata
 */

class SearchService {
  constructor(database) {
    this.db = database;
    this.prepareStatements();
  }

  /**
   * Prepare SQL statements for search operations
   */
  prepareStatements() {
    this.statements = {
      // Full-text search in content
      fullTextSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        WHERE si MATCH ?
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Search with project filter
      projectSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        WHERE si MATCH ? AND si.project_id = ?
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Search in specific document types
      typeSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        WHERE si MATCH ? AND d.type = ?
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Search documents by title
      titleSearch: this.db.prepare(`
        SELECT *
        FROM documents 
        WHERE title LIKE ? 
        ORDER BY 
          CASE WHEN title LIKE ? THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT ?
      `),

      // Search with date range
      dateRangeSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        WHERE si MATCH ? 
          AND d.created_at BETWEEN ? AND ?
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Search with tags
      tagSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position,
          GROUP_CONCAT(t.name) as tags
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        JOIN document_tags dt ON d.id = dt.document_id
        JOIN tags t ON dt.tag_id = t.id
        WHERE si MATCH ? AND t.name IN (${Array(10).fill('?').join(',')})
        GROUP BY si.document_id
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Advanced search with multiple filters
      advancedSearch: this.db.prepare(`
        SELECT 
          si.document_id,
          si.project_id,
          si.title,
          si.content,
          si.metadata,
          bm25(si) as relevance_score,
          d.type as document_type,
          d.url,
          d.created_at,
          tc.chunk_index,
          tc.start_position,
          tc.end_position
        FROM search_index si
        JOIN documents d ON si.document_id = d.id
        JOIN text_chunks tc ON tc.document_id = si.document_id
        WHERE si MATCH ?
          AND (? IS NULL OR si.project_id = ?)
          AND (? IS NULL OR d.type = ?)
          AND (? IS NULL OR d.created_at >= ?)
          AND (? IS NULL OR d.created_at <= ?)
        ORDER BY bm25(si) DESC
        LIMIT ?
      `),

      // Get search suggestions
      suggestions: this.db.prepare(`
        SELECT DISTINCT title
        FROM documents 
        WHERE title LIKE ?
        ORDER BY title
        LIMIT ?
      `),

      // Popular search terms (from analytics)
      popularTerms: this.db.prepare(`
        SELECT 
          JSON_EXTRACT(metadata, '$.query') as search_term,
          COUNT(*) as frequency
        FROM analytics 
        WHERE event_type = 'search' 
          AND created_at >= datetime('now', '-30 days')
          AND JSON_EXTRACT(metadata, '$.query') IS NOT NULL
        GROUP BY search_term
        ORDER BY frequency DESC
        LIMIT ?
      `)
    };
  }

  /**
   * Perform full-text search
   */
  async search(query, options = {}) {
    const {
      projectId = null,
      documentType = null,
      limit = 50,
      includeHighlights = true,
      tags = [],
      dateFrom = null,
      dateTo = null
    } = options;

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    // Sanitize and prepare the FTS query
    const ftsQuery = this.prepareFTSQuery(query);
    let results = [];

    try {
      // Choose appropriate search based on filters
      if (projectId && documentType) {
        // Both project and type filters
        results = this.db.prepare(`
          SELECT 
            si.document_id,
            si.project_id,
            si.title,
            si.content,
            si.metadata,
            bm25(si) as relevance_score,
            d.type as document_type,
            d.url,
            d.created_at,
            tc.chunk_index,
            tc.start_position,
            tc.end_position
          FROM search_index si
          JOIN documents d ON si.document_id = d.id
          JOIN text_chunks tc ON tc.document_id = si.document_id
          WHERE si MATCH ? AND si.project_id = ? AND d.type = ?
          ORDER BY bm25(si) DESC
          LIMIT ?
        `).all(ftsQuery, projectId, documentType, limit);
      } else if (projectId) {
        results = this.statements.projectSearch.all(ftsQuery, projectId, limit);
      } else if (documentType) {
        results = this.statements.typeSearch.all(ftsQuery, documentType, limit);
      } else if (dateFrom && dateTo) {
        results = this.statements.dateRangeSearch.all(ftsQuery, dateFrom, dateTo, limit);
      } else if (tags.length > 0) {
        // Pad with nulls for unused parameters
        const tagParams = [...tags.slice(0, 10), ...Array(10 - Math.min(tags.length, 10)).fill(null)];
        results = this.statements.tagSearch.all(ftsQuery, ...tagParams, limit);
      } else {
        results = this.statements.fullTextSearch.all(ftsQuery, limit);
      }

      // Post-process results
      const processedResults = await this.processSearchResults(results, query, {
        includeHighlights,
        ...options
      });

      // Log search analytics
      await this.logSearchAnalytics(query, options, processedResults.length);

      return {
        query: query,
        results: processedResults,
        total: processedResults.length,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Advanced search with complex filters
   */
  async advancedSearch(query, filters = {}) {
    const {
      projectId = null,
      documentType = null,
      dateFrom = null,
      dateTo = null,
      limit = 50,
      minRelevanceScore = 0.1
    } = filters;

    const ftsQuery = this.prepareFTSQuery(query);

    const results = this.statements.advancedSearch.all(
      ftsQuery,
      projectId, projectId, // Double for IS NULL check
      documentType, documentType,
      dateFrom, dateFrom,
      dateTo, dateTo,
      limit
    );

    // Filter by minimum relevance score
    const filteredResults = results.filter(r => r.relevance_score >= minRelevanceScore);

    return await this.processSearchResults(filteredResults, query, filters);
  }

  /**
   * Search by document title
   */
  async searchByTitle(titleQuery, options = {}) {
    const { limit = 20 } = options;
    const likePattern = `%${titleQuery}%`;
    const exactPattern = `${titleQuery}%`;

    const results = this.statements.titleSearch.all(likePattern, exactPattern, limit);
    return results.map(doc => ({
      ...doc,
      relevance_score: this.calculateTitleRelevance(doc.title, titleQuery),
      search_type: 'title'
    }));
  }

  /**
   * Get search suggestions based on existing documents
   */
  async getSuggestions(partial, limit = 10) {
    if (!partial || partial.length < 2) {
      return [];
    }

    const pattern = `${partial}%`;
    const results = this.statements.suggestions.all(pattern, limit);
    
    return results.map(r => ({
      text: r.title,
      type: 'document_title'
    }));
  }

  /**
   * Get popular search terms
   */
  async getPopularSearchTerms(limit = 10) {
    return this.statements.popularTerms.all(limit);
  }

  /**
   * Prepare FTS query with proper escaping and operators
   */
  prepareFTSQuery(query) {
    // Remove special characters that could break FTS
    let cleanQuery = query
      .replace(/[^\w\s"'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Handle quoted phrases
    const phrases = cleanQuery.match(/"[^"]+"/g) || [];
    const remainingQuery = cleanQuery.replace(/"[^"]+"/g, '').trim();

    // Split remaining words
    const words = remainingQuery.split(/\s+/).filter(word => word.length > 0);

    // Build FTS query
    const ftsTerms = [];
    
    // Add phrases as-is
    ftsTerms.push(...phrases);
    
    // Add individual words with prefix matching
    for (const word of words) {
      if (word.length >= 3) {
        ftsTerms.push(`${word}*`);
      } else {
        ftsTerms.push(word);
      }
    }

    return ftsTerms.join(' OR ');
  }

  /**
   * Process and enrich search results
   */
  async processSearchResults(results, originalQuery, options = {}) {
    const { includeHighlights = true, contextLength = 150 } = options;

    return results.map(result => {
      const processed = {
        ...result,
        search_type: 'full_text'
      };

      // Add content highlights
      if (includeHighlights && result.content) {
        processed.highlighted_content = this.highlightMatches(
          result.content, 
          originalQuery, 
          contextLength
        );
      }

      // Parse metadata if it's a JSON string
      if (typeof result.metadata === 'string') {
        try {
          processed.metadata = JSON.parse(result.metadata);
        } catch (e) {
          processed.metadata = {};
        }
      }

      // Add snippet for preview
      if (result.content) {
        processed.snippet = this.generateSnippet(result.content, originalQuery, contextLength);
      }

      return processed;
    });
  }

  /**
   * Highlight search term matches in content
   */
  highlightMatches(content, query, contextLength = 150) {
    if (!content || !query) return content;

    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    if (words.length === 0) return content;

    let highlighted = content;
    
    // Find the best matching position
    const positions = [];
    for (const word of words) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\w*`, 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        positions.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    if (positions.length === 0) return content;

    // Sort positions and merge overlapping
    positions.sort((a, b) => a.start - b.start);
    const mergedPositions = [];
    let current = positions[0];

    for (let i = 1; i < positions.length; i++) {
      if (positions[i].start <= current.end + 10) {
        current.end = Math.max(current.end, positions[i].end);
      } else {
        mergedPositions.push(current);
        current = positions[i];
      }
    }
    mergedPositions.push(current);

    // Apply highlights (reverse order to maintain positions)
    for (let i = mergedPositions.length - 1; i >= 0; i--) {
      const pos = mergedPositions[i];
      const before = highlighted.substring(0, pos.start);
      const match = highlighted.substring(pos.start, pos.end);
      const after = highlighted.substring(pos.end);
      highlighted = `${before}<mark>${match}</mark>${after}`;
    }

    return highlighted;
  }

  /**
   * Generate content snippet with context around matches
   */
  generateSnippet(content, query, maxLength = 150) {
    if (!content) return '';

    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    if (words.length === 0) {
      return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    }

    // Find first significant match
    const contentLower = content.toLowerCase();
    let bestMatchPos = -1;
    let bestWord = '';

    for (const word of words) {
      const pos = contentLower.indexOf(word);
      if (pos !== -1 && (bestMatchPos === -1 || pos < bestMatchPos)) {
        bestMatchPos = pos;
        bestWord = word;
      }
    }

    if (bestMatchPos === -1) {
      return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    }

    // Extract context around the match
    const halfLength = Math.floor(maxLength / 2);
    const start = Math.max(0, bestMatchPos - halfLength);
    const end = Math.min(content.length, bestMatchPos + bestWord.length + halfLength);

    let snippet = content.substring(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Calculate relevance score for title matches
   */
  calculateTitleRelevance(title, query) {
    const titleLower = title.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match gets highest score
    if (titleLower === queryLower) return 1.0;

    // Starts with query gets high score
    if (titleLower.startsWith(queryLower)) return 0.8;

    // Contains query gets medium score
    if (titleLower.includes(queryLower)) return 0.6;

    // Word matches get lower score
    const queryWords = queryLower.split(/\s+/);
    const titleWords = titleLower.split(/\s+/);
    const matchingWords = queryWords.filter(qw => 
      titleWords.some(tw => tw.includes(qw) || qw.includes(tw))
    );

    return matchingWords.length / queryWords.length * 0.4;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  }

  /**
   * Log search analytics
   */
  async logSearchAnalytics(query, options, resultCount) {
    try {
      const metadata = {
        query: query,
        options: options,
        result_count: resultCount,
        timestamp: new Date().toISOString()
      };

      // This would typically call the analytics service
      // For now, we'll use the database directly
      this.db.prepare(`
        INSERT INTO analytics (event_type, project_id, metadata, success)
        VALUES (?, ?, ?, ?)
      `).run('search', options.projectId || null, JSON.stringify(metadata), true);
    } catch (error) {
      console.warn('Failed to log search analytics:', error);
    }
  }

  /**
   * Search across multiple projects with aggregated results
   */
  async globalSearch(query, options = {}) {
    const { limit = 100, groupByProject = false } = options;

    const results = await this.search(query, { ...options, limit });

    if (!groupByProject) {
      return results;
    }

    // Group results by project
    const grouped = {};
    for (const result of results.results) {
      if (!grouped[result.project_id]) {
        grouped[result.project_id] = [];
      }
      grouped[result.project_id].push(result);
    }

    return {
      ...results,
      grouped_results: grouped
    };
  }

  /**
   * Get search statistics
   */
  getSearchStats() {
    const stats = {};

    try {
      // Total searches
      const totalSearches = this.db.prepare(`
        SELECT COUNT(*) as count FROM analytics WHERE event_type = 'search'
      `).get();
      stats.total_searches = totalSearches.count;

      // Recent searches
      const recentSearches = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM analytics 
        WHERE event_type = 'search' AND created_at >= datetime('now', '-7 days')
      `).get();
      stats.recent_searches = recentSearches.count;

      // Average results per search
      const avgResults = this.db.prepare(`
        SELECT AVG(CAST(JSON_EXTRACT(metadata, '$.result_count') as INTEGER)) as avg_results
        FROM analytics 
        WHERE event_type = 'search' AND JSON_EXTRACT(metadata, '$.result_count') IS NOT NULL
      `).get();
      stats.avg_results_per_search = avgResults.avg_results || 0;

    } catch (error) {
      console.warn('Failed to get search stats:', error);
    }

    return stats;
  }
}

module.exports = SearchService;