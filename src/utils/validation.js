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
    throw new Error('Invalid channel ID format');
  }
  
  // Validate format - either UC ID or handle
  if (sanitized.startsWith('UC') && sanitized.length === 24) {
    // Valid UC channel ID format
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(sanitized)) {
      throw new Error('Invalid YouTube channel ID format');
    }
  } else if (sanitized.startsWith('@')) {
    // Valid handle format
    if (!/^@[a-zA-Z0-9_.-]{1,30}$/.test(sanitized)) {
      throw new Error('Invalid YouTube handle format');
    }
  } else {
    // Could be handle without @, username, or custom URL
    if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(sanitized)) {
      throw new Error('Invalid channel identifier format');
    }
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
  
  const sanitized = name.trim().replace(/[<>'";&|`$(){}[\]]/g, '');
  
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
  validateProfileId
};