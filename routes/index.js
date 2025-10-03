const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth.routes');
const fhirRoutes = require('./fhir.routes');
const namasteRoutes = require('./namaste.routes');
const icd11Routes = require('./icd11.routes');
const searchRoutes = require('./search.routes');
const adminRoutes = require('./admin.routes');
const mappingRoutes = require('./mapping.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/namaste', namasteRoutes);
router.use('/icd11', icd11Routes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);
router.use('/mapping', mappingRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'NAMASTE-ICD11 Healthcare API',
    version: '1.0.0',
    description: 'FHIR R4 compliant API for Traditional Medicine terminology mapping',
    endpoints: {
      authentication: '/api/auth',
      fhir: '/fhir',
      namaste: '/api/namaste',
      icd11: '/api/icd11',
      search: '/api/search',
      mapping: '/api/mapping',
      admin: '/api/admin',
      documentation: '/api-docs'
    },
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
