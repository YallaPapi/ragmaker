// Development-friendly authentication middleware
// Allows testing without API key in development mode

const { requireApiKey: originalRequireApiKey } = require('./auth');

const devFriendlyApiKey = (req, res, next) => {
  // In development mode, allow requests without API key
  if (process.env.NODE_ENV === 'development' && !process.env.API_KEY) {
    console.log(`[DEV] API call to ${req.path} - no auth required`);
    return next();
  }
  
  // In production or when API_KEY is set, use normal auth
  return originalRequireApiKey(req, res, next);
};

module.exports = {
  devFriendlyApiKey
};