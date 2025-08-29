/**
 * Database Migration Manager
 * Handles schema initialization, upgrades, and data migrations
 */

const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');
const { SCHEMA_VERSION, TABLES, INDEXES, TRIGGERS, VIEWS, INITIAL_DATA } = require('../models/schema');

class MigrationManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.migrations = new Map();
    this.loadMigrations();
  }

  /**
   * Initialize database connection
   */
  async connect() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      await fs.mkdir(dir, { recursive: true });

      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null
      });

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 268435456'); // 256MB

      console.log('Database connection established');
      return this.db;
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }

  /**
   * Load migration definitions
   */
  loadMigrations() {
    // Migration from v0.0.0 to v1.0.0 (initial schema)
    this.migrations.set('1.0.0', {
      version: '1.0.0',
      description: 'Initial schema creation',
      up: async (db) => {
        console.log('Running initial schema migration...');
        
        // Create all tables
        const transaction = db.transaction(() => {
          for (const [tableName, sql] of Object.entries(TABLES)) {
            console.log(`Creating table: ${tableName}`);
            db.exec(sql);
          }

          // Create indexes
          for (const [indexName, sql] of Object.entries(INDEXES)) {
            console.log(`Creating index: ${indexName}`);
            db.exec(sql);
          }

          // Create triggers
          for (const [triggerName, sql] of Object.entries(TRIGGERS)) {
            console.log(`Creating trigger: ${triggerName}`);
            db.exec(sql);
          }

          // Create views
          for (const [viewName, sql] of Object.entries(VIEWS)) {
            console.log(`Creating view: ${viewName}`);
            db.exec(sql);
          }

          // Insert initial data
          console.log('Inserting initial data...');
          const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value, category, description) VALUES (?, ?, ?, ?)');
          for (const setting of INITIAL_DATA.system_settings) {
            insertSetting.run(setting.key, setting.value, setting.category, setting.description);
          }

          const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color, description) VALUES (?, ?, ?)');
          for (const tag of INITIAL_DATA.tags) {
            insertTag.run(tag.name, tag.color, tag.description);
          }
        });

        transaction();
        console.log('Initial schema migration completed');
      },
      down: async (db) => {
        // Drop all tables (reverse order)
        const tableNames = Object.keys(TABLES).reverse();
        for (const tableName of tableNames) {
          db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        }
      }
    });

    // Future migrations would be added here
    // Example:
    // this.migrations.set('1.1.0', {
    //   version: '1.1.0',
    //   description: 'Add new feature columns',
    //   up: async (db) => { ... },
    //   down: async (db) => { ... }
    // });
  }

  /**
   * Get current schema version
   */
  getCurrentVersion() {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      const stmt = this.db.prepare('SELECT value FROM system_settings WHERE key = ?');
      const result = stmt.get('schema_version');
      return result ? result.value : '0.0.0';
    } catch (error) {
      // Table doesn't exist yet
      return '0.0.0';
    }
  }

  /**
   * Set schema version
   */
  setVersion(version) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES (?, ?, ?, ?)');
    stmt.run('schema_version', version, 'system', 'Database schema version');
  }

  /**
   * Check if database needs migration
   */
  needsMigration() {
    const currentVersion = this.getCurrentVersion();
    return this.compareVersions(currentVersion, SCHEMA_VERSION) < 0;
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    if (!this.db) {
      await this.connect();
    }

    const currentVersion = this.getCurrentVersion();
    console.log(`Current database version: ${currentVersion}`);
    console.log(`Target schema version: ${SCHEMA_VERSION}`);

    if (!this.needsMigration()) {
      console.log('Database is up to date');
      return;
    }

    // Get migrations to run
    const pendingMigrations = this.getPendingMigrations(currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('No migrations to run');
      return;
    }

    console.log(`Running ${pendingMigrations.length} migration(s)...`);

    // Create backup before migration
    await this.createMigrationBackup();

    try {
      // Run migrations in transaction
      const transaction = this.db.transaction(async () => {
        for (const migration of pendingMigrations) {
          console.log(`Running migration: ${migration.version} - ${migration.description}`);
          await migration.up(this.db);
          this.setVersion(migration.version);
        }
      });

      await transaction();
      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      // Restore from backup if needed
      await this.restoreMigrationBackup();
      throw error;
    }
  }

  /**
   * Get migrations that need to be run
   */
  getPendingMigrations(currentVersion) {
    const pending = [];
    
    for (const [version, migration] of this.migrations) {
      if (this.compareVersions(currentVersion, version) < 0) {
        pending.push(migration);
      }
    }

    // Sort by version
    return pending.sort((a, b) => this.compareVersions(a.version, b.version));
  }

  /**
   * Compare version strings
   */
  compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }
    
    return 0;
  }

  /**
   * Create backup before migration
   */
  async createMigrationBackup() {
    if (!this.db) return;

    const backupPath = `${this.dbPath}.backup.${Date.now()}`;
    
    try {
      console.log(`Creating migration backup: ${backupPath}`);
      await this.db.backup(backupPath);
      this.lastBackupPath = backupPath;
    } catch (error) {
      console.warn('Failed to create migration backup:', error);
    }
  }

  /**
   * Restore from backup if migration fails
   */
  async restoreMigrationBackup() {
    if (!this.lastBackupPath) return;

    try {
      console.log(`Restoring from backup: ${this.lastBackupPath}`);
      
      // Close current connection
      this.db.close();
      
      // Replace with backup
      await fs.copyFile(this.lastBackupPath, this.dbPath);
      
      // Reconnect
      await this.connect();
      
      console.log('Database restored from backup');
    } catch (error) {
      console.error('Failed to restore from backup:', error);
    }
  }

  /**
   * Cleanup old backup files
   */
  async cleanupBackups(retentionDays = 7) {
    try {
      const dir = path.dirname(this.dbPath);
      const files = await fs.readdir(dir);
      const backupFiles = files.filter(f => f.includes('.backup.'));
      
      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      
      for (const file of backupFiles) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old backup: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Vacuum database to optimize storage
   */
  vacuum() {
    if (!this.db) return;
    
    console.log('Running database vacuum...');
    this.db.exec('VACUUM');
    console.log('Database vacuum completed');
  }

  /**
   * Analyze database for query optimization
   */
  analyze() {
    if (!this.db) return;
    
    console.log('Running database analysis...');
    this.db.exec('ANALYZE');
    console.log('Database analysis completed');
  }

  /**
   * Get database statistics
   */
  getStats() {
    if (!this.db) return null;

    const stats = {};
    
    // Table row counts
    const tables = Object.keys(TABLES);
    for (const table of tables) {
      try {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
        const result = stmt.get();
        stats[table] = result.count;
      } catch (error) {
        stats[table] = 0;
      }
    }

    // Database size
    const stmt = this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');
    const result = stmt.get();
    stats.database_size = result.size;

    return stats;
  }

  /**
   * Check database integrity
   */
  checkIntegrity() {
    if (!this.db) return false;

    try {
      const stmt = this.db.prepare('PRAGMA integrity_check');
      const result = stmt.get();
      return result.integrity_check === 'ok';
    } catch (error) {
      console.error('Integrity check failed:', error);
      return false;
    }
  }
}

module.exports = MigrationManager;