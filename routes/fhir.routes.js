const express = require('express');
const router = express.Router();
const fhirService = require('../services/fhir.service');
const { optionalAuth } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /fhir/metadata:
 *   get:
 *     summary: Get FHIR Capability Statement
 *     tags: [FHIR]
 *     responses:
 *       200:
 *         description: FHIR Capability Statement
 */
router.get('/metadata', optionalAuth, (req, res) => {
  try {
    const capability = fhirService.generateCapabilityStatement();
    res.json(capability);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /fhir/CodeSystem:
 *   get:
 *     summary: List available code systems
 *     tags: [FHIR]
 *     responses:
 *       200:
 *         description: Bundle of CodeSystems
 */
router.get('/CodeSystem', optionalAuth, (req, res) => {
  const bundle = {
    resourceType: "Bundle",
    type: "searchset",
    total: 4,
    entry: [
      {
        resource: {
          resourceType: "CodeSystem",
          id: "namaste-ayurveda",
          url: "http://terminology.hl7.org/CodeSystem/namaste-ayurveda",
          name: "NAMASTE Ayurveda",
          status: "active"
        }
      },
      {
        resource: {
          resourceType: "CodeSystem", 
          id: "namaste-siddha",
          url: "http://terminology.hl7.org/CodeSystem/namaste-siddha",
          name: "NAMASTE Siddha",
          status: "active"
        }
      },
      {
        resource: {
          resourceType: "CodeSystem",
          id: "namaste-unani", 
          url: "http://terminology.hl7.org/CodeSystem/namaste-unani",
          name: "NAMASTE Unani",
          status: "active"
        }
      },
      {
        resource: {
          resourceType: "CodeSystem",
          id: "icd11-tm2",
          url: "http://id.who.int/icd/release/11/2023-01/tm2", 
          name: "ICD-11 Traditional Medicine Module 2",
          status: "active"
        }
      }
    ]
  };

  res.json(bundle);
});

/**
 * @swagger
 * /fhir/CodeSystem/{system}:
 *   get:
 *     summary: Get specific CodeSystem
 *     tags: [FHIR]
 *     parameters:
 *       - name: system
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [namaste-ayurveda, namaste-siddha, namaste-unani, icd11-tm2]
 */
router.get('/CodeSystem/:system', optionalAuth, async (req, res) => {
  try {
    const { system } = req.params;
    
    if (system.startsWith('namaste-')) {
      const systemType = system.replace('namaste-', '');
      const codeSystem = await fhirService.generateNamesteCodeSystem(systemType);
      res.json(codeSystem);
    } else if (system === 'icd11-tm2') {
      const codeSystem = await fhirService.generateICD11CodeSystem('tm2');
      res.json(codeSystem);
    } else {
      res.status(404).json({
        error: 'Not Found',
        message: 'CodeSystem not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error', 
      message: error.message
    });
  }
});

/**
 * @swagger
 * /fhir/ConceptMap:
 *   get:
 *     summary: Get concept mappings
 *     tags: [FHIR]
 */
router.get('/ConceptMap', optionalAuth, async (req, res) => {
  try {
    const conceptMap = await fhirService.generateConceptMap();
    res.json(conceptMap);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /fhir/$translate:
 *   post:
 *     summary: Translate codes between systems
 *     tags: [FHIR]
 */
router.post('/$translate', optionalAuth, async (req, res) => {
  try {
    const { system, code, target } = req.body;
    
    if (!system || !code) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'system and code parameters required'
      });
    }

    const translations = await fhirService.translateCode(system, code, target);
    
    res.json({
      resourceType: "Parameters",
      parameter: [
        {
          name: "result",
          valueBoolean: translations.length > 0
        },
        ...translations.map(t => ({
          name: "match",
          part: [
            {
              name: "equivalence", 
              valueCode: t.equivalence
            },
            {
              name: "concept",
              valueCoding: t.concept
            }
          ]
        }))
      ]
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
