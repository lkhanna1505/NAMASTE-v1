const mappingService = require('../services/mapping.service');
const { CodeMapping, NamesteCode, ICD11Code } = require('../models');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const { Op } = require('sequelize');

class MappingController {
  // Create new code mapping
  async createMapping(req, res, next) {
    try {
      const { namaste_code, icd11_code, mapping_type, confidence_score, notes } = req.body;
      const userId = req.user.id;

      // Validation
      if (!namaste_code || !icd11_code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'namaste_code and icd11_code are required'
        });
      }

      // Verify codes exist
      const namasteExists = await NamesteCode.findOne({
        where: { code: namaste_code, status: 'active' }
      });

      if (!namasteExists) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'NAMASTE code not found or inactive'
        });
      }

      const icd11Exists = await ICD11Code.findOne({
        where: {
          [Op.or]: [
            { icd_id: icd11_code },
            { code: icd11_code }
          ],
          status: 'active'
        }
      });

      if (!icd11Exists) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'ICD-11 code not found or inactive'
        });
      }

      // Check for existing mapping
      const existingMapping = await CodeMapping.findOne({
        where: {
          namaste_code,
          icd11_code: icd11Exists.icd_id,
          is_active: true
        }
      });

      if (existingMapping) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Mapping already exists between these codes'
        });
      }

      // Calculate confidence score if not provided
      const calculatedConfidence = confidence_score || 
        helpers.calculateMappingConfidence(namasteExists.display_name, icd11Exists.title);

      // Create mapping
      const mapping = await CodeMapping.create({
        namaste_code,
        icd11_code: icd11Exists.icd_id,
        mapping_type: mapping_type || 'equivalent',
        confidence_score: calculatedConfidence,
        notes,
        verified_by: userId,
        verified_at: new Date(),
        is_active: true
      });

      // Log creation
      await auditService.logAction({
        user_id: userId,
        action: 'MAPPING_CREATED',
        resource_type: 'code_mapping',
        resource_id: mapping.id.toString(),
        new_values: {
          namaste_code,
          icd11_code: icd11Exists.icd_id,
          mapping_type: mapping.mapping_type,
          confidence_score: mapping.confidence_score
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      // Fetch complete mapping data
      const completeMapping = await CodeMapping.findByPk(mapping.id, {
        include: [
          {
            association: 'namasteCodeDetails',
            attributes: ['code', 'display_name', 'system_type', 'category']
          },
          {
            association: 'icd11CodeDetails',
            attributes: ['icd_id', 'title', 'module']
          },
          {
            association: 'verifier',
            attributes: ['name', 'abha_id']
          }
        ]
      });

      res.status(201).json({
        message: 'Mapping created successfully',
        mapping: completeMapping
      });

    } catch (error) {
      logger.error('Create mapping error:', error);
      next(error);
    }
  }

  // Get mapping by ID
  async getMapping(req, res, next) {
    try {
      const { id } = req.params;

      const mapping = await CodeMapping.findByPk(id, {
        include: [
          {
            association: 'namasteCodeDetails',
            attributes: ['code', 'display_name', 'definition', 'system_type', 'category']
          },
          {
            association: 'icd11CodeDetails',
            attributes: ['icd_id', 'code', 'title', 'definition', 'module']
          },
          {
            association: 'verifier',
            attributes: ['name', 'abha_id']
          }
        ]
      });

      if (!mapping) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mapping not found'
        });
      }

      res.json(mapping);

    } catch (error) {
      logger.error('Get mapping error:', error);
      next(error);
    }
  }

  // Update mapping
  async updateMapping(req, res, next) {
    try {
      const { id } = req.params;
      const { mapping_type, confidence_score, notes, is_active } = req.body;
      const userId = req.user.id;

      const mapping = await CodeMapping.findByPk(id);
      
      if (!mapping) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mapping not found'
        });
      }

      // Store old values for audit
      const oldValues = {
        mapping_type: mapping.mapping_type,
        confidence_score: mapping.confidence_score,
        notes: mapping.notes,
        is_active: mapping.is_active
      };

      // Update mapping
      const updatedFields = {};
      if (mapping_type !== undefined) updatedFields.mapping_type = mapping_type;
      if (confidence_score !== undefined) updatedFields.confidence_score = confidence_score;
      if (notes !== undefined) updatedFields.notes = notes;
      if (is_active !== undefined) updatedFields.is_active = is_active;
      
      updatedFields.verified_by = userId;
      updatedFields.verified_at = new Date();

      await mapping.update(updatedFields);

      // Log update
      await auditService.logAction({
        user_id: userId,
        action: 'MAPPING_UPDATED',
        resource_type: 'code_mapping',
        resource_id: id,
        old_values: oldValues,
        new_values: updatedFields,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      // Fetch updated mapping
      const updatedMapping = await CodeMapping.findByPk(id, {
        include: [
          {
            association: 'namasteCodeDetails',
            attributes: ['code', 'display_name', 'system_type']
          },
          {
            association: 'icd11CodeDetails',
            attributes: ['icd_id', 'title', 'module']
          }
        ]
      });

      res.json({
        message: 'Mapping updated successfully',
        mapping: updatedMapping
      });

    } catch (error) {
      logger.error('Update mapping error:', error);
      next(error);
    }
  }

  // Delete mapping (soft delete)
  async deleteMapping(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const mapping = await CodeMapping.findByPk(id);
      
      if (!mapping) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mapping not found'
        });
      }

      // Soft delete
      await mapping.update({ 
        is_active: false,
        verified_by: userId,
        verified_at: new Date()
      });

      // Log deletion
      await auditService.logAction({
        user_id: userId,
        action: 'MAPPING_DELETED',
        resource_type: 'code_mapping',
        resource_id: id,
        old_values: { is_active: true },
        new_values: { is_active: false },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({
        message: 'Mapping deleted successfully'
      });

    } catch (error) {
      logger.error('Delete mapping error:', error);
      next(error);
    }
  }

  // Get suggested mappings for a code
  async getSuggestedMappings(req, res, next) {
    try {
      const { code } = req.params;
      const { limit = 5 } = req.query;

      const suggestions = await mappingService.findSuggestedMappings(code, parseInt(limit));

      res.json({
        source_code: code,
        suggestions
      });

    } catch (error) {
      logger.error('Get suggested mappings error:', error);
      next(error);
    }
  }

  // Batch translate codes
  async batchTranslate(req, res, next) {
    try {
      const { codes, source_system, target_system } = req.body;

      if (!codes || !Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'codes array is required'
        });
      }

      if (codes.length > 50) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Maximum 50 codes allowed per batch request'
        });
      }

      if (!source_system || !target_system) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'source_system and target_system are required'
        });
      }

      const results = {};

      if (source_system === 'namaste' && target_system === 'icd11') {
        const mappings = await CodeMapping.findAll({
          where: {
            namaste_code: { [Op.in]: codes },
            is_active: true
          },
          include: [
            {
              association: 'namasteCodeDetails',
              attributes: ['code', 'display_name', 'system_type']
            },
            {
              association: 'icd11CodeDetails',
              attributes: ['icd_id', 'title', 'module']
            }
          ]
        });

        codes.forEach(code => {
          const codeMappings = mappings.filter(m => m.namaste_code === code);
          results[code] = codeMappings.map(mapping => ({
            target_code: mapping.icd11_code,
            target_display: mapping.icd11CodeDetails?.title,
            target_module: mapping.icd11CodeDetails?.module,
            mapping_type: mapping.mapping_type,
            confidence_score: parseFloat(mapping.confidence_score),
            verified: !!mapping.verified_by
          }));
        });
      } 
      else if (source_system === 'icd11' && target_system === 'namaste') {
        const mappings = await CodeMapping.findAll({
          where: {
            icd11_code: { [Op.in]: codes },
            is_active: true
          },
          include: [
            {
              association: 'namasteCodeDetails',
              attributes: ['code', 'display_name', 'system_type']
            },
            {
              association: 'icd11CodeDetails',
              attributes: ['icd_id', 'title']
            }
          ]
        });

        codes.forEach(code => {
          const codeMappings = mappings.filter(m => m.icd11_code === code);
          results[code] = codeMappings.map(mapping => ({
            target_code: mapping.namaste_code,
            target_display: mapping.namasteCodeDetails?.display_name,
            target_system_type: mapping.namasteCodeDetails?.system_type,
            mapping_type: mapping.mapping_type,
            confidence_score: parseFloat(mapping.confidence_score),
            verified: !!mapping.verified_by
          }));
        });
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid source_system or target_system combination'
        });
      }

      // Log batch translation
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'BATCH_TRANSLATE',
          resource_type: 'code_mapping',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: {
            source_system,
            target_system,
            codes_count: codes.length,
            results_count: Object.values(results).flat().length
          }
        });
      }

      res.json({
        source_system,
        target_system,
        requested_codes: codes,
        total_requested: codes.length,
        total_mappings_found: Object.values(results).flat().length,
        results
      });

    } catch (error) {
      logger.error('Batch translate error:', error);
      next(error);
    }
  }

  // Validate mapping
  async validateMapping(req, res, next) {
    try {
      const { id } = req.params;

      const validation = await mappingService.validateMapping(id);

      res.json(validation);

    } catch (error) {
      logger.error('Validate mapping error:', error);
      next(error);
    }
  }

  // Get mapping statistics
  async getStatistics(req, res, next) {
    try {
      const stats = await mappingService.getMappingStatistics();

      res.json(stats);

    } catch (error) {
      logger.error('Get mapping statistics error:', error);
      next(error);
    }
  }

  // Export mappings
  async exportMappings(req, res, next) {
    try {
      const { 
        format = 'json', 
        system_type, 
        mapping_type, 
        verified_only = false 
      } = req.query;

      const filters = {};
      if (system_type) filters.system_type = system_type;
      if (mapping_type) filters.mapping_type = mapping_type;
      if (verified_only === 'true') filters.verified_only = true;

      const exportData = await mappingService.exportMappings(format, filters);

      // Set appropriate headers
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=namaste-icd11-mappings.csv');
        res.send(exportData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=namaste-icd11-mappings.json');
        res.json(exportData);
      }

      // Log export
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'MAPPINGS_EXPORTED',
          resource_type: 'code_mapping',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { format, filters }
        });
      }

    } catch (error) {
      logger.error('Export mappings error:', error);
      next(error);
    }
  }

  // List mappings with pagination and filtering
  async listMappings(req, res, next) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        namaste_code,
        icd11_code,
        mapping_type,
        system_type,
        verified_only = false,
        confidence_min,
        confidence_max,
        search
      } = req.query;

      const whereClause = { is_active: true };
      const include = [
        {
          association: 'namasteCodeDetails',
          attributes: ['code', 'display_name', 'system_type', 'category']
        },
        {
          association: 'icd11CodeDetails',
          attributes: ['icd_id', 'code', 'title', 'module']
        }
      ];

      // Apply filters
      if (namaste_code) whereClause.namaste_code = namaste_code;
      if (icd11_code) whereClause.icd11_code = icd11_code;
      if (mapping_type) whereClause.mapping_type = mapping_type;
      if (verified_only === 'true') whereClause.verified_by = { [Op.not]: null };
      
      if (confidence_min || confidence_max) {
        whereClause.confidence_score = {};
        if (confidence_min) whereClause.confidence_score[Op.gte] = parseFloat(confidence_min);
        if (confidence_max) whereClause.confidence_score[Op.lte] = parseFloat(confidence_max);
      }

      if (system_type) {
        whereClause['$namasteCodeDetails.system_type$'] = system_type;
      }

      if (search) {
        whereClause[Op.or] = [
          { '$namasteCodeDetails.display_name$': { [Op.like]: `%${search}%` } },
          { '$icd11CodeDetails.title$': { [Op.like]: `%${search}%` } }
        ];
      }

      const mappings = await CodeMapping.findAndCountAll({
        where: whereClause,
        include,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        total: mappings.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        mappings: mappings.rows
      });

    } catch (error) {
      logger.error('List mappings error:', error);
      next(error);
    }
  }
}

module.exports = new MappingController();
