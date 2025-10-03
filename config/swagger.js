const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NAMASTE-ICD11 Healthcare API',
      version: '1.0.0',
      description: 'FHIR R4 compliant API for Traditional Medicine terminology mapping between NAMASTE and ICD-11',
      contact: {
        name: 'Healthcare API Support',
        email: 'support@healthcare-api.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Error Type'
            },
            message: {
              type: 'string',
              example: 'Error description'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        NamesteCode: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1
            },
            code: {
              type: 'string',
              example: 'NAM001'
            },
            display_name: {
              type: 'string',
              example: 'Vata Prakopa'
            },
            definition: {
              type: 'string',
              example: 'Aggravation of Vata dosha'
            },
            system_type: {
              type: 'string',
              enum: ['ayurveda', 'siddha', 'unani'],
              example: 'ayurveda'
            },
            category: {
              type: 'string',
              example: 'Dosha'
            }
          }
        },
        ICD11Code: {
          type: 'object',
          properties: {
            id: {
              type: 'integer'
            },
            icd_id: {
              type: 'string',
              example: '1435254666'
            },
            code: {
              type: 'string',
              example: 'TM2.1'
            },
            title: {
              type: 'string',
              example: 'Constitutional patterns'
            },
            module: {
              type: 'string',
              enum: ['tm2', 'biomedicine']
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './controllers/*.js']
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
