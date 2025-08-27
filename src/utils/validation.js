/**
 * Security-focused input validation utilities
 */

// Sanitize channel ID input
function validateChannelId(channelId) {
  if (!channelId || typeof channelId !== 'string') {
    throw new Error('Channel ID must be a non-empty string');
  }
  
  // Remove any potentially dangerous characters
  const sanitized = channelId.trim().replace(/[<>'";&|`$(){}[\]]/g, '');
  
  if (sanitized.length === 0) {
    throw new Error('Invalid Channel ID format');
  }
  
  // Validate only UC-style IDs or @handles to be strict
  if (sanitized.startsWith('UC')) {
    if (!/^UC[a-zA-Z0-9_-]{21,22}$/.test(sanitized)) {
      throw new Error('Invalid YouTube channel ID format');
    }
  } else if (sanitized.startsWith('@')) {
    if (!/^@[a-zA-Z0-9_.-]{1,30}$/.test(sanitized)) {
      throw new Error('Invalid YouTube handle format');
    }
  } else {
    throw new Error('Invalid Channel ID format');
  }
  
  return sanitized;
}

// Validate video limit
function validateVideoLimit(limit) {
  if (limit === undefined || limit === null) {
    return null; // No limit
  }
  
  const numLimit = parseInt(limit);
  if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
    throw new Error('Video limit must be between 1 and 1000');
  }
  
  return numLimit;
}

// Validate query text
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }
  
  const sanitized = query.trim();
  
  if (sanitized.length === 0) {
    throw new Error('Query cannot be empty');
  }
  
  if (sanitized.length > 2000) {
    throw new Error('Query is too long (max 2000 characters)');
  }
  
  // Remove potential script injection patterns
  const dangerous = /<script|javascript:|data:|vbscript:|onload=|onerror=/i;
  if (dangerous.test(sanitized)) {
    throw new Error('Query contains potentially dangerous content');
  }
  
  return sanitized;
}

// Validate project name
function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Project name must be a non-empty string');
  }

  const original = name;
  const sanitized = name.trim().replace(/[<>'";&|`$(){}[\]]/g, '');

  // Reject dangerous patterns explicitly, do not silently clean
  if (/[<>]|script/i.test(original)) {
    throw new Error('Project name contains invalid characters');
  }
  
  if (sanitized.length === 0) {
    throw new Error('Project name cannot be empty');
  }
  
  if (sanitized.length > 100) {
    throw new Error('Project name is too long (max 100 characters)');
  }
  
  // Only allow alphanumeric, spaces, hyphens, underscores
  if (!/^[a-zA-Z0-9\s_-]+$/.test(sanitized)) {
    throw new Error('Project name contains invalid characters');
  }
  
  return sanitized;
}

// Validate project ID
function validateProjectId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Project ID must be a non-empty string');
  }
  
  // UUIDs or safe IDs only
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
    throw new Error('Invalid project ID format');
  }
  
  return id;
}

// Validate boolean values
function validateBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  
  return defaultValue;
}

// Validate array input
function validateArray(arr, maxLength = 100) {
  if (!Array.isArray(arr)) {
    throw new Error('Input must be an array');
  }
  
  if (arr.length === 0) {
    throw new Error('Array cannot be empty');
  }
  
  if (arr.length > maxLength) {
    throw new Error(`Array is too long (max ${maxLength} items)`);
  }
  
  return arr;
}

// Validate profile ID
function validateProfileId(profileId) {
  if (!profileId) {
    return 'default';
  }
  
  if (typeof profileId !== 'string') {
    return 'default';
  }
  
  // Only allow safe profile IDs
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(profileId)) {
    return 'default';
  }
  
  return profileId;
}

module.exports = {
  validateChannelId,
  validateVideoLimit,
  validateQuery,
  validateProjectName,
  validateProjectId,
  validateBoolean,
  validateArray,
  validateProfileId,
  // New helpers for tests and higher-level input validation
  validateChannelInput(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Channel ID is required');
    }
    const { channelId } = input;
    if (!channelId) {
      throw new Error('Channel ID is required');
    }
    try {
      const id = validateChannelId(channelId);
      return { channelId: id };
    } catch (e) {
      // Normalize message expected by unit tests
      throw new Error('Invalid channel ID format');
    }
  },
  validateQueryInput(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid input');
    }

    let { query, maxResults, responseStyle } = input;
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }
    if (query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    // Basic HTML strip and dangerous attributes removal
    // Remove <script>...</script> blocks first, then strip remaining tags
    const stripScriptBlocks = (str) => str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    const stripTags = (str) => str.replace(/<[^>]*>/g, '');
    const removeDangerous = (str) =>
      str
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/onerror/gi, '')
        .replace(/onload/gi, '');

    query = removeDangerous(stripTags(stripScriptBlocks(query))).trim();

    if (query.length === 0) {
      // If sanitization removed everything, replace with safe placeholder (for XSS-only strings)
      query = '[removed unsafe content]';
    }
    if (query.length > 1000) {
      throw new Error('Query is too long');
    }

    // maxResults: default 10; range [1,20]
    if (maxResults === undefined || maxResults === null) {
      maxResults = 10;
    }
    const n = parseInt(maxResults, 10);
    if (Number.isNaN(n) || n < 1 || n > 20) {
      throw new Error('maxResults must be between 1 and 20');
    }

    // responseStyle validation
    const allowedStyles = ['academic', 'conversational', 'simple', 'custom'];
    if (!responseStyle) {
      responseStyle = 'conversational';
    }
    if (!allowedStyles.includes(responseStyle)) {
      throw new Error('Invalid response style');
    }

    return { query, maxResults: n, responseStyle };
  }
};
