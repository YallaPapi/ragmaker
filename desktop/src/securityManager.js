const { session } = require('electron');

class SecurityManager {
  constructor() {
    this.isDev = process.env.NODE_ENV === 'development';
  }

  applySecurityPolicies(window) {
    this.setupContentSecurityPolicy();
    this.setupPermissionHandlers(window);
    this.setupNavigationHandlers(window);
    this.setupProtocolHandlers();
  }

  setupContentSecurityPolicy() {
    const defaultSession = session.defaultSession;

    // Set Content Security Policy
    const cspPolicy = this.isDev 
      ? this.getDevelopmentCSP()
      : this.getProductionCSP();

    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [cspPolicy]
        }
      });
    });

    // Set additional security headers
    defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        }
      });
    });
  }

  getDevelopmentCSP() {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*",
      "media-src 'self'",
      "frame-src 'none'"
    ].join('; ');
  }

  getProductionCSP() {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "media-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ');
  }

  setupPermissionHandlers(window) {
    const webContents = window.webContents;

    // Handle permission requests
    webContents.session.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        console.log(`Permission requested: ${permission} from ${details.requestingUrl}`);
        
        const allowedPermissions = [
          'notifications',
          'clipboard-read',
          'clipboard-write'
        ];

        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          console.warn(`Denied permission: ${permission}`);
          callback(false);
        }
      }
    );

    // Handle permission checks
    webContents.session.setPermissionCheckHandler(
      (webContents, permission, requestingOrigin, details) => {
        console.log(`Permission check: ${permission} from ${requestingOrigin}`);
        
        // Allow permissions for our app
        if (requestingOrigin === 'file://' || requestingOrigin.startsWith('http://localhost:')) {
          return true;
        }
        
        return false;
      }
    );

    // Handle device permission requests (camera, microphone, etc.)
    webContents.session.setDevicePermissionHandler((details) => {
      console.log(`Device permission requested: ${details.deviceType}`);
      
      // Deny all device permissions by default
      return false;
    });
  }

  setupNavigationHandlers(window) {
    const webContents = window.webContents;

    // Prevent navigation to external URLs
    webContents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      
      // Allow navigation within the app
      if (this.isAllowedNavigation(parsedUrl)) {
        return;
      }
      
      console.warn(`Blocked navigation to: ${navigationUrl}`);
      event.preventDefault();
    });

    // Handle new window attempts
    webContents.setWindowOpenHandler(({ url }) => {
      console.log(`Window open blocked: ${url}`);
      // You could open in external browser here if needed
      // shell.openExternal(url);
      return { action: 'deny' };
    });

    // Handle download attempts
    webContents.session.on('will-download', (event, item, webContents) => {
      console.log(`Download attempt: ${item.getFilename()}`);
      
      // You can validate the download here
      if (!this.isAllowedDownload(item)) {
        event.preventDefault();
        console.warn(`Blocked download: ${item.getFilename()}`);
      }
    });
  }

  setupProtocolHandlers() {
    const defaultSession = session.defaultSession;

    // Block certain protocols
    const blockedProtocols = [
      'file://',
      'chrome-extension://',
      'chrome://',
      'about://'
    ];

    defaultSession.protocol.interceptStreamProtocol('file', (request, callback) => {
      // Only allow file:// access in development or for specific files
      if (this.isDev || this.isAllowedFileAccess(request.url)) {
        callback({ stream: null });
      } else {
        console.warn(`Blocked file access: ${request.url}`);
        callback({ error: -3 }); // net::ERR_ABORTED
      }
    });
  }

  isAllowedNavigation(parsedUrl) {
    const allowedOrigins = [
      'file://',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];

    if (this.isDev) {
      allowedOrigins.push(
        'http://localhost:3001',
        'http://localhost:8080',
        'ws://localhost:3000',
        'ws://localhost:3001'
      );
    }

    return allowedOrigins.some(origin => 
      parsedUrl.origin === origin || parsedUrl.href.startsWith(origin)
    );
  }

  isAllowedFileAccess(url) {
    // Allow access to app resources
    const allowedPaths = [
      'build/',
      'assets/',
      'public/'
    ];

    return allowedPaths.some(path => url.includes(path));
  }

  isAllowedDownload(item) {
    const allowedExtensions = [
      '.pdf', '.txt', '.json', '.csv', 
      '.png', '.jpg', '.jpeg', '.gif',
      '.zip', '.tar', '.gz'
    ];

    const filename = item.getFilename().toLowerCase();
    const hasAllowedExtension = allowedExtensions.some(ext => 
      filename.endsWith(ext)
    );

    // Additional checks
    const isSafeSize = item.getTotalBytes() < 100 * 1024 * 1024; // 100MB limit
    
    return hasAllowedExtension && isSafeSize;
  }

  // Method to add custom security rules
  addSecurityRule(rule) {
    // Implementation for custom security rules
    console.log('Custom security rule added:', rule);
  }

  // Method to validate URLs
  validateUrl(url) {
    try {
      const parsedUrl = new URL(url);
      
      // Check against blocklist
      const blockedDomains = [
        'malicious-site.com',
        'phishing-site.com'
      ];

      if (blockedDomains.includes(parsedUrl.hostname)) {
        return false;
      }

      // Check protocol
      const allowedProtocols = ['https:', 'http:', 'file:'];
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('URL validation error:', error);
      return false;
    }
  }

  // Method to sanitize input
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Basic XSS prevention
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .trim();
  }

  // Method to check if origin is trusted
  isTrustedOrigin(origin) {
    const trustedOrigins = [
      'file://',
      'http://localhost:3000',
      'https://ragmaker.com'
    ];

    if (this.isDev) {
      trustedOrigins.push(
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      );
    }

    return trustedOrigins.includes(origin);
  }

  // Method to log security events
  logSecurityEvent(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: global.navigator?.userAgent || 'Unknown'
    };

    console.warn('Security Event:', logEntry);
    
    // In production, you might want to send this to a logging service
    // or save to a local file
  }

  // Cleanup method
  cleanup() {
    // Remove any listeners or cleanup resources
    console.log('SecurityManager cleanup completed');
  }
}

module.exports = { SecurityManager };