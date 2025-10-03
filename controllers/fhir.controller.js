const fhirService = require('../services/fhir.service');
const { config: fhirConfig, utils: fhirUtils } = require('../config/fhir');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');
const { NamesteCode, ICD11Code, CodeMapping } = require('../models');

class FhirController {
  // Get FHIR Capability Statement (metadata)
  async getCapabilityStatement(req, res, next) {
    try {
      const capabilityStatement = await fhirService.generateCapabilityStatement();
      
      // Log metadata access
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'FHIR_METADATA_ACCESS',
          resource_type: 'fhir_metadata',
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      res.set(fhirConfig.defaultHeaders);
      res.json(capabilityStatement);

    } catch (error) {
      logger.error('FHIR metadata error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // List all Code Systems
  async listCodeSystems(req, res, next) {
    try {
      const { _count = 20, _offset = 0, url, name, status = 'active' } = req.query;

      const codeSystems = [];

      // Add NAMASTE code systems
      for (const [systemType, config] of Object.entries(fhirConfig.codeSystems.namaste)) {
        if (!url || config.url.includes(url)) {
          if (!name || config.name.toLowerCase().includes(name.toLowerCase())) {
            const codeSystem = await fhirService.generateNamesteCodeSystem(systemType);
            codeSystems.push(codeSystem);
          }
        }
      }

      // Add ICD-11 code systems
      for (const [module, config] of Object.entries(fhirConfig.codeSystems.icd11)) {
        if (!url || config.url.includes(url)) {
          if (!name || config.name.toLowerCase().includes(name.toLowerCase())) {
            const codeSystem = await fhirService.generateICD11CodeSystem(module);
            codeSystems.push(codeSystem);
          }
        }
      }

      // Apply pagination
      const start = parseInt(_offset);
      const count = parseInt(_count);
      const paginatedSystems = codeSystems.slice(start, start + count);

      const bundle = fhirUtils.createSearchBundle(paginatedSystems, codeSystems.length, start);

      res.set(fhirConfig.defaultHeaders);
      res.json(bundle);

    } catch (error) {
      logger.error('List CodeSystems error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // Get specific Code System
  async getCodeSystem(req, res, next) {
    try {
      const { id } = req.params;
      
      let codeSystem;

      // Handle NAMASTE code systems
      if (id.startsWith('namaste-')) {
        const systemType = id.replace('namaste-', '');
        if (['ayurveda', 'siddha', 'unani'].includes(systemType)) {
          codeSystem = await fhirService.generateNamesteCodeSystem(systemType);
        }
      }
      // Handle ICD-11 code systems
      else if (id.startsWith('icd11-')) {
        const module = id.replace('icd11-', '');
        if (['tm2', 'biomedicine'].includes(module)) {
          codeSystem = await fhirService.generateICD11CodeSystem(module);
        }
      }

      if (!codeSystem) {
        return res.status(404).json(
          fhirUtils.createOperationOutcome('error', 'not-found', `CodeSystem '${id}' not found`)
        );
      }

      // Log access
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'FHIR_CODESYSTEM_ACCESS',
          resource_type: 'fhir_codesystem',
          resource_id: id,
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      res.set(fhirConfig.defaultHeaders);
      res.json(codeSystem);

    } catch (error) {
      logger.error('Get CodeSystem error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // Get Concept Maps
  async getConceptMaps(req, res, next) {
    try {
      const { _count = 20, _offset = 0, url, source, target } = req.query;

      const conceptMaps = [];

      // Generate NAMASTE to ICD-11 concept map
      if (!url || fhirConfig.conceptMaps.namasteToIcd11.url.includes(url)) {
        const conceptMap = await fhirService.generateConceptMap();
        conceptMaps.push(conceptMap);
      }

      // Apply pagination
      const start = parseInt(_offset);
      const count = parseInt(_count);
      const paginatedMaps = conceptMaps.slice(start, start + count);

      const bundle = fhirUtils.createSearchBundle(paginatedMaps, conceptMaps.length, start);

      res.set(fhirConfig.defaultHeaders);
      res.json(bundle);

    } catch (error) {
      logger.error('Get ConceptMaps error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // Get specific Concept Map
  async getConceptMap(req, res, next) {
    try {
      const { id } = req.params;

      let conceptMap;

      if (id === 'namaste-to-icd11') {
        conceptMap = await fhirService.generateConceptMap();
      }

      if (!conceptMap) {
        return res.status(404).json(
          fhirUtils.createOperationOutcome('error', 'not-found', `ConceptMap '${id}' not found`)
        );
      }

      res.set(fhirConfig.defaultHeaders);
      res.json(conceptMap);

    } catch (error) {
      logger.error('Get ConceptMap error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // FHIR $translate operation
  async translateOperation(req, res, next) {
    try {
      const { system, code, target, conceptMap } = req.body;

      if (!system || !code) {
        return res.status(400).json(
          fhirUtils.createOperationOutcome('error', 'invalid', 'system and code parameters are required')
        );
      }

      const translations = await fhirService.translateCode(system, code, target);

      const parameters = {
        resourceType: 'Parameters',
        id: fhirUtils.generateResourceId('translate-result'),
        parameter: [
          {
            name: 'result',
            valueBoolean: translations.length > 0
          }
        ]
      };

      // Add match parameters
      translations.forEach((translation, index) => {
        parameters.parameter.push({
          name: 'match',
          part: [
            {
              name: 'equivalence',
              valueCode: translation.equivalence
            },
            {
              name: 'concept',
              valueCoding: translation.concept
            }
          ]
        });
      });

      // Log translation
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'FHIR_TRANSLATE',
          resource_type: 'fhir_operation',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { system, code, target, results: translations.length }
        });
      }

      res.set(fhirConfig.defaultHeaders);
      res.json(parameters);

    } catch (error) {
      logger.error('FHIR translate error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // FHIR $lookup operation
  async lookupOperation(req, res, next) {
    try {
      const { system, code, version } = req.body;

      if (!system || !code) {
        return res.status(400).json(
          fhirUtils.createOperationOutcome('error', 'invalid', 'system and code parameters are required')
        );
      }

      let codeDetails = null;

      // Lookup in NAMASTE systems
      if (system.includes('namaste')) {
        const namasteCode = await NamesteCode.findOne({
          where: { code, status: 'active' }
        });
        
        if (namasteCode) {
          codeDetails = {
            name: namasteCode.display_name,
            definition: namasteCode.definition,
            display: namasteCode.display_name,
            system_type: namasteCode.system_type,
            category: namasteCode.category
          };
        }
      }
      // Lookup in ICD-11 systems
      else if (system.includes('icd')) {
        const icd11Code = await ICD11Code.findOne({
          where: { 
            $or: [
              { icd_id: code },
              { code: code }
            ],
            status: 'active'
          }
        });

        if (icd11Code) {
          codeDetails = {
            name: icd11Code.title,
            definition: icd11Code.definition,
            display: icd11Code.title,
            module: icd11Code.module
          };
        }
      }

      if (!codeDetails) {
        return res.status(404).json(
          fhirUtils.createOperationOutcome('error', 'not-found', `Code '${code}' not found in system '${system}'`)
        );
      }

      const parameters = {
        resourceType: 'Parameters',
        id: fhirUtils.generateResourceId('lookup-result'),
        parameter: [
          {
            name: 'name',
            valueString: codeDetails.name
          },
          {
            name: 'display',
            valueString: codeDetails.display
          }
        ]
      };

      if (codeDetails.definition) {
        parameters.parameter.push({
          name: 'definition',
          valueString: codeDetails.definition
        });
      }

      res.set(fhirConfig.defaultHeaders);
      res.json(parameters);

    } catch (error) {
      logger.error('FHIR lookup error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // Submit FHIR Bundle
  async submitBundle(req, res, next) {
    try {
      const bundle = req.body;

      // Validate bundle
      if (!fhirUtils.validateResource(bundle)) {
        return res.status(400).json(
          fhirUtils.createOperationOutcome('error', 'invalid', 'Invalid FHIR Bundle')
        );
      }

      if (bundle.type !== 'transaction') {
        return res.status(400).json(
          fhirUtils.createOperationOutcome('error', 'invalid', 'Only transaction bundles are supported')
        );
      }

      // Process bundle entries (simplified implementation)
      const responseEntries = [];
      
      for (const entry of bundle.entry || []) {
        if (entry.resource) {
          // Validate each resource
          fhirUtils.validateResource(entry.resource);
          
          // Generate response entry
          responseEntries.push({
            response: {
              status: '201 Created',
              location: `${entry.resource.resourceType}/${fhirUtils.generateResourceId()}`
            }
          });
        }
      }

      const responseBundle = {
        resourceType: 'Bundle',
        id: fhirUtils.generateResourceId('bundle-response'),
        type: 'transaction-response',
        entry: responseEntries
      };

      // Log bundle submission
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'FHIR_BUNDLE_SUBMIT',
          resource_type: 'fhir_bundle',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { 
            bundle_type: bundle.type,
            entry_count: bundle.entry?.length || 0
          }
        });
      }

      res.status(201);
      res.set(fhirConfig.defaultHeaders);
      res.json(responseBundle);

    } catch (error) {
      logger.error('FHIR bundle submit error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }

  // Get Value Sets
  async getValueSets(req, res, next) {
    try {
      const { _count = 20, _offset = 0, url, name } = req.query;

      const valueSets = [];

      // Generate value sets based on configuration
      for (const [key, config] of Object.entries(fhirConfig.valueSets)) {
        if (!url || config.url.includes(url)) {
          if (!name || config.name.toLowerCase().includes(name?.toLowerCase() || '')) {
            const valueSet = {
              resourceType: 'ValueSet',
              id: config.id,
              url: config.url,
              name: config.name,
              title: config.title,
              status: 'active',
              description: config.description,
              compose: {
                include: []
              }
            };

            // Add appropriate code systems
            if (key === 'namasteAll') {
              Object.values(fhirConfig.codeSystems.namaste).forEach(cs => {
                valueSet.compose.include.push({
                  system: cs.url
                });
              });
            } else if (key === 'icd11Tm2') {
              valueSet.compose.include.push({
                system: fhirConfig.codeSystems.icd11.tm2.url
              });
            }

            valueSets.push(valueSet);
          }
        }
      }

      const bundle = fhirUtils.createSearchBundle(valueSets, valueSets.length, parseInt(_offset));

      res.set(fhirConfig.defaultHeaders);
      res.json(bundle);

    } catch (error) {
      logger.error('Get ValueSets error:', error);
      res.status(500).json(
        fhirUtils.createOperationOutcome('error', 'exception', error.message)
      );
    }
  }
}

module.exports = new FhirController();
