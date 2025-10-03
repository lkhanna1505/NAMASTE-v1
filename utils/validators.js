const Joi = require('joi');

const schemas = {
  // User validation
  user: {
    create: Joi.object({
      abha_id: Joi.string().required().min(10).max(100),
      email: Joi.string().email(),
      name: Joi.string().required().min(2).max(255),
      password: Joi.string().min(8).max(128),
      role: Joi.string().valid('clinician', 'admin', 'viewer').default('clinician')
    }),
    update: Joi.object({
      email: Joi.string().email(),
      name: Joi.string().min(2).max(255),
      role: Joi.string().valid('clinician', 'admin', 'viewer')
    })
  },

  // NAMASTE code validation
  namasteCode: {
    create: Joi.object({
      code: Joi.string().required().max(50),
      display_name: Joi.string().required().max(500),
      definition: Joi.string().allow(''),
      system_type: Joi.string().valid('ayurveda', 'siddha', 'unani').required(),
      category: Joi.string().max(100),
      synonyms: Joi.array().items(Joi.string()),
      parent_code: Joi.string().max(50),
      level: Joi.number().integer().min(0),
      metadata: Joi.object()
    })
  },

  // Code mapping validation
  codeMapping: {
    create: Joi.object({
      namaste_code: Joi.string().required().max(50),
      icd11_code: Joi.string().required().max(100),
      mapping_type: Joi.string().valid('equivalent', 'broader', 'narrower', 'related').default('equivalent'),
      confidence_score: Joi.number().min(0).max(1).default(1.00),
      notes: Joi.string().allow('')
    })
  },

  // Search validation
  search: {
    query: Joi.object({
      q: Joi.string().required().min(2).max(200),
      system: Joi.string().valid('namaste', 'icd11', 'all').default('all'),
      limit: Joi.number().integer().min(1).max(100).default(20),
      offset: Joi.number().integer().min(0).default(0),
      category: Joi.string().max(100)
    })
  },

  // FHIR Bundle validation (simplified)
  fhirBundle: {
    create: Joi.object({
      resourceType: Joi.string().valid('Bundle').required(),
      type: Joi.string().valid('transaction', 'document', 'message').required(),
      entry: Joi.array().items(Joi.object({
        resource: Joi.object().required()
      })).required()
    })
  }
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Query Validation Error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    req.query = value;
    next();
  };
};

module.exports = {
  schemas,
  validate,
  validateQuery
};
