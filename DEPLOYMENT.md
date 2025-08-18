# YouTube RAG Deployment Guide

## 🌐 Deploying to Your Own Domain

This guide will help you deploy your YouTube RAG system to a custom domain where each project gets its own shareable URL.

## Architecture Overview

```
yourdomain.com/                     # Landing page (all public RAGs)
yourdomain.com/rag/[project-id]     # Individual RAG chat interface  
yourdomain.com/api/public/...       # Public API endpoints
```

## Deployment Options

### Option 1: Deploy to Vercel (Recommended)

1. **Prepare your project**
```bash
# Install Vercel CLI
npm i -g vercel

# Add vercel.json to project root
```

2. **Create vercel.json**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/api/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "src/api/server.js"
    },
    {
      "src": "/rag/(.*)",
      "dest": "/share.html"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    }
  ],
  "env": {
    "OPENAI_API_KEY": "@openai_api_key",
    "YOUTUBE_API_KEY": "@youtube_api_key",
    "UPSTASH_VECTOR_REST_URL": "@upstash_url",
    "UPSTASH_VECTOR_REST_TOKEN": "@upstash_token"
  }
}
```

3. **Deploy**
```bash
vercel --prod
```

4. **Add custom domain**
```bash
vercel domains add yourdomain.com
```

### Option 2: Deploy to Railway

1. **Install Railway CLI**
```bash
npm i -g @railway/cli
```

2. **Initialize and deploy**
```bash
railway login
railway init
railway up
```

3. **Set environment variables**
```bash
railway variables set OPENAI_API_KEY=your_key
railway variables set YOUTUBE_API_KEY=your_key
railway variables set UPSTASH_VECTOR_REST_URL=your_url
railway variables set UPSTASH_VECTOR_REST_TOKEN=your_token
```

4. **Add custom domain in Railway dashboard**

### Option 3: Deploy to DigitalOcean App Platform

1. **Create app.yaml**
```yaml
name: youtube-rag
region: nyc
services:
- name: api
  github:
    repo: yourusername/ragmaker
    branch: master
  build_command: npm install
  run_command: npm start
  environment_slug: node-js
  http_port: 3012
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /
  envs:
  - key: OPENAI_API_KEY
    scope: RUN_TIME
    value: ${OPENAI_API_KEY}
  - key: YOUTUBE_API_KEY
    scope: RUN_TIME
    value: ${YOUTUBE_API_KEY}
  - key: UPSTASH_VECTOR_REST_URL
    scope: RUN_TIME
    value: ${UPSTASH_VECTOR_REST_URL}
  - key: UPSTASH_VECTOR_REST_TOKEN
    scope: RUN_TIME
    value: ${UPSTASH_VECTOR_REST_TOKEN}
```

2. **Deploy using DO CLI**
```bash
doctl apps create --spec app.yaml
```

### Option 4: Self-Hosted with Docker

1. **Create Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3012

CMD ["npm", "start"]
```

2. **Create docker-compose.yml**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3012:3012"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - YOUTUBE_API_KEY=${YOUTUBE_API_KEY}
      - UPSTASH_VECTOR_REST_URL=${UPSTASH_VECTOR_REST_URL}
      - UPSTASH_VECTOR_REST_TOKEN=${UPSTASH_VECTOR_REST_TOKEN}
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped
```

3. **Create nginx.conf**
```nginx
events {
  worker_connections 1024;
}

http {
  upstream app {
    server app:3012;
  }

  server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
      proxy_pass http://app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
```

4. **Deploy**
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

## Setting Up SSL/HTTPS

### Using Let's Encrypt (Free SSL)

1. **Install Certbot**
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

2. **Get certificate**
```bash
sudo certbot --nginx -d yourdomain.com
```

3. **Auto-renewal**
```bash
sudo certbot renew --dry-run
```

## Environment Variables

Create a `.env` file with:

```env
# Required
OPENAI_API_KEY=sk-...
YOUTUBE_API_KEY=AIza...
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...

# Optional
PORT=3012
NODE_ENV=production

# For multiple Upstash projects (optional)
UPSTASH_EMAIL=your-email@example.com
UPSTASH_MANAGEMENT_KEY=...
```

## Post-Deployment Setup

### 1. Configure Public Projects

Access your admin panel at `yourdomain.com` and:
1. Create a new project
2. Index YouTube channels
3. Toggle "Make Public" in project settings
4. Share the URL: `yourdomain.com/rag/[project-id]`

### 2. Custom Slugs

Instead of project IDs, use friendly URLs:
```javascript
// In project settings
{
  "slug": "tech-tutorials",
  "isPublic": true
}
// Access at: yourdomain.com/rag/tech-tutorials
```

### 3. Analytics (Optional)

Add Google Analytics or Plausible:
```html
<!-- In public/share.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

### 4. Rate Limiting for Public Access

Configure rate limits in `src/api/routes/public.js`:
```javascript
const rateLimit = require('express-rate-limit');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: 'Too many requests, please try again later.'
});

router.use('/api/public', publicLimiter);
```

## Monitoring & Maintenance

### Health Check Endpoint

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});
```

### Monitoring Services

1. **UptimeRobot** - Free uptime monitoring
2. **Sentry** - Error tracking
3. **LogDNA** - Log management

### Backup Strategy

```bash
# Backup data directory
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Restore
tar -xzf backup-20250818.tar.gz
```

## Scaling Considerations

### For High Traffic

1. **Use CDN for static assets**
```javascript
// CloudFlare, Fastly, or AWS CloudFront
app.use(express.static('public', {
  maxAge: '1d',
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));
```

2. **Database connection pooling**
```javascript
// If using PostgreSQL for metadata
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

3. **Horizontal scaling with PM2**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'youtube-rag',
    script: 'src/api/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3012
    }
  }]
};
```

## Troubleshooting

### Common Issues

1. **"Cannot connect to Upstash"**
   - Check UPSTASH_VECTOR_REST_URL and TOKEN
   - Verify network connectivity
   - Check Upstash dashboard for quota

2. **"YouTube API quota exceeded"**
   - Check quota at console.cloud.google.com
   - Implement caching for frequently accessed videos
   - Use rate limiter with higher limits

3. **"Out of memory"**
   - Increase Node.js heap size: `node --max-old-space-size=4096`
   - Implement streaming for large responses
   - Use pagination for video lists

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm start

# Or in production
NODE_ENV=production DEBUG=app:* npm start
```

## Security Best Practices

1. **API Keys**
   - Never commit `.env` files
   - Rotate keys regularly
   - Use different keys for dev/prod

2. **CORS Configuration**
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
```

3. **Input Validation**
```javascript
const validator = require('express-validator');
// Add validation to all user inputs
```

4. **Rate Limiting**
   - Implement per-IP limits
   - Add API key authentication for heavy users
   - Monitor for abuse patterns

## Support

For issues or questions:
- GitHub Issues: [your-repo/issues]
- Documentation: [your-docs-site]
- Email: support@yourdomain.com

---

*Last updated: August 18, 2025*