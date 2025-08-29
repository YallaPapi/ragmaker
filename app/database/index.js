/**
 * Database Module Entry Point
 * Exports all database components for easy importing
 */

// Core database components
const DatabaseManager = require('./services/databaseManager');
const MigrationManager = require('./migrations/migrationManager');
const VectorStore = require('./services/vectorStore');
const SearchService = require('./services/searchService');
const BackupService = require('./services/backupService');

// Utility components
const DataExporter = require('./utils/dataExporter');
const MaintenanceManager = require('./utils/maintenanceManager');

// UI components
const { DatabaseManagerUI, DATABASE_MANAGER_STYLES } = require('./ui/databaseManager');

// Schema and models
const Schema = require('./models/schema');

/**
 * Initialize complete database system
 */
async function initializeDatabase(options = {}) {
  const dbManager = new DatabaseManager(options);
  await dbManager.initialize();
  
  return {
    manager: dbManager,
    vectorStore: dbManager.getVectorStore(),
    searchService: dbManager.getSearchService(),
    backupService: dbManager.getBackupService()
  };
}

/**
 * Create database management UI
 */
function createDatabaseUI(databaseManager) {
  return new DatabaseManagerUI(databaseManager);
}

/**
 * Database configuration defaults
 */
const DEFAULT_CONFIG = {
  dbPath: 'data/ragmaker.db',
  enableWAL: true,
  enableForeignKeys: true,
  timeout: 5000,
  cacheSize: 10000,
  autoMaintenance: true,
  backupRetentionDays: 30,
  analyticsRetentionDays: 90
};

/**
 * Utility function to get database statistics
 */
async function getDatabaseStats(dbManager) {
  if (!dbManager) return null;
  
  try {
    const basicStats = dbManager.getStats();
    const vectorStats = dbManager.getVectorStore().getStats();
    const searchStats = dbManager.getSearchService().getSearchStats();
    
    return {
      database: basicStats,
      vectors: vectorStats,
      search: searchStats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to get database statistics:', error);
    return null;
  }
}

/**
 * Utility function to perform complete database health check
 */
async function performHealthCheck(dbManager) {
  if (!dbManager || !dbManager.isInitialized) {
    return {
      status: 'error',
      message: 'Database not initialized'
    };
  }

  try {
    const maintenanceManager = new MaintenanceManager(dbManager.getDatabase());
    return await maintenanceManager.runHealthCheck();
  } catch (error) {
    return {
      status: 'error',
      message: `Health check failed: ${error.message}`,
      error: error
    };
  }
}

/**
 * Utility function to create a complete backup
 */
async function createCompleteBackup(dbManager, options = {}) {
  if (!dbManager || !dbManager.isInitialized) {
    throw new Error('Database not initialized');
  }

  const backupService = dbManager.getBackupService();
  if (!backupService) {
    throw new Error('Backup service not available');
  }

  return await backupService.createFullBackup(options);
}

/**
 * Utility function to export project data
 */
async function exportProjectData(dbManager, projectId, format = 'json', options = {}) {
  if (!dbManager || !dbManager.isInitialized) {
    throw new Error('Database not initialized');
  }

  const dataExporter = new DataExporter(dbManager.getDatabase());
  return await dataExporter.exportProject(projectId, format, options);
}

/**
 * Database migration utilities
 */
const MigrationUtils = {
  /**
   * Check if database needs migration
   */
  async needsMigration(dbPath) {
    try {
      const migrationManager = new MigrationManager(dbPath);
      await migrationManager.connect();
      const needs = migrationManager.needsMigration();
      migrationManager.close();
      return needs;
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  },

  /**
   * Run database migrations
   */
  async runMigrations(dbPath) {
    try {
      const migrationManager = new MigrationManager(dbPath);
      await migrationManager.connect();
      await migrationManager.migrate();
      migrationManager.close();
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }
};

/**
 * Vector search utilities
 */
const VectorUtils = {
  /**
   * Bulk store embeddings with progress callback
   */
  async bulkStoreWithProgress(vectorStore, embeddings, progressCallback) {
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < embeddings.length; i += batchSize) {
      batches.push(embeddings.slice(i, i + batchSize));
    }

    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const batchResults = await vectorStore.bulkStoreEmbeddings(batches[i]);
      results.push(...batchResults);
      
      if (progressCallback) {
        progressCallback({
          completed: (i + 1) * batchSize,
          total: embeddings.length,
          percentage: Math.round(((i + 1) / batches.length) * 100)
        });
      }
    }

    return results;
  },

  /**
   * Optimize vector search performance
   */
  async optimizeVectorSearch(vectorStore) {
    try {
      vectorStore.optimize();
      return { success: true, message: 'Vector search optimized' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
};

/**
 * Search utilities
 */
const SearchUtils = {
  /**
   * Perform advanced search with multiple criteria
   */
  async advancedSearch(searchService, query, filters = {}) {
    try {
      return await searchService.advancedSearch(query, filters);
    } catch (error) {
      console.error('Advanced search failed:', error);
      throw error;
    }
  },

  /**
   * Get search analytics
   */
  async getSearchAnalytics(searchService, days = 30) {
    const analytics = searchService.getSearchStats();
    return {
      ...analytics,
      period_days: days,
      generated_at: new Date().toISOString()
    };
  }
};

// Export all components and utilities
module.exports = {
  // Core components
  DatabaseManager,
  MigrationManager,
  VectorStore,
  SearchService,
  BackupService,
  DataExporter,
  MaintenanceManager,
  
  // UI components
  DatabaseManagerUI,
  DATABASE_MANAGER_STYLES,
  
  // Schema
  Schema,
  
  // Configuration
  DEFAULT_CONFIG,
  
  // Main functions
  initializeDatabase,
  createDatabaseUI,
  
  // Utility functions
  getDatabaseStats,
  performHealthCheck,
  createCompleteBackup,
  exportProjectData,
  
  // Utility modules
  MigrationUtils,
  VectorUtils,
  SearchUtils
};