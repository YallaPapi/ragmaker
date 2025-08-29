/**
 * Maintenance Manager - Database optimization and maintenance routines
 * Handles performance optimization, cleanup, and health monitoring
 */

const fs = require('fs').promises;
const path = require('path');

class MaintenanceManager {
  constructor(database) {
    this.db = database;
    this.maintenanceHistory = [];
    this.scheduledTasks = new Map();
    this.isRunning = false;
    
    this.prepareStatements();
    this.initializeScheduler();
  }

  /**
   * Prepare SQL statements for maintenance operations
   */
  prepareStatements() {
    this.statements = {
      // Health check queries
      getTableSizes: this.db.prepare(`
        SELECT 
          name,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=m.name) as exists,
          (SELECT COUNT(*) FROM pragma_table_info(m.name)) as columns
        FROM sqlite_master m 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `),

      // Orphaned record detection
      orphanedChunks: this.db.prepare(`
        SELECT COUNT(*) as count
        FROM text_chunks tc
        LEFT JOIN documents d ON tc.document_id = d.id
        WHERE d.id IS NULL
      `),

      orphanedEmbeddings: this.db.prepare(`
        SELECT COUNT(*) as count
        FROM embeddings e
        LEFT JOIN text_chunks tc ON e.chunk_id = tc.id
        WHERE tc.id IS NULL
      `),

      // Duplicate detection
      duplicateDocuments: this.db.prepare(`
        SELECT content_hash, COUNT(*) as count
        FROM documents 
        WHERE content_hash IS NOT NULL
        GROUP BY content_hash
        HAVING COUNT(*) > 1
      `),

      // Performance metrics
      queryPerformance: this.db.prepare(`
        SELECT 
          AVG(duration) as avg_duration,
          MAX(duration) as max_duration,
          COUNT(*) as total_queries
        FROM analytics 
        WHERE event_type = 'query' AND duration IS NOT NULL
        AND created_at >= datetime('now', '-7 days')
      `),

      // Storage usage
      storageStats: this.db.prepare(`
        SELECT 
          SUM(LENGTH(content)) as total_content_size,
          COUNT(*) as total_chunks
        FROM text_chunks
      `),

      // Cleanup operations
      deleteOrphanedChunks: this.db.prepare(`
        DELETE FROM text_chunks 
        WHERE document_id NOT IN (SELECT id FROM documents)
      `),

      deleteOrphanedEmbeddings: this.db.prepare(`
        DELETE FROM embeddings 
        WHERE chunk_id NOT IN (SELECT id FROM text_chunks)
      `),

      deleteOldAnalytics: this.db.prepare(`
        DELETE FROM analytics 
        WHERE created_at < datetime('now', '-90 days')
      `),

      updateProjectStats: this.db.prepare(`
        UPDATE projects 
        SET 
          vector_count = (SELECT COUNT(*) FROM embeddings WHERE project_id = projects.id),
          storage_size = (SELECT SUM(LENGTH(content)) FROM text_chunks WHERE project_id = projects.id)
      `),

      // Index statistics
      indexUsage: this.db.prepare(`
        SELECT name, tbl_name FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
      `)
    };
  }

  /**
   * Initialize maintenance scheduler
   */
  initializeScheduler() {
    // Schedule daily maintenance at 2 AM (if app is running)
    this.scheduleTask('daily_maintenance', '02:00', async () => {
      await this.runDailyMaintenance();
    });

    // Schedule weekly deep maintenance on Sundays at 1 AM
    this.scheduleTask('weekly_maintenance', 'Sunday 01:00', async () => {
      await this.runWeeklyMaintenance();
    });

    // Schedule monthly optimization on 1st of month at midnight
    this.scheduleTask('monthly_optimization', 'monthly 00:00', async () => {
      await this.runMonthlyOptimization();
    });
  }

  /**
   * Schedule a maintenance task
   */
  scheduleTask(name, schedule, callback) {
    this.scheduledTasks.set(name, {
      schedule,
      callback,
      lastRun: null,
      nextRun: this.calculateNextRun(schedule)
    });
  }

  /**
   * Calculate next run time for scheduled task
   */
  calculateNextRun(schedule) {
    const now = new Date();
    
    if (schedule.includes(':')) {
      // Daily schedule like "02:00"
      const [hours, minutes] = schedule.split(':').map(Number);
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next;
    }
    
    if (schedule.startsWith('Sunday')) {
      // Weekly schedule like "Sunday 01:00"
      const [, time] = schedule.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      const next = new Date(now);
      
      // Find next Sunday
      const daysUntilSunday = (7 - now.getDay()) % 7;
      next.setDate(next.getDate() + daysUntilSunday);
      next.setHours(hours, minutes, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 7);
      }
      
      return next;
    }
    
    if (schedule.startsWith('monthly')) {
      // Monthly schedule like "monthly 00:00"
      const [, time] = schedule.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      const next = new Date(now);
      
      // First day of next month
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(hours, minutes, 0, 0);
      
      return next;
    }
    
    // Default: run in 24 hours
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * Start the maintenance scheduler
   */
  startScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    this.schedulerInterval = setInterval(() => {
      const now = new Date();
      
      for (const [name, task] of this.scheduledTasks) {
        if (now >= task.nextRun && !this.isRunning) {
          console.log(`Running scheduled maintenance task: ${name}`);
          
          task.callback()
            .then(() => {
              task.lastRun = now;
              task.nextRun = this.calculateNextRun(task.schedule);
              console.log(`Completed maintenance task: ${name}`);
            })
            .catch(error => {
              console.error(`Maintenance task failed: ${name}`, error);
            });
        }
      }
    }, 60000); // Check every minute

    console.log('Maintenance scheduler started');
  }

  /**
   * Stop the maintenance scheduler
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log('Maintenance scheduler stopped');
    }
  }

  /**
   * Run comprehensive database health check
   */
  async runHealthCheck() {
    console.log('Running database health check...');
    const startTime = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      overall_status: 'healthy',
      issues: [],
      recommendations: [],
      statistics: {},
      performance: {}
    };

    try {
      // Check table integrity
      const integrityCheck = this.db.prepare('PRAGMA integrity_check').get();
      if (integrityCheck.integrity_check !== 'ok') {
        report.issues.push('Database integrity check failed');
        report.overall_status = 'warning';
      }

      // Check for orphaned records
      const orphanedChunks = this.statements.orphanedChunks.get();
      if (orphanedChunks.count > 0) {
        report.issues.push(`${orphanedChunks.count} orphaned text chunks found`);
        report.recommendations.push('Run cleanup to remove orphaned chunks');
      }

      const orphanedEmbeddings = this.statements.orphanedEmbeddings.get();
      if (orphanedEmbeddings.count > 0) {
        report.issues.push(`${orphanedEmbeddings.count} orphaned embeddings found`);
        report.recommendations.push('Run cleanup to remove orphaned embeddings');
      }

      // Check for duplicate documents
      const duplicates = this.statements.duplicateDocuments.all();
      if (duplicates.length > 0) {
        report.issues.push(`${duplicates.length} sets of duplicate documents found`);
        report.recommendations.push('Review and merge duplicate documents');
      }

      // Get database statistics
      report.statistics = await this.gatherStatistics();

      // Check performance metrics
      const performance = this.statements.queryPerformance.get();
      if (performance.avg_duration > 1000) { // > 1 second average
        report.issues.push('Query performance is slow');
        report.recommendations.push('Consider running VACUUM and ANALYZE');
        report.overall_status = 'warning';
      }

      // Check storage usage
      const storage = this.statements.storageStats.get();
      const avgChunkSize = storage.total_content_size / storage.total_chunks;
      if (avgChunkSize > 2000) { // Large chunks might slow search
        report.recommendations.push('Consider reducing chunk size for better search performance');
      }

      report.performance = {
        avg_query_duration: performance.avg_duration,
        max_query_duration: performance.max_duration,
        total_queries: performance.total_queries,
        avg_chunk_size: Math.round(avgChunkSize)
      };

      // Final status determination
      if (report.issues.length === 0) {
        report.overall_status = 'healthy';
      } else if (report.issues.some(issue => issue.includes('integrity'))) {
        report.overall_status = 'critical';
      } else {
        report.overall_status = 'warning';
      }

    } catch (error) {
      report.overall_status = 'error';
      report.issues.push(`Health check failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;
    report.check_duration = duration;

    console.log(`Health check completed in ${duration}ms - Status: ${report.overall_status}`);
    this.recordMaintenanceActivity('health_check', duration, report.overall_status);

    return report;
  }

  /**
   * Run daily maintenance routine
   */
  async runDailyMaintenance() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('Starting daily maintenance...');
    const startTime = Date.now();

    try {
      // Update project statistics
      console.log('Updating project statistics...');
      this.statements.updateProjectStats.run();

      // Clean up old analytics (keep 90 days)
      console.log('Cleaning up old analytics...');
      const deleted = this.statements.deleteOldAnalytics.run();
      console.log(`Deleted ${deleted.changes} old analytics records`);

      // Clean up orphaned records
      await this.cleanupOrphanedRecords();

      // Update search index statistics
      this.db.exec('ANALYZE search_index');

      const duration = Date.now() - startTime;
      console.log(`Daily maintenance completed in ${duration}ms`);
      this.recordMaintenanceActivity('daily_maintenance', duration, 'success');

    } catch (error) {
      console.error('Daily maintenance failed:', error);
      this.recordMaintenanceActivity('daily_maintenance', Date.now() - startTime, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run weekly maintenance routine
   */
  async runWeeklyMaintenance() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('Starting weekly maintenance...');
    const startTime = Date.now();

    try {
      // Run daily maintenance first
      await this.runDailyMaintenance();

      // Run ANALYZE on all tables
      console.log('Analyzing database statistics...');
      this.db.exec('ANALYZE');

      // Compact WAL file
      console.log('Compacting WAL file...');
      this.db.checkpoint();

      // Check and repair indexes if needed
      await this.checkAndRepairIndexes();

      const duration = Date.now() - startTime;
      console.log(`Weekly maintenance completed in ${duration}ms`);
      this.recordMaintenanceActivity('weekly_maintenance', duration, 'success');

    } catch (error) {
      console.error('Weekly maintenance failed:', error);
      this.recordMaintenanceActivity('weekly_maintenance', Date.now() - startTime, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run monthly optimization routine
   */
  async runMonthlyOptimization() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('Starting monthly optimization...');
    const startTime = Date.now();

    try {
      // Run weekly maintenance first
      await this.runWeeklyMaintenance();

      // Run VACUUM to reclaim space
      console.log('Running VACUUM...');
      this.db.exec('VACUUM');

      // Rebuild FTS index
      console.log('Rebuilding full-text search index...');
      this.db.exec('INSERT INTO search_index(search_index) VALUES(\"rebuild\")');

      // Optimize vector storage
      console.log('Optimizing vector storage...');
      // This would call the vector store optimization if available

      const duration = Date.now() - startTime;
      console.log(`Monthly optimization completed in ${duration}ms`);
      this.recordMaintenanceActivity('monthly_optimization', duration, 'success');

    } catch (error) {
      console.error('Monthly optimization failed:', error);
      this.recordMaintenanceActivity('monthly_optimization', Date.now() - startTime, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up orphaned records
   */
  async cleanupOrphanedRecords() {
    console.log('Cleaning up orphaned records...');
    
    const deletedChunks = this.statements.deleteOrphanedChunks.run();
    if (deletedChunks.changes > 0) {
      console.log(`Deleted ${deletedChunks.changes} orphaned text chunks`);
    }

    const deletedEmbeddings = this.statements.deleteOrphanedEmbeddings.run();
    if (deletedEmbeddings.changes > 0) {
      console.log(`Deleted ${deletedEmbeddings.changes} orphaned embeddings`);
    }
  }

  /**
   * Check and repair database indexes
   */
  async checkAndRepairIndexes() {
    console.log('Checking database indexes...');
    
    const indexes = this.statements.indexUsage.all();
    
    for (const index of indexes) {
      try {
        // Check if index is valid
        this.db.prepare(`SELECT * FROM ${index.tbl_name} INDEXED BY ${index.name} LIMIT 1`).get();
      } catch (error) {
        console.warn(`Index ${index.name} may be corrupted:`, error.message);
        
        try {
          // Try to rebuild the index
          this.db.exec(`REINDEX ${index.name}`);
          console.log(`Rebuilt index: ${index.name}`);
        } catch (rebuildError) {
          console.error(`Failed to rebuild index ${index.name}:`, rebuildError);
        }
      }
    }
  }

  /**
   * Gather comprehensive database statistics
   */
  async gatherStatistics() {
    const stats = {};

    try {
      // Table sizes
      const tables = this.statements.getTableSizes.all();
      stats.tables = {};
      
      for (const table of tables) {
        const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        stats.tables[table.name] = {
          rows: count.count,
          columns: table.columns
        };
      }

      // Database file size
      const dbPath = this.db.name; // This might vary based on better-sqlite3 version
      if (dbPath) {
        try {
          const dbStats = await fs.stat(dbPath);
          stats.database_size = dbStats.size;
        } catch (error) {
          console.warn('Could not get database file size:', error);
        }
      }

      // Page statistics
      const pageCount = this.db.prepare('PRAGMA page_count').get();
      const pageSize = this.db.prepare('PRAGMA page_size').get();
      const freePages = this.db.prepare('PRAGMA freelist_count').get();

      stats.pages = {
        total_pages: pageCount.page_count,
        page_size: pageSize.page_size,
        free_pages: freePages.freelist_count,
        used_pages: pageCount.page_count - freePages.freelist_count,
        total_size: pageCount.page_count * pageSize.page_size,
        free_size: freePages.freelist_count * pageSize.page_size
      };

      // Cache statistics
      const cacheStats = this.db.prepare('PRAGMA cache_size').get();
      stats.cache = {
        cache_size: Math.abs(cacheStats.cache_size),
        cache_type: cacheStats.cache_size > 0 ? 'pages' : 'KB'
      };

    } catch (error) {
      console.warn('Error gathering statistics:', error);
    }

    return stats;
  }

  /**
   * Record maintenance activity for tracking
   */
  recordMaintenanceActivity(activity, duration, status) {
    const record = {
      activity,
      timestamp: new Date().toISOString(),
      duration,
      status
    };

    this.maintenanceHistory.push(record);
    
    // Keep only last 100 records
    if (this.maintenanceHistory.length > 100) {
      this.maintenanceHistory = this.maintenanceHistory.slice(-100);
    }

    // Also log to analytics if database is available
    try {
      this.db.prepare(`
        INSERT INTO analytics (event_type, metadata, duration, success)
        VALUES (?, ?, ?, ?)
      `).run('maintenance', JSON.stringify(record), duration, status === 'success');
    } catch (error) {
      console.warn('Failed to log maintenance activity:', error);
    }
  }

  /**
   * Get maintenance history
   */
  getMaintenanceHistory(limit = 50) {
    return this.maintenanceHistory.slice(-limit);
  }

  /**
   * Get maintenance statistics
   */
  getMaintenanceStats() {
    const stats = {
      total_activities: this.maintenanceHistory.length,
      last_activity: null,
      success_rate: 0,
      average_duration: 0,
      by_type: {}
    };

    if (this.maintenanceHistory.length === 0) {
      return stats;
    }

    stats.last_activity = this.maintenanceHistory[this.maintenanceHistory.length - 1];
    
    const successful = this.maintenanceHistory.filter(a => a.status === 'success').length;
    stats.success_rate = successful / this.maintenanceHistory.length;

    const totalDuration = this.maintenanceHistory.reduce((sum, a) => sum + a.duration, 0);
    stats.average_duration = totalDuration / this.maintenanceHistory.length;

    // Group by activity type
    for (const activity of this.maintenanceHistory) {
      if (!stats.by_type[activity.activity]) {
        stats.by_type[activity.activity] = { count: 0, avg_duration: 0, success_rate: 0 };
      }
      stats.by_type[activity.activity].count++;
    }

    return stats;
  }

  /**
   * Force run specific maintenance task
   */
  async runMaintenanceTask(taskName) {
    switch (taskName) {
      case 'health_check':
        return await this.runHealthCheck();
      case 'daily_maintenance':
        return await this.runDailyMaintenance();
      case 'weekly_maintenance':
        return await this.runWeeklyMaintenance();
      case 'monthly_optimization':
        return await this.runMonthlyOptimization();
      case 'cleanup_orphaned':
        return await this.cleanupOrphanedRecords();
      case 'vacuum':
        this.db.exec('VACUUM');
        return { success: true, message: 'Database vacuumed successfully' };
      case 'analyze':
        this.db.exec('ANALYZE');
        return { success: true, message: 'Database analysis completed' };
      case 'checkpoint':
        this.db.checkpoint();
        return { success: true, message: 'WAL checkpoint completed' };
      default:
        throw new Error(`Unknown maintenance task: ${taskName}`);
    }
  }
}

module.exports = MaintenanceManager;