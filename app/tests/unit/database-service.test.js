const { DatabaseService } = require('../../../src/services/database');
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('better-sqlite3');

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn()
  }
}));

describe('Database Service Unit Tests', () => {
  let databaseService;
  let mockDb;
  let testDbPath;

  beforeEach(() => {
    testDbPath = path.join(__dirname, 'test-db.sqlite');
    
    // Mock sqlite3 database
    mockDb = {
      prepare: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
      transaction: jest.fn(),
      pragma: jest.fn()
    };
    
    // Mock prepared statements
    const mockStatement = {
      run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
      finalize: jest.fn()
    };
    
    mockDb.prepare.mockReturnValue(mockStatement);
    mockDb.transaction.mockImplementation((fn) => {
      return (...args) => fn.apply(null, args);
    });
    
    jest.clearAllMocks();
    
    databaseService = new DatabaseService({ 
      dbPath: testDbPath,
      db: mockDb 
    });
  });

  afterEach(async () => {
    if (databaseService) {
      await databaseService.close();
    }
    jest.clearAllMocks();
  });

  describe('Database Initialization', () => {
    it('should initialize database with required tables', async () => {
      fs.access.mockRejectedValue(new Error('File does not exist'));
      
      await databaseService.initialize();
      
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('documents'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('channels'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('videos'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('transcripts'));
    });

    it('should create database directory if it does not exist', async () => {
      fs.access.mockRejectedValue(new Error('Directory does not exist'));
      fs.mkdir.mockResolvedValue();
      
      await databaseService.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.dirname(testDbPath), 
        { recursive: true }
      );
    });

    it('should handle database file corruption', async () => {
      const corruptDb = {
        exec: jest.fn().mockImplementation(() => {
          throw new Error('SQLITE_CORRUPT: database disk image is malformed');
        }),
        close: jest.fn()
      };
      
      databaseService = new DatabaseService({ 
        dbPath: testDbPath,
        db: corruptDb 
      });
      
      await expect(databaseService.initialize()).rejects.toThrow('Database corruption detected');
    });

    it('should set appropriate database pragmas for performance', async () => {
      await databaseService.initialize();
      
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('cache_size = 10000');
      expect(mockDb.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });
  });

  describe('Document Operations', () => {
    it('should save document successfully', async () => {
      const document = {
        id: 'doc-123',
        title: 'Test Document',
        content: 'This is test content',
        metadata: JSON.stringify({ author: 'Test Author' }),
        createdAt: new Date().toISOString()
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
      
      const result = await databaseService.saveDocument(document);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO documents')
      );
      expect(mockStatement.run).toHaveBeenCalledWith(document);
      expect(result).toEqual(document);
    });

    it('should retrieve document by ID', async () => {
      const documentId = 'doc-123';
      const mockDocument = {
        id: documentId,
        title: 'Retrieved Document',
        content: 'Retrieved content'
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.get.mockReturnValue(mockDocument);
      
      const result = await databaseService.getDocument(documentId);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM documents WHERE id = ?')
      );
      expect(mockStatement.get).toHaveBeenCalledWith(documentId);
      expect(result).toEqual(mockDocument);
    });

    it('should handle document not found gracefully', async () => {
      const documentId = 'non-existent';
      const mockStatement = mockDb.prepare();
      mockStatement.get.mockReturnValue(undefined);
      
      const result = await databaseService.getDocument(documentId);
      
      expect(result).toBeNull();
    });

    it('should delete document successfully', async () => {
      const documentId = 'doc-to-delete';
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      const result = await databaseService.deleteDocument(documentId);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM documents WHERE id = ?')
      );
      expect(mockStatement.run).toHaveBeenCalledWith(documentId);
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent document', async () => {
      const documentId = 'non-existent';
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 0 });
      
      const result = await databaseService.deleteDocument(documentId);
      
      expect(result).toBe(false);
    });
  });

  describe('Channel Operations', () => {
    it('should save channel with all metadata', async () => {
      const channel = {
        id: 'UCChannelId123',
        title: 'Test Channel',
        description: 'Test channel description',
        subscriberCount: 1000000,
        videoCount: 500,
        customUrl: '@testchannel',
        thumbnails: JSON.stringify({ default: 'url1', medium: 'url2' }),
        country: 'US',
        publishedAt: '2020-01-01T00:00:00Z',
        lastUpdated: new Date().toISOString()
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      const result = await databaseService.saveChannel(channel);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO channels')
      );
      expect(mockStatement.run).toHaveBeenCalledWith(channel);
      expect(result).toEqual(channel);
    });

    it('should retrieve channel with video count', async () => {
      const channelId = 'UCChannelId123';
      const mockChannel = {
        id: channelId,
        title: 'Test Channel',
        videoCount: 100,
        processedVideoCount: 75
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.get.mockReturnValue(mockChannel);
      
      const result = await databaseService.getChannelWithStats(channelId);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN')
      );
      expect(result).toEqual(mockChannel);
    });

    it('should list all channels with pagination', async () => {
      const mockChannels = [
        { id: 'UC1', title: 'Channel 1', subscriberCount: 1000 },
        { id: 'UC2', title: 'Channel 2', subscriberCount: 2000 }
      ];
      
      const mockStatement = mockDb.prepare();
      mockStatement.all.mockReturnValue(mockChannels);
      
      const result = await databaseService.getAllChannels({ limit: 10, offset: 0 });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?')
      );
      expect(mockStatement.all).toHaveBeenCalledWith(10, 0);
      expect(result).toEqual(mockChannels);
    });
  });

  describe('Video Operations', () => {
    it('should save video with transcript status', async () => {
      const video = {
        id: 'videoId123',
        channelId: 'UCChannelId',
        title: 'Test Video',
        description: 'Video description',
        duration: 'PT10M30S',
        publishedAt: '2024-01-01T12:00:00Z',
        viewCount: 10000,
        likeCount: 500,
        commentCount: 50,
        hasTranscript: true,
        transcriptProcessed: false,
        thumbnails: JSON.stringify({ default: 'thumb1.jpg' })
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      const result = await databaseService.saveVideo(video);
      
      expect(mockStatement.run).toHaveBeenCalledWith(video);
      expect(result).toEqual(video);
    });

    it('should get videos by channel with filters', async () => {
      const channelId = 'UCChannelId';
      const filters = {
        hasTranscript: true,
        minDuration: 300, // 5 minutes
        publishedAfter: '2024-01-01'
      };
      
      const mockVideos = [
        { id: 'vid1', title: 'Video 1', hasTranscript: true },
        { id: 'vid2', title: 'Video 2', hasTranscript: true }
      ];
      
      const mockStatement = mockDb.prepare();
      mockStatement.all.mockReturnValue(mockVideos);
      
      const result = await databaseService.getVideosByChannel(channelId, filters);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE channelId = ?')
      );
      expect(result).toEqual(mockVideos);
    });

    it('should update video processing status', async () => {
      const videoId = 'videoId123';
      const status = {
        transcriptProcessed: true,
        embeddingsGenerated: true,
        processedAt: new Date().toISOString(),
        errorMessage: null
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      const result = await databaseService.updateVideoStatus(videoId, status);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE videos SET')
      );
      expect(result).toBe(true);
    });
  });

  describe('Transcript Operations', () => {
    it('should save transcript chunks with embeddings', async () => {
      const transcriptData = {
        videoId: 'videoId123',
        chunks: [
          { 
            text: 'First chunk of transcript', 
            startTime: 0, 
            endTime: 10,
            embedding: [0.1, 0.2, 0.3]
          },
          { 
            text: 'Second chunk of transcript', 
            startTime: 10, 
            endTime: 20,
            embedding: [0.4, 0.5, 0.6]
          }
        ],
        processedAt: new Date().toISOString()
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      const insertTransaction = mockDb.transaction();
      
      const result = await databaseService.saveTranscriptChunks(transcriptData);
      
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalledTimes(2); // Once for each chunk
      expect(result).toBe(true);
    });

    it('should retrieve transcript chunks by video ID', async () => {
      const videoId = 'videoId123';
      const mockChunks = [
        { id: 1, videoId, text: 'Chunk 1', startTime: 0, endTime: 10 },
        { id: 2, videoId, text: 'Chunk 2', startTime: 10, endTime: 20 }
      ];
      
      const mockStatement = mockDb.prepare();
      mockStatement.all.mockReturnValue(mockChunks);
      
      const result = await databaseService.getTranscriptChunks(videoId);
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM transcript_chunks WHERE videoId = ?')
      );
      expect(result).toEqual(mockChunks);
    });

    it('should search transcript chunks by text content', async () => {
      const searchQuery = 'machine learning';
      const mockResults = [
        { 
          videoId: 'vid1', 
          text: 'This is about machine learning algorithms',
          startTime: 120,
          relevanceScore: 0.95
        }
      ];
      
      const mockStatement = mockDb.prepare();
      mockStatement.all.mockReturnValue(mockResults);
      
      const result = await databaseService.searchTranscripts(searchQuery, { limit: 10 });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE text MATCH ?')
      );
      expect(result).toEqual(mockResults);
    });
  });

  describe('Data Integrity & Transactions', () => {
    it('should handle transaction rollback on error', async () => {
      const documents = [
        { id: 'doc1', title: 'Document 1', content: 'Content 1' },
        { id: 'doc2', title: 'Document 2', content: 'Content 2' }
      ];
      
      const mockStatement = mockDb.prepare();
      mockStatement.run
        .mockReturnValueOnce({ changes: 1 })
        .mockImplementationOnce(() => {
          throw new Error('Constraint violation');
        });
      
      const mockTransaction = jest.fn().mockImplementation((fn) => {
        return (...args) => {
          try {
            return fn.apply(null, args);
          } catch (error) {
            throw error;
          }
        };
      });
      
      mockDb.transaction.mockReturnValue(mockTransaction);
      
      await expect(databaseService.bulkSaveDocuments(documents))
        .rejects.toThrow('Constraint violation');
      
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
    });

    it('should enforce foreign key constraints', async () => {
      const video = {
        id: 'videoId123',
        channelId: 'non-existent-channel', // Should fail FK constraint
        title: 'Test Video'
      };
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockImplementation(() => {
        throw new Error('FOREIGN KEY constraint failed');
      });
      
      await expect(databaseService.saveVideo(video))
        .rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should validate data before insertion', async () => {
      const invalidDocument = {
        // Missing required fields
        title: 'Invalid Document'
        // id and content are missing
      };
      
      await expect(databaseService.saveDocument(invalidDocument))
        .rejects.toThrow('Missing required fields: id, content');
    });
  });

  describe('Performance & Optimization', () => {
    it('should use prepared statements for bulk operations', async () => {
      const documents = Array.from({ length: 1000 }, (_, i) => ({
        id: `doc-${i}`,
        title: `Document ${i}`,
        content: `Content for document ${i}`
      }));
      
      const mockStatement = mockDb.prepare();
      mockStatement.run.mockReturnValue({ changes: 1 });
      
      await databaseService.bulkSaveDocuments(documents);
      
      expect(mockDb.prepare).toHaveBeenCalledTimes(1); // Only one prepare call
      expect(mockStatement.run).toHaveBeenCalledTimes(1000); // Multiple executions
    });

    it('should handle large result sets with streaming', async () => {
      const mockStatement = mockDb.prepare();
      const largeResultSet = Array.from({ length: 10000 }, (_, i) => ({
        id: `result-${i}`,
        data: `Large data chunk ${i}`.repeat(100)
      }));
      
      mockStatement.all.mockReturnValue(largeResultSet);
      
      const results = [];
      await databaseService.streamResults(
        'SELECT * FROM large_table',
        [],
        (row) => results.push(row),
        { batchSize: 100 }
      );
      
      expect(results).toHaveLength(10000);
    });

    it('should optimize queries with proper indexing', async () => {
      await databaseService.createIndexes();
      
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_documents_title')
      );
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_videos_channel_published')
      );
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_transcripts_video_time')
      );
    });
  });

  describe('Backup & Recovery', () => {
    it('should create database backup successfully', async () => {
      const backupPath = path.join(__dirname, 'backup-test.sqlite');
      
      fs.stat.mockResolvedValue({ size: 1024 * 1024 }); // 1MB
      
      mockDb.backup = jest.fn().mockImplementation((destPath) => {
        return {
          step: jest.fn().mockReturnValue(0), // SQLITE_DONE
          remaining: jest.fn().mockReturnValue(0),
          pagecount: jest.fn().mockReturnValue(100),
          finish: jest.fn()
        };
      });
      
      const result = await databaseService.createBackup(backupPath);
      
      expect(result).toEqual({
        success: true,
        backupPath,
        size: expect.any(Number),
        timestamp: expect.any(String)
      });
    });

    it('should restore database from backup', async () => {
      const backupPath = path.join(__dirname, 'restore-test.sqlite');
      
      fs.access.mockResolvedValue(); // Backup file exists
      
      const result = await databaseService.restoreFromBackup(backupPath);
      
      expect(result.success).toBe(true);
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should handle backup failure gracefully', async () => {
      const backupPath = '/invalid/path/backup.sqlite';
      
      mockDb.backup = jest.fn().mockImplementation(() => {
        throw new Error('Cannot create backup: permission denied');
      });
      
      const result = await databaseService.createBackup(backupPath);
      
      expect(result).toEqual({
        success: false,
        error: 'Cannot create backup: permission denied'
      });
    });
  });

  describe('Connection Management', () => {
    it('should handle connection pooling', async () => {
      const pooledDb = new DatabaseService({ 
        dbPath: testDbPath,
        maxConnections: 5
      });
      
      // Simulate concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) => 
        pooledDb.getDocument(`doc-${i}`)
      );
      
      await Promise.all(operations);
      
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should gracefully handle connection loss', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('SQLITE_IOERR: disk I/O error');
      });
      
      const result = await databaseService.getDocument('test-doc');
      
      expect(result).toBeNull();
      // Should attempt reconnection
      expect(databaseService.isConnected()).toBe(false);
    });

    it('should properly close database connections', async () => {
      await databaseService.close();
      
      expect(mockDb.close).toHaveBeenCalled();
      expect(databaseService.isConnected()).toBe(false);
    });
  });
});
