const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');

// Redis client for rate limiting (optional - falls back to memory store)
let redisClient = null;
try {
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });
    redisClient.connect().catch(err => {
      logger.warn('Redis connection failed, using memory store for rate limiting:', err.message);
      redisClient = null;
    });
  }
} catch (error) {
  logger.warn('Redis setup failed, using memory store for rate limiting:', error.message);
}

// Create rate limiter with Redis store if available
function createRateLimiter(options = {}) {
  const defaultOptions = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000)
    },
    // Custom key generator to include user ID if available
    keyGenerator: (req) => {
      return req.user ? `${req.ip}:${req.user.id}` : req.ip;
    },
    // Skip successful requests for authenticated users with higher limits
    skip: (req) => {
      return false; // Don't skip any requests by default
    }
  };

  // Use Redis store if available
  if (redisClient) {
    defaultOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:',
    });
  }

  return rateLimit({
    ...defaultOptions,
    ...options
  });
}

// Different rate limiters for different endpoints
const rateLimiters = {
  // General API rate limiting
  general: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many API requests. Please try again later.',
    }
  }),

  // Authentication endpoints (stricter)
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 auth requests per 15 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many authentication attempts. Please try again later.',
    }
  }),

  // Search endpoints (moderate)
  search: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 search requests per 5 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many search requests. Please try again later.',
    }
  }),

  // FHIR endpoints (generous for healthcare operations)
  fhir: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 FHIR requests per 15 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many FHIR API requests. Please try again later.',
    }
  }),

  // Admin endpoints (very strict)
  admin: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 admin requests per 15 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many admin requests. Please try again later.',
    }
  }),

  // Create/Update operations (moderate)
  modify: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 create/update requests per 15 minutes
    message: {
      error: 'Too Many Requests',
      message: 'Too many create/update requests. Please try again later.',
    }
  }),

  // File upload (very strict)
  upload: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 uploads per hour
    message: {
      error: 'Too Many Requests',
      message: 'Too many file uploads. Please try again later.',
    }
  })
};

// Dynamic rate limiter that adjusts based on user role
const dynamicRateLimit = (req, res, next) => {
  let maxRequests = 100; // Default for unauthenticated users
  let windowMs = 15 * 60 * 1000; // 15 minutes

  if (req.user) {
    switch (req.user.role) {
      case 'admin':
        maxRequests = 500; // Higher limit for admins
        break;
      case 'clinician':
        maxRequests = 200; // Moderate limit for clinicians
        break;
      case 'viewer':
        maxRequests = 100; // Standard limit for viewers
        break;
    }
  }

  const limiter = createRateLimiter({
    windowMs,
    max: maxRequests,
    message: {
      error: 'Too Many Requests',
      message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 60000} minutes.`,
    }
  });

  return limiter(req, res, next);
};

// Rate limiter with custom logic for different endpoints
const smartRateLimit = (req, res, next) => {
  const path = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  // Choose appropriate rate limiter based on endpoint
  if (path.startsWith('/api/auth')) {
    return rateLimiters.auth(req, res, next);
  } else if (path.startsWith('/api/search') || path.startsWith('/api/autocomplete')) {
    return rateLimiters.search(req, res, next);
  } else if (path.startsWith('/fhir')) {
    return rateLimiters.fhir(req, res, next);
  } else if (path.startsWith('/api/admin')) {
    return rateLimiters.admin(req, res, next);
  } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return rateLimiters.modify(req, res, next);
  } else {
    return rateLimiters.general(req, res, next);
  }
};

// Rate limiter for specific high-traffic endpoints
const highTrafficRateLimit = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'This endpoint has high traffic. Please try again in a minute.',
  }
});

// Rate limiter that considers request size for bulk operations
const bulkOperationRateLimit = (req, res, next) => {
  const contentLength = parseInt(req.get('content-length') || '0');
  const itemCount = req.body && Array.isArray(req.body.codes) ? req.body.codes.length : 1;
  
  // Adjust rate limit based on request size
  let max = 10; // Default for large operations
  if (contentLength < 10000 && itemCount < 10) {
    max = 50; // Higher limit for small operations
  } else if (contentLength < 100000 && itemCount < 50) {
    max = 20; // Medium limit for medium operations
  }

  const limiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max,
    message: {
      error: 'Too Many Requests',
      message: `Too many bulk operations. Limit: ${max} per 15 minutes based on request size.`,
    }
  });

  return limiter(req, res, next);
};

// Custom rate limiter that tracks different actions separately
const actionBasedRateLimit = (action) => {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    keyGenerator: (req) => {
      return `${req.user ? req.user.id : req.ip}:${action}`;
    },
    message: {
      error: 'Too Many Requests',
      message: `Too many ${action} requests. Please try again later.`,
    }
  });
};

// Progressive rate limiter that gets stricter with repeated violations
const progressiveRateLimit = (req, res, next) => {
  const violations = req.rateLimit ? req.rateLimit.totalHits : 0;
  
  let max = 100;
  if (violations > 1000) {
    max = 10; // Very strict for heavy violators
  } else if (violations > 500) {
    max = 25; // Strict for moderate violators
  } else if (violations > 100) {
    max = 50; // Moderate for light violators
  }

  const limiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max,
    message: {
      error: 'Too Many Requests',
      message: `Rate limit adjusted due to usage pattern. Limit: ${max} per 15 minutes.`,
    }
  });

  return limiter(req, res, next);
};

// Export all rate limiters
module.exports = {
  // Basic rate limiters
  general: rateLimiters.general,
  auth: rateLimiters.auth,
  search: rateLimiters.search,
  fhir: rateLimiters.fhir,
  admin: rateLimiters.admin,
  modify: rateLimiters.modify,
  upload: rateLimiters.upload,
  
  // Advanced rate limiters
  dynamic: dynamicRateLimit,
  smart: smartRateLimit,
  highTraffic: highTrafficRateLimit,
  bulkOperation: bulkOperationRateLimit,
  progressive: progressiveRateLimit,
  
  // Action-based rate limiters
  actionBased: actionBasedRateLimit,
  
  // Custom rate limiter creator
  createCustom: createRateLimiter
};
