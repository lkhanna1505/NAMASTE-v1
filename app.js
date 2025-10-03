const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('dotenv').config();

const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/error.middleware');
const auditMiddleware = require('./middleware/audit.middleware');

// Route imports
const authRoutes = require('./routes/auth.routes');
const fhirRoutes = require('./routes/fhir.routes');
const namasteRoutes = require('./routes/namaste.routes');
const icd11Routes = require('./routes/icd11.routes');
const searchRoutes = require('./routes/search.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Audit middleware for all API routes
app.use('/api', auditMiddleware);
app.use('/fhir', auditMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'NAMASTE-ICD11 API Documentation'
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/fhir', fhirRoutes);
app.use('/api/namaste', namasteRoutes);
app.use('/api/icd11', icd11Routes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);

// Welcome endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🏥 Welcome to NAMASTE-ICD11 Healthcare API',
    description: 'FHIR R4 compliant API for Traditional Medicine terminology mapping',
    documentation: `${req.protocol}://${req.get('host')}/api-docs`,
    fhir_metadata: `${req.protocol}://${req.get('host')}/fhir/metadata`,
    version: '1.0.0',
    status: 'active'
  });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
