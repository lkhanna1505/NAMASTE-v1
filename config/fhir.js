const dotenv = require('dotenv');
dotenv.config();

const fhirConfig = {
  // FHIR Server Configuration
  server: {
    version: '4.0.1',
    baseUrl: process.env.FHIR_BASE_URL || 'http://localhost:3000/fhir',
    title: 'NAMASTE-ICD11 FHIR Terminology Server',
    description: 'FHIR R4 compliant terminology server for Traditional Medicine code mapping',
    publisher: 'Healthcare API Team',
    contact: {
      name: 'Healthcare API Support',
      email: process.env.CONTACT_EMAIL || 'support@healthcare-api.com'
    }
  },

  // Default Headers
  defaultHeaders: {
    'Content-Type': 'application/fhir+json',
    'Accept': 'application/fhir+json',
    'Accept-Charset': 'UTF-8'
  },

  // Supported Resource Types
  supportedResources: [
    'CodeSystem',
    'ConceptMap',
    'ValueSet',
    'Bundle',
    'Parameters',
    'Patient',
    'Condition',
    'Encounter'
  ],

  // Code Systems
  codeSystems: {
    namaste: {
      ayurveda: {
        id: 'namaste-ayurveda',
        url: 'http://terminology.hl7.org/CodeSystem/namaste-ayurveda',
        name: 'NAMASTE_Ayurveda',
        title: 'NAMASTE Ayurveda Terminology',
        description: 'Standardized terminology for Ayurveda disorders and conditions'
      },
      siddha: {
        id: 'namaste-siddha',
        url: 'http://terminology.hl7.org/CodeSystem/namaste-siddha',
        name: 'NAMASTE_Siddha',
        title: 'NAMASTE Siddha Terminology',
        description: 'Standardized terminology for Siddha disorders and conditions'
      },
      unani: {
        id: 'namaste-unani',
        url: 'http://terminology.hl7.org/CodeSystem/namaste-unani',
        name: 'NAMASTE_Unani',
        title: 'NAMASTE Unani Terminology',
        description: 'Standardized terminology for Unani disorders and conditions'
      }
    },
    icd11: {
      tm2: {
        id: 'icd11-tm2',
        url: 'http://id.who.int/icd/release/11/2023-01/tm2',
        name: 'ICD11_TM2',
        title: 'ICD-11 Traditional Medicine Module 2',
        description: 'WHO ICD-11 Traditional Medicine Module 2 terminology'
      },
      biomedicine: {
        id: 'icd11-biomedicine',
        url: 'http://id.who.int/icd/release/11/2023-01/mms',
        name: 'ICD11_Biomedicine',
        title: 'ICD-11 Biomedicine Module',
        description: 'WHO ICD-11 Biomedicine terminology'
      }
    }
  },

  // Concept Maps
  conceptMaps: {
    namasteToIcd11: {
      id: 'namaste-to-icd11',
      url: 'http://terminology.hl7.org/ConceptMap/namaste-to-icd11',
      name: 'NAMASTE_to_ICD11',
      title: 'NAMASTE to ICD-11 Concept Map',
      description: 'Mapping between NAMASTE traditional medicine codes and ICD-11 codes'
    }
  },

  // Value Sets
  valueSets: {
    namasteAll: {
      id: 'namaste-all',
      url: 'http://terminology.hl7.org/ValueSet/namaste-all',
      name: 'NAMASTE_All',
      title: 'All NAMASTE Codes',
      description: 'Complete set of NAMASTE traditional medicine codes'
    },
    icd11Tm2: {
      id: 'icd11-tm2-all',
      url: 'http://terminology.hl7.org/ValueSet/icd11-tm2-all',
      name: 'ICD11_TM2_All',
      title: 'All ICD-11 TM2 Codes',
      description: 'Complete set of ICD-11 Traditional Medicine Module 2 codes'
    }
  },

  // Operation Definitions
  operations: {
    translate: {
      name: 'translate',
      definition: 'http://hl7.org/fhir/OperationDefinition/ConceptMap-translate',
      description: 'Translate codes between terminology systems'
    },
    lookup: {
      name: 'lookup',
      definition: 'http://hl7.org/fhir/OperationDefinition/CodeSystem-lookup',
      description: 'Look up code details in a code system'
    },
    validate: {
      name: 'validate-code',
      definition: 'http://hl7.org/fhir/OperationDefinition/CodeSystem-validate-code',
      description: 'Validate a code in a code system'
    }
  },

  // Search Parameters
  searchParameters: {
    codeSystem: [
      { name: 'url', type: 'uri', description: 'The uri that identifies the code system' },
      { name: 'version', type: 'token', description: 'The business version of the code system' },
      { name: 'name', type: 'string', description: 'Computationally friendly name of the code system' },
      { name: 'title', type: 'string', description: 'The human-friendly name of the code system' },
      { name: 'status', type: 'token', description: 'The current status of the code system' }
    ],
    conceptMap: [
      { name: 'url', type: 'uri', description: 'The uri that identifies the concept map' },
      { name: 'source', type: 'reference', description: 'The source value set that contains the concepts that are being mapped' },
      { name: 'target', type: 'reference', description: 'The target value set which provides context for the mappings' },
      { name: 'source-code', type: 'token', description: 'Identifies element being mapped' },
      { name: 'target-code', type: 'token', description: 'Code that identifies the target element' }
    ]
  },

  // Security Configuration
  security: {
    cors: {
      enabled: true,
      allowedOrigins: process.env.CORS_ALLOWED_ORIGINS 
        ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
        : ['http://localhost:3000', 'http://localhost:3001'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
    },
    authentication: {
      required: process.env.FHIR_AUTH_REQUIRED === 'true',
      methods: ['bearer', 'basic'],
      realm: 'NAMASTE-ICD11 FHIR Server'
    }
  },

  // Capability Statement Template
  capabilityStatement: {
    resourceType: 'CapabilityStatement',
    status: 'active',
    experimental: false,
    kind: 'instance',
    software: {
      name: 'NAMASTE-ICD11 FHIR Server',
      version: process.env.npm_package_version || '1.0.0'
    },
    implementation: {
      description: 'NAMASTE to ICD-11 Terminology Mapping Server'
    },
    fhirVersion: '4.0.1',
    format: ['json'],
    patchFormat: ['application/json-patch+json'],
    acceptUnknown: 'no',
    rest: [{
      mode: 'server',
      documentation: 'FHIR R4 Terminology Server for Traditional Medicine',
      security: {
        cors: true,
        description: 'Uses JWT Bearer tokens for authentication'
      }
    }]
  },

  // Validation Rules
  validation: {
    strictValidation: process.env.FHIR_STRICT_VALIDATION === 'true',
    validateAgainstProfile: true,
    requireResourceType: true,
    allowUnknownElements: false
  },

  // Pagination
  pagination: {
    defaultPageSize: 20,
    maxPageSize: 100,
    defaultSortOrder: 'asc'
  },

  // Logging
  logging: {
    logRequests: process.env.NODE_ENV === 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    includeRequestId: true
  }
};

// FHIR Utility Functions
const fhirUtils = {
  // Generate resource ID
  generateResourceId(prefix = 'resource') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${prefix}-${timestamp}-${random}`;
  },

  // Validate FHIR resource
  validateResource(resource) {
    if (!resource.resourceType) {
      throw new Error('Resource must have a resourceType');
    }

    if (!fhirConfig.supportedResources.includes(resource.resourceType)) {
      throw new Error(`Unsupported resource type: ${resource.resourceType}`);
    }

    return true;
  },

  // Create operation outcome
  createOperationOutcome(severity, code, details) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{
        severity,
        code,
        details: {
          text: details
        }
      }]
    };
  },

  // Create Bundle
  createBundle(type, entries = []) {
    return {
      resourceType: 'Bundle',
      id: this.generateResourceId('bundle'),
      type,
      total: entries.length,
      entry: entries.map(entry => ({
        resource: entry
      }))
    };
  },

  // Create search Bundle
  createSearchBundle(resources, total, offset = 0) {
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total,
      entry: resources.map((resource, index) => ({
        fullUrl: `${fhirConfig.server.baseUrl}/${resource.resourceType}/${resource.id}`,
        resource,
        search: {
          mode: 'match',
          rank: index + offset + 1
        }
      }))
    };
  }
};

module.exports = {
  config: fhirConfig,
  utils: fhirUtils
};
