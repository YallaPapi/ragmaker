/**
 * Centralized error handling utilities
 */

class ErrorHandler {
  static handleValidationError(error, res) {
    if (error.message && error.message.includes('validate')) {
      return res.status(400).json({ error: error.message });
    }
    return null;
  }

  static handleServiceError(error, res, defaultMessage = 'Internal server error') {
    console.error('Service error:', error);
    return res.status(500).json({ error: error.message || defaultMessage });
  }

  static handleAsyncRoute(handler) {
    return async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  static createErrorResponse(message, status = 500, details = null) {
    const error = new Error(message);
    error.status = status;
    if (details) {
      error.details = details;
    }
    return error;
  }

  static globalErrorHandler(err, req, res, next) {
    // Default error status and message
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    
    // Log error for debugging
    console.error(`Error ${status}: ${message}`);
    if (err.stack && process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
    
    // Send error response
    res.status(status).json({
      error: message,
      ...(process.env.NODE_ENV === 'development' && { details: err.details, stack: err.stack })
    });
  }
}

module.exports = ErrorHandler;
