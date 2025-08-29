/**
 * Backup Service - Comprehensive backup and restore functionality
 * Supports full, incremental, and project-specific backups with compression
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupService {
  constructor(dbPath, database) {
    this.dbPath = dbPath;
    this.db = database;
    this.backupDir = path.join(path.dirname(dbPath), 'backups');
    this.maxBackupRetention = 30; // days
    
    this.prepareStatements();
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create backup directory:', error);
    }
  }

  /**
   * Prepare SQL statements
   */
  prepareStatements() {
    this.statements = {
      insertBackupMetadata: this.db.prepare(`
        INSERT INTO backup_metadata (backup_name, file_path, backup_type, project_ids, file_size, compressed_size, checksum)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      
      getBackupMetadata: this.db.prepare(`
        SELECT * FROM backup_metadata ORDER BY created_at DESC
      `),
      
      deleteBackupMetadata: this.db.prepare(`
        DELETE FROM backup_metadata WHERE id = ?
      `),
      
      getProjectData: this.db.prepare(`
        SELECT * FROM projects WHERE id = ?
      `),
      
      getProjectDocuments: this.db.prepare(`
        SELECT * FROM documents WHERE project_id = ?
      `),
      
      getProjectChunks: this.db.prepare(`
        SELECT * FROM text_chunks WHERE project_id = ?
      `),
      
      getProjectEmbeddings: this.db.prepare(`
        SELECT * FROM embeddings WHERE project_id = ?
      `),
      
      getProjectChannels: this.db.prepare(`
        SELECT * FROM channels WHERE project_id = ?
      `),
      
      getProjectChatLogs: this.db.prepare(`
        SELECT * FROM chat_logs WHERE project_id = ?
      `)
    };
  }

  /**
   * Create full database backup
   */
  async createFullBackup(options = {}) {
    const {
      compress = true,
      includeAnalytics = false,
      customName = null
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = customName || `full-backup-${timestamp}`;
    const backupFileName = `${backupName}.db${compress ? '.gz' : ''}`;
    const backupPath = path.join(this.backupDir, backupFileName);

    console.log(`Creating full backup: ${backupName}`);

    try {
      // Create database backup using SQLite's backup API
      const tempBackupPath = `${backupPath}.tmp`;
      
      // Use better-sqlite3's backup method if available
      if (this.db.backup) {
        await this.db.backup(tempBackupPath);
      } else {
        // Fallback: copy database file
        await fs.copyFile(this.dbPath, tempBackupPath);
      }

      let finalBackupPath = tempBackupPath;
      let compressedSize = null;

      // Compress if requested
      if (compress) {
        console.log('Compressing backup...');
        const data = await fs.readFile(tempBackupPath);
        const compressed = await gzip(data);
        await fs.writeFile(backupPath, compressed);
        await fs.unlink(tempBackupPath);
        finalBackupPath = backupPath;
        compressedSize = compressed.length;
      } else {
        await fs.rename(tempBackupPath, backupPath);
      }

      // Get file stats
      const stats = await fs.stat(finalBackupPath);
      const checksum = await this.calculateChecksum(finalBackupPath);

      // Store backup metadata
      const result = this.statements.insertBackupMetadata.run(
        backupName,
        finalBackupPath,
        'full',
        JSON.stringify([]), // No specific projects for full backup
        stats.size,
        compressedSize,
        checksum
      );

      console.log(`Full backup created successfully: ${backupName}`);
      
      return {
        id: result.lastInsertRowid,
        name: backupName,
        path: finalBackupPath,
        size: stats.size,
        compressed: compress,
        checksum: checksum
      };

    } catch (error) {
      console.error('Full backup failed:', error);
      throw error;
    }
  }

  /**
   * Create project-specific backup
   */
  async createProjectBackup(projectIds, options = {}) {
    const {
      compress = true,
      customName = null
    } = options;

    if (!Array.isArray(projectIds)) {
      projectIds = [projectIds];
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectNames = projectIds.join('-');
    const backupName = customName || `project-backup-${projectNames}-${timestamp}`;
    const backupFileName = `${backupName}.json${compress ? '.gz' : ''}`;
    const backupPath = path.join(this.backupDir, backupFileName);

    console.log(`Creating project backup for: ${projectIds.join(', ')}`);

    try {
      const backupData = {
        version: '1.0.0',
        type: 'project',
        created_at: new Date().toISOString(),
        project_ids: projectIds,
        data: {}
      };

      // Export data for each project
      for (const projectId of projectIds) {
        backupData.data[projectId] = await this.exportProjectData(projectId);
      }

      // Serialize and optionally compress
      const jsonData = JSON.stringify(backupData, null, 2);
      let finalData = Buffer.from(jsonData, 'utf8');
      let compressedSize = null;

      if (compress) {
        console.log('Compressing project backup...');
        finalData = await gzip(finalData);
        compressedSize = finalData.length;
      }

      await fs.writeFile(backupPath, finalData);

      // Get file stats and checksum
      const stats = await fs.stat(backupPath);
      const checksum = await this.calculateChecksum(backupPath);

      // Store backup metadata
      const result = this.statements.insertBackupMetadata.run(
        backupName,
        backupPath,
        'project',
        JSON.stringify(projectIds),
        stats.size,
        compressedSize,
        checksum
      );

      console.log(`Project backup created successfully: ${backupName}`);
      
      return {
        id: result.lastInsertRowid,
        name: backupName,
        path: backupPath,
        size: stats.size,
        compressed: compress,
        project_ids: projectIds,
        checksum: checksum
      };

    } catch (error) {
      console.error('Project backup failed:', error);
      throw error;
    }
  }

  /**
   * Create incremental backup (only changed data since last backup)
   */
  async createIncrementalBackup(options = {}) {
    const {
      compress = true,
      customName = null,
      sinceDate = null
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = customName || `incremental-backup-${timestamp}`;
    const backupFileName = `${backupName}.json${compress ? '.gz' : ''}`;
    const backupPath = path.join(this.backupDir, backupFileName);

    console.log(`Creating incremental backup since: ${sinceDate || 'last backup'}`);

    try {
      // Determine the cutoff date
      let cutoffDate = sinceDate;
      if (!cutoffDate) {
        // Get the date of the most recent backup
        const lastBackup = this.db.prepare(`
          SELECT created_at FROM backup_metadata 
          WHERE backup_type IN ('full', 'incremental')
          ORDER BY created_at DESC 
          LIMIT 1
        `).get();
        
        cutoffDate = lastBackup ? lastBackup.created_at : '1970-01-01';
      }

      const backupData = {
        version: '1.0.0',
        type: 'incremental',
        created_at: new Date().toISOString(),
        since_date: cutoffDate,
        data: {
          projects: [],
          documents: [],
          text_chunks: [],
          embeddings: [],
          channels: [],
          chat_logs: []
        }
      };

      // Get changed data since cutoff date
      backupData.data.projects = this.db.prepare(`
        SELECT * FROM projects WHERE updated_at > ?
      `).all(cutoffDate);

      backupData.data.documents = this.db.prepare(`
        SELECT * FROM documents WHERE updated_at > ?
      `).all(cutoffDate);

      backupData.data.text_chunks = this.db.prepare(`
        SELECT * FROM text_chunks WHERE created_at > ?
      `).all(cutoffDate);

      backupData.data.embeddings = this.db.prepare(`
        SELECT * FROM embeddings WHERE created_at > ?
      `).all(cutoffDate);

      backupData.data.channels = this.db.prepare(`
        SELECT * FROM channels WHERE updated_at > ?
      `).all(cutoffDate);

      backupData.data.chat_logs = this.db.prepare(`
        SELECT * FROM chat_logs WHERE created_at > ?
      `).all(cutoffDate);

      // Serialize and optionally compress
      const jsonData = JSON.stringify(backupData, null, 2);
      let finalData = Buffer.from(jsonData, 'utf8');
      let compressedSize = null;

      if (compress) {
        console.log('Compressing incremental backup...');
        finalData = await gzip(finalData);
        compressedSize = finalData.length;
      }

      await fs.writeFile(backupPath, finalData);

      // Get file stats and checksum
      const stats = await fs.stat(backupPath);
      const checksum = await this.calculateChecksum(backupPath);

      // Store backup metadata
      const result = this.statements.insertBackupMetadata.run(
        backupName,
        backupPath,
        'incremental',
        JSON.stringify([]),
        stats.size,
        compressedSize,
        checksum
      );

      console.log(`Incremental backup created successfully: ${backupName}`);
      
      return {
        id: result.lastInsertRowid,
        name: backupName,
        path: backupPath,
        size: stats.size,
        compressed: compress,
        changes_since: cutoffDate,
        checksum: checksum
      };

    } catch (error) {
      console.error('Incremental backup failed:', error);
      throw error;
    }
  }

  /**
   * Export project data for backup
   */
  async exportProjectData(projectId) {
    const projectData = {
      project: this.statements.getProjectData.get(projectId),
      documents: this.statements.getProjectDocuments.all(projectId),
      text_chunks: this.statements.getProjectChunks.all(projectId),
      embeddings: this.statements.getProjectEmbeddings.all(projectId),
      channels: this.statements.getProjectChannels.all(projectId),
      chat_logs: this.statements.getProjectChatLogs.all(projectId)
    };

    return projectData;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath, options = {}) {
    const {
      overwrite = false,
      projectIds = null, // Specific projects to restore
      createNewDatabase = false
    } = options;

    console.log(`Restoring from backup: ${backupPath}`);

    try {
      // Verify backup file exists
      await fs.access(backupPath);
      
      // Verify backup integrity
      const isValid = await this.verifyBackupIntegrity(backupPath);
      if (!isValid) {
        throw new Error('Backup integrity verification failed');
      }

      // Determine backup type by file extension and content
      const isCompressed = backupPath.endsWith('.gz');
      const isFullBackup = backupPath.endsWith('.db') || backupPath.endsWith('.db.gz');

      if (isFullBackup) {
        return await this.restoreFullBackup(backupPath, { overwrite, createNewDatabase });
      } else {
        return await this.restoreDataBackup(backupPath, { overwrite, projectIds });
      }

    } catch (error) {
      console.error('Backup restore failed:', error);
      throw error;
    }
  }

  /**
   * Restore full database backup
   */
  async restoreFullBackup(backupPath, options = {}) {
    const { overwrite = false, createNewDatabase = false } = options;

    const isCompressed = backupPath.endsWith('.gz');
    let sourceData;

    if (isCompressed) {
      console.log('Decompressing backup...');
      const compressedData = await fs.readFile(backupPath);
      sourceData = await gunzip(compressedData);
    } else {
      sourceData = await fs.readFile(backupPath);
    }

    if (createNewDatabase) {
      // Create new database file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newDbPath = `${this.dbPath}.restored-${timestamp}`;
      await fs.writeFile(newDbPath, sourceData);
      console.log(`Database restored to new file: ${newDbPath}`);
      return { restored_to: newDbPath };
    } else {
      // Replace current database
      if (!overwrite) {
        // Create backup of current database first
        const backupCurrent = `${this.dbPath}.backup-${Date.now()}`;
        await fs.copyFile(this.dbPath, backupCurrent);
        console.log(`Current database backed up to: ${backupCurrent}`);
      }

      // Close current database connection
      this.db.close();
      
      // Replace database file
      await fs.writeFile(this.dbPath, sourceData);
      
      console.log('Full database restore completed');
      return { restored_to: this.dbPath };
    }
  }

  /**
   * Restore project/incremental backup
   */
  async restoreDataBackup(backupPath, options = {}) {
    const { overwrite = false, projectIds = null } = options;

    const isCompressed = backupPath.endsWith('.gz');
    let backupData;

    // Read and parse backup data
    if (isCompressed) {
      console.log('Decompressing backup...');
      const compressedData = await fs.readFile(backupPath);
      const decompressed = await gunzip(compressedData);
      backupData = JSON.parse(decompressed.toString('utf8'));
    } else {
      const jsonData = await fs.readFile(backupPath, 'utf8');
      backupData = JSON.parse(jsonData);
    }

    // Validate backup data structure
    if (!backupData.version || !backupData.type || !backupData.data) {
      throw new Error('Invalid backup data structure');
    }

    const transaction = this.db.transaction(() => {
      if (backupData.type === 'project') {
        this.restoreProjectData(backupData.data, { overwrite, projectIds });
      } else if (backupData.type === 'incremental') {
        this.restoreIncrementalData(backupData.data, { overwrite });
      }
    });

    transaction();
    
    console.log('Data restore completed');
    return { type: backupData.type, restored_projects: Object.keys(backupData.data) };
  }

  /**
   * Restore project data
   */
  restoreProjectData(projectsData, options = {}) {
    const { overwrite = false, projectIds = null } = options;

    for (const [projectId, data] of Object.entries(projectsData)) {
      // Skip if specific project IDs are specified and this isn't one of them
      if (projectIds && !projectIds.includes(projectId)) {
        continue;
      }

      console.log(`Restoring project: ${projectId}`);

      // Restore project
      if (data.project) {
        const stmt = overwrite ? 
          this.db.prepare('INSERT OR REPLACE INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        const p = data.project;
        stmt.run(p.id, p.name, p.description, p.slug, p.type, p.settings, p.is_favorite, 
                p.view_count, p.chat_count, p.created_at, p.updated_at, p.last_accessed, 
                p.storage_size, p.vector_count, p.embedding_model);
      }

      // Restore documents
      if (data.documents) {
        const stmt = overwrite ?
          this.db.prepare('INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        for (const doc of data.documents) {
          stmt.run(doc.id, doc.project_id, doc.type, doc.title, doc.url, doc.file_path, 
                  doc.content_hash, doc.metadata, doc.word_count, doc.processed_at, 
                  doc.created_at, doc.updated_at);
        }
      }

      // Restore text chunks
      if (data.text_chunks) {
        const stmt = overwrite ?
          this.db.prepare('INSERT OR REPLACE INTO text_chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO text_chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        for (const chunk of data.text_chunks) {
          stmt.run(chunk.id, chunk.document_id, chunk.project_id, chunk.content, 
                  chunk.chunk_index, chunk.start_position, chunk.end_position, 
                  chunk.word_count, chunk.metadata, chunk.created_at);
        }
      }

      // Restore embeddings
      if (data.embeddings) {
        const stmt = overwrite ?
          this.db.prepare('INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO embeddings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        for (const emb of data.embeddings) {
          stmt.run(emb.id, emb.chunk_id, emb.document_id, emb.project_id, 
                  emb.embedding, emb.model_name, emb.dimensions, emb.norm, emb.created_at);
        }
      }

      // Restore channels
      if (data.channels) {
        const stmt = overwrite ?
          this.db.prepare('INSERT OR REPLACE INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        for (const channel of data.channels) {
          stmt.run(channel.id, channel.project_id, channel.channel_id, channel.channel_name, 
                  channel.channel_url, channel.video_count, channel.total_chunks, 
                  channel.indexed_videos, channel.last_sync_at, channel.created_at, channel.updated_at);
        }
      }

      // Restore chat logs
      if (data.chat_logs) {
        const stmt = overwrite ?
          this.db.prepare('INSERT OR REPLACE INTO chat_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)') :
          this.db.prepare('INSERT OR IGNORE INTO chat_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        for (const chat of data.chat_logs) {
          stmt.run(chat.id, chat.project_id, chat.session_id, chat.question, chat.answer, 
                  chat.sources, chat.response_style, chat.model_used, chat.processing_time, 
                  chat.user_rating, chat.created_at);
        }
      }
    }
  }

  /**
   * Get list of available backups
   */
  getBackupList() {
    return this.statements.getBackupMetadata.all();
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId) {
    // Get backup metadata
    const backup = this.db.prepare('SELECT * FROM backup_metadata WHERE id = ?').get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    try {
      // Delete backup file
      await fs.unlink(backup.file_path);
      
      // Delete metadata record
      this.statements.deleteBackupMetadata.run(backupId);
      
      console.log(`Backup deleted: ${backup.backup_name}`);
      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      throw error;
    }
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups(retentionDays = null) {
    const retention = retentionDays || this.maxBackupRetention;
    const cutoffDate = new Date(Date.now() - (retention * 24 * 60 * 60 * 1000)).toISOString();

    const oldBackups = this.db.prepare(`
      SELECT * FROM backup_metadata 
      WHERE created_at < ? 
      ORDER BY created_at ASC
    `).all(cutoffDate);

    console.log(`Cleaning up ${oldBackups.length} old backups...`);

    let deletedCount = 0;
    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.id);
        deletedCount++;
      } catch (error) {
        console.warn(`Failed to delete old backup ${backup.backup_name}:`, error);
      }
    }

    console.log(`Cleaned up ${deletedCount} old backups`);
    return deletedCount;
  }

  /**
   * Verify backup integrity
   */
  async verifyBackupIntegrity(backupPath) {
    try {
      // Get stored checksum if available
      const backup = this.db.prepare('SELECT checksum FROM backup_metadata WHERE file_path = ?').get(backupPath);
      
      if (backup && backup.checksum) {
        const currentChecksum = await this.calculateChecksum(backupPath);
        return currentChecksum === backup.checksum;
      }

      // If no stored checksum, just verify file exists and is readable
      await fs.access(backupPath);
      return true;
    } catch (error) {
      console.error('Backup integrity check failed:', error);
      return false;
    }
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get backup statistics
   */
  async getBackupStats() {
    const stats = {
      total_backups: 0,
      total_size: 0,
      by_type: {},
      oldest_backup: null,
      newest_backup: null
    };

    const backups = this.getBackupList();
    stats.total_backups = backups.length;

    for (const backup of backups) {
      stats.total_size += backup.file_size || 0;
      
      if (!stats.by_type[backup.backup_type]) {
        stats.by_type[backup.backup_type] = { count: 0, size: 0 };
      }
      stats.by_type[backup.backup_type].count++;
      stats.by_type[backup.backup_type].size += backup.file_size || 0;

      if (!stats.oldest_backup || backup.created_at < stats.oldest_backup) {
        stats.oldest_backup = backup.created_at;
      }
      if (!stats.newest_backup || backup.created_at > stats.newest_backup) {
        stats.newest_backup = backup.created_at;
      }
    }

    return stats;
  }
}

module.exports = BackupService;