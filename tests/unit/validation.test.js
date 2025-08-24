const validation = require('../../src/utils/validation');

describe('Validation Utils', () => {
  describe('validateChannelInput', () => {
    test('should validate correct channel ID', () => {
      const input = { channelId: 'UC123456789012345678901' };
      const result = validation.validateChannelInput(input);
      expect(result.channelId).toBe('UC123456789012345678901');
    });

    test('should throw error for invalid channel ID format', () => {
      const input = { channelId: 'invalid' };
      expect(() => validation.validateChannelInput(input))
        .toThrow('Invalid channel ID format');
    });

    test('should throw error for missing channel ID', () => {
      const input = {};
      expect(() => validation.validateChannelInput(input))
        .toThrow('Channel ID is required');
    });

    test('should sanitize XSS attempts in channel ID', () => {
      const input = { channelId: '<script>alert("xss")</script>' };
      expect(() => validation.validateChannelInput(input))
        .toThrow('Invalid channel ID format');
    });

    test('should handle SQL injection attempts', () => {
      const input = { channelId: "'; DROP TABLE channels; --" };
      expect(() => validation.validateChannelInput(input))
        .toThrow('Invalid channel ID format');
    });
  });

  describe('validateQueryInput', () => {
    test('should validate correct query input', () => {
      const input = { 
        query: 'What is machine learning?',
        maxResults: 5,
        responseStyle: 'academic'
      };
      const result = validation.validateQueryInput(input);
      expect(result.query).toBe('What is machine learning?');
      expect(result.maxResults).toBe(5);
      expect(result.responseStyle).toBe('academic');
    });

    test('should set default values for optional fields', () => {
      const input = { query: 'Test query' };
      const result = validation.validateQueryInput(input);
      expect(result.maxResults).toBe(10);
      expect(result.responseStyle).toBe('conversational');
    });

    test('should sanitize HTML in query', () => {
      const input = { query: '<script>alert("xss")</script>What is AI?' };
      const result = validation.validateQueryInput(input);
      expect(result.query).toBe('What is AI?');
      expect(result.query).not.toContain('<script>');
    });

    test('should throw error for empty query', () => {
      const input = { query: '' };
      expect(() => validation.validateQueryInput(input))
        .toThrow('Query cannot be empty');
    });

    test('should throw error for query too long', () => {
      const longQuery = 'a'.repeat(1001);
      const input = { query: longQuery };
      expect(() => validation.validateQueryInput(input))
        .toThrow('Query is too long');
    });

    test('should validate response style options', () => {
      const validStyles = ['academic', 'conversational', 'simple', 'custom'];
      
      validStyles.forEach(style => {
        const input = { query: 'test', responseStyle: style };
        const result = validation.validateQueryInput(input);
        expect(result.responseStyle).toBe(style);
      });

      const input = { query: 'test', responseStyle: 'invalid' };
      expect(() => validation.validateQueryInput(input))
        .toThrow('Invalid response style');
    });

    test('should validate maxResults range', () => {
      // Valid range
      const validInput = { query: 'test', maxResults: 5 };
      const result = validation.validateQueryInput(validInput);
      expect(result.maxResults).toBe(5);

      // Too low
      const lowInput = { query: 'test', maxResults: 0 };
      expect(() => validation.validateQueryInput(lowInput))
        .toThrow('maxResults must be between 1 and 20');

      // Too high
      const highInput = { query: 'test', maxResults: 25 };
      expect(() => validation.validateQueryInput(highInput))
        .toThrow('maxResults must be between 1 and 20');
    });
  });

  describe('Security validation', () => {
    test('should detect and block potential XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>'
      ];

      xssAttempts.forEach(xss => {
        const input = { query: xss };
        const result = validation.validateQueryInput(input);
        expect(result.query).not.toContain('<script>');
        expect(result.query).not.toContain('javascript:');
        expect(result.query).not.toContain('onerror');
        expect(result.query).not.toContain('onload');
      });
    });

    test('should handle malformed input gracefully', () => {
      const malformedInputs = [
        null,
        undefined,
        [],
        42,
        'string instead of object'
      ];

      malformedInputs.forEach(input => {
        expect(() => validation.validateQueryInput(input))
          .toThrow();
      });
    });

    test('should preserve safe content while removing dangerous elements', () => {
      const input = { 
        query: 'What is <b>machine learning</b> and how does <script>alert("xss")</script> it work?' 
      };
      const result = validation.validateQueryInput(input);
      expect(result.query).toContain('machine learning');
      expect(result.query).toContain('how does');
      expect(result.query).not.toContain('<script>');
      expect(result.query).not.toContain('alert');
    });
  });

  describe('Performance and edge cases', () => {
    test('should handle Unicode characters correctly', () => {
      const input = { 
        query: 'What is 机器学习 and искусственный интеллект? 🤖' 
      };
      const result = validation.validateQueryInput(input);
      expect(result.query).toContain('机器学习');
      expect(result.query).toContain('искусственный интеллект');
      expect(result.query).toContain('🤖');
    });

    test('should handle special characters and symbols', () => {
      const input = { 
        query: 'How does A.I. work with C++ & Python? (2024 update)' 
      };
      const result = validation.validateQueryInput(input);
      expect(result.query).toContain('A.I.');
      expect(result.query).toContain('C++');
      expect(result.query).toContain('&');
      expect(result.query).toContain('(2024 update)');
    });

    test('should handle boundary cases for string lengths', () => {
      // Exactly at limit
      const exactLengthQuery = 'a'.repeat(1000);
      const input = { query: exactLengthQuery };
      const result = validation.validateQueryInput(input);
      expect(result.query.length).toBe(1000);

      // Just over limit
      const overLimitQuery = 'a'.repeat(1001);
      const overInput = { query: overLimitQuery };
      expect(() => validation.validateQueryInput(overInput))
        .toThrow('Query is too long');
    });

    test('should handle rapid successive validations', () => {
      const inputs = Array.from({ length: 100 }, (_, i) => ({
        query: `Test query ${i}`,
        maxResults: (i % 10) + 1
      }));

      inputs.forEach(input => {
        const result = validation.validateQueryInput(input);
        expect(result.query).toContain('Test query');
        expect(result.maxResults).toBeGreaterThan(0);
        expect(result.maxResults).toBeLessThanOrEqual(10);
      });
    });
  });
});