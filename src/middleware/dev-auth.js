// Development-friendly authentication middleware
// Allows testing without API key in development mode

const { requireApiKey: originalRequireApiKey } = require('./auth');

const devFriendlyApiKey = (req, res, next) => {
  // Always allow public or basic chat/query endpoints without API key
  if (req.path && (req.path.startsWith('/public') || req.path === '/chat' || req.path === '/query')) {
    return next();
  }

  // In development/test, allow requests without API key when not configured
  if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && !process.env.API_KEY) {
    console.log(`[DEV] API call to ${req.path} - no auth required`);
    return next();
  }

  // Otherwise, enforce API key
  return originalRequireApiKey(req, res, next);
};

module.exports = {
  devFriendlyApiKey
};
