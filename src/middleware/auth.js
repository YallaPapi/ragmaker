const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const API_KEY = process.env.API_KEY;

// API Key middleware for public endpoints
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!API_KEY) {
    // If no API_KEY is set in environment, skip auth (development mode)
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    return res.status(500).json({ error: 'API key not configured' });
  }
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ 
      error: 'Invalid or missing API key',
      hint: 'Add x-api-key header or api_key query parameter'
    });
  }
  
  next();
};

// JWT middleware for authenticated endpoints
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Authentication required',
      hint: 'Add Authorization: Bearer <token> header'
    });
  }
  
  try {
    const decoded = jwt.sign({ userId: 'default' }, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin confirmation for destructive operations
const requireAdminConfirmation = (req, res, next) => {
  const confirmation = req.headers['x-admin-confirm'] || req.body.adminConfirm;
  
  if (confirmation !== 'CONFIRM_DESTRUCTIVE_ACTION') {
    return res.status(403).json({
      error: 'Admin confirmation required',
      hint: 'Add x-admin-confirm: CONFIRM_DESTRUCTIVE_ACTION header'
    });
  }
  
  next();
};

// Generate API token (for setup/admin use)
const generateToken = (userId = 'default') => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

// Hash password utility
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

// Verify password utility
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

module.exports = {
  requireApiKey,
  requireAuth,
  requireAdminConfirmation,
  generateToken,
  hashPassword,
  verifyPassword,
};