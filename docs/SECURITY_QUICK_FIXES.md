# RAGMaker Security Quick Fixes

## 🚨 Critical Fixes (Implement Immediately)

### 1. Basic API Authentication
```javascript
// Add to src/middleware/auth.js
const authenticateRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  // For development, accept a simple key
  const validKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);
  
  if (validKeys.length === 0) {
    // Development mode - log warning but allow
    console.warn('⚠️  No API keys configured - running in development mode');
    return next();
  }
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Provide valid API key in x-api-key header'
    });
  }
  
  next();
};

module.exports = { authenticateRequest };
```

### 2. Secure CORS Configuration
```javascript
// Update src/api/server.js
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://127.0.0.1:3000'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

### 3. Rate Limiting Protection
```javascript
// npm install express-rate-limit
const rateLimit = require('express-rate-limit');

// Strict limits for expensive operations
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// General API limits
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Try again later.'
  }
});

// Apply to endpoints
app.use('/api/', generalLimiter);
app.use('/api/index-channel', strictLimiter);
app.use('/api/reset', strictLimiter);
app.use('/api/bulk-import', strictLimiter);
```

### 4. Admin Endpoint Protection
```javascript
// Add confirmation token requirement
const requireConfirmation = (req, res, next) => {
  const confirmToken = req.headers['x-confirm-token'] || req.body.confirmToken;
  const expectedToken = Buffer.from(`${req.ip}:${Date.now()}`).toString('base64');
  
  if (!confirmToken) {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Include confirmation token for destructive operations',
      confirmToken: expectedToken // Provide token for immediate use
    });
  }
  
  // In production, implement proper token validation
  next();
};

// Apply to dangerous endpoints
app.use('/api/reset', requireConfirmation);
app.use('/api/projects/:id', ['DELETE'], requireConfirmation);
```

## ⚡ Environment Variables

Add to `.env`:
```env
# Security Configuration
API_KEYS="your-api-key-1,your-api-key-2"
ALLOWED_ORIGINS="http://localhost:3000,https://yourdomain.com"
SECURITY_ENABLED=true
LOG_LEVEL=warn

# Optional: JWT Secret for future authentication
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
```

## 🛡️ Quick Security Headers

```javascript
// npm install helmet
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://*.upstash.io"]
    }
  },
  crossOriginEmbedderPolicy: false // Allow embeddings
}));
```

## 🔒 Input Validation Enhancement

```javascript
// Add to src/utils/validation.js
function validateComplexObject(obj, schema) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid object format');
  }
  
  // Limit object size
  const jsonString = JSON.stringify(obj);
  if (jsonString.length > 50000) {
    throw new Error('Request payload too large');
  }
  
  return obj;
}

function validateMessages(messages) {
  if (!Array.isArray(messages)) return [];
  
  return messages
    .filter(msg => msg && typeof msg === 'object')
    .filter(msg => typeof msg.role === 'string' && typeof msg.content === 'string')
    .slice(0, 50) // Limit conversation length
    .map(msg => ({
      role: msg.role.substring(0, 20),
      content: msg.content.substring(0, 10000)
    }));
}

module.exports = {
  // ... existing exports
  validateComplexObject,
  validateMessages
};
```

## 📝 Secure Error Handling

```javascript
// Add to src/utils/errorHandler.js
const handleError = (error, req, res, next) => {
  // Log full error details for debugging
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Determine error response based on environment
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Default error response
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal server error',
    message: 'Something went wrong'
  };
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorResponse.message = error.message;
  } else if (error.message.includes('not found')) {
    statusCode = 404;
    errorResponse.message = 'Resource not found';
  }
  
  // Add debug info in development only
  if (isDevelopment) {
    errorResponse.debug = {
      message: error.message,
      stack: error.stack
    };
  }
  
  res.status(statusCode).json(errorResponse);
};

module.exports = { handleError };
```

## 🚀 Implementation Order

### Day 1: Critical Security
1. Add rate limiting to all endpoints
2. Configure restrictive CORS
3. Add basic API key authentication
4. Implement security headers

### Day 2: Enhanced Protection  
1. Secure admin endpoints
2. Add input validation enhancements
3. Implement secure error handling
4. Add environment variable validation

### Day 3: Monitoring & Logging
1. Add security event logging
2. Implement basic monitoring
3. Add health check endpoints
4. Document security procedures

## 🧪 Testing Security Fixes

```bash
# Test rate limiting
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"test"}' \
  --repeat 10

# Test CORS
curl -X OPTIONS http://localhost:3000/api/stats \
  -H "Origin: http://malicious-site.com" \
  -v

# Test API key requirement
curl -X GET http://localhost:3000/api/projects \
  -H "x-api-key: invalid-key" \
  -v
```

## 📞 Emergency Response

If you discover an active security incident:

1. **Immediate**: Take the application offline if necessary
2. **Assess**: Determine the scope and impact
3. **Contain**: Stop the attack vector
4. **Document**: Log all details for analysis
5. **Recover**: Implement fixes and restore service
6. **Learn**: Update security measures

## 🔄 Next Steps

After implementing these quick fixes:

1. Conduct penetration testing
2. Implement OAuth 2.0 authentication
3. Add comprehensive audit logging
4. Set up security monitoring alerts
5. Create incident response procedures
6. Schedule regular security reviews

---

**Remember**: These are immediate fixes. Plan for comprehensive security architecture in the next development cycle.