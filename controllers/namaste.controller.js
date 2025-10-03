const { NamesteCode } = require('../models');
const namasteService = require('../services/namaste.service');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class NamasteController {
  // Get all NAMASTE codes with filtering and pagination
  async getAllCodes(req, res, next) {
    try {
      const { 
        system_type, 
        category, 
        status = 'active',
        limit = 50, 
        offset = 0,
        search,
        sort_by = 'display_name',
        sort_order = 'ASC'
      } = req.query;

      const whereClause = { status };
      
      // Apply filters
      if (system_type && ['ayurveda', 'siddha', 'unani'].includes(system_type)) {
        whereClause.system_type = system_type;
      }
      
      if (category) {
        whereClause.category = category;
      }

      if (search) {
        whereClause[Op.or] = [
          { display_name: { [Op.like]: `%${search}%` } },
          { code: { [Op.like]: `%${search}%` } },
          { definition: { [Op.like]: `%${search}%` } }
        ];
      }

      const validSortFields = ['display_name', 'code', 'system_type', 'category', 'created_at'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'display_name';
      const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      const result = await NamesteCode.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[sortField, sortDirection]],
        attributes: [
          'id', 'code', 'display_name', 'definition', 
          'system_type', 'category', 'synonyms', 'level', 
          'status', 'version', 'created_at'
        ]
      });

      // Log access if user is authenticated
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'NAMASTE_CODES_LIST',
          resource_type: 'namaste_code',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { 
            filters: { system_type, category, search },
            result_count: result.count
          }
        });
      }

      res.json({
        total: result.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        filters: {
          system_type,
          category,
          search,
          status
        },
        codes: result.rows
      });

    } catch (error) {
      logger.error('Get all NAMASTE codes error:', error);
      next(error);
    }
  }

  // Get specific NAMASTE code details
  async getCodeDetails(req, res, next) {
    try {
      const { code } = req.params;
      const { include_mappings = false } = req.query;

      if (!code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Code parameter is required'
        });
      }

      let namasteCode = await NamesteCode.findOne({
        where: { code, status: 'active' }
      });

      if (!namasteCode) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'NAMASTE code not found'
        });
      }

      const response = {
        id: namasteCode.id,
        code: namasteCode.code,
        display_name: namasteCode.display_name,
        definition: namasteCode.definition,
        system_type: namasteCode.system_type,
        category: namasteCode.category,
        synonyms: namasteCode.synonyms,
        parent_code: namasteCode.parent_code,
        level: namasteCode.level,
        status: namasteCode.status,
        version: namasteCode.version,
        metadata: namasteCode.metadata,
        created_at: namasteCode.created_at,
        updated_at: namasteCode.updated_at
      };

      // Include mappings if requested
      if (include_mappings === 'true') {
        const { CodeMapping } = require('../models');
        const mappings = await CodeMapping.findAll({
          where: { 
            namaste_code: code,
            is_active: true 
          },
          include: [{
            association: 'icd11CodeDetails',
            attributes: ['icd_id', 'title', 'module']
          }],
          attributes: ['id', 'icd11_code', 'mapping_type', 'confidence_score', 'verified_by', 'verified_at']
        });

        response.mappings = mappings.map(mapping => ({
          id: mapping.id,
          icd11_code: mapping.icd11_code,
          icd11_title: mapping.icd11CodeDetails?.title,
          icd11_module: mapping.icd11CodeDetails?.module,
          mapping_type: mapping.mapping_type,
          confidence_score: parseFloat(mapping.confidence_score),
          verified: !!mapping.verified_by,
          verified_at: mapping.verified_at
        }));
      }

      // Log access
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'NAMASTE_CODE_ACCESS',
          resource_type: 'namaste_code',
          resource_id: code,
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      res.json(response);

    } catch (error) {
      logger.error('Get NAMASTE code details error:', error);
      next(error);
    }
  }

  // Create new NAMASTE code
  async createCode(req, res, next) {
    try {
      const { 
        code, 
        display_name, 
        definition, 
        system_type, 
        category,
        synonyms = [],
        parent_code,
        level = 0,
        metadata = {}
      } = req.body;

      // Validation
      if (!code || !display_name || !system_type) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'code, display_name, and system_type are required'
        });
      }

      if (!['ayurveda', 'siddha', 'unani'].includes(system_type)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'system_type must be one of: ayurveda, siddha, unani'
        });
      }

      // Check if code already exists
      const existingCode = await NamesteCode.findOne({ 
        where: { code } 
      });

      if (existingCode) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'NAMASTE code already exists'
        });
      }

      // Validate parent code if provided
      if (parent_code) {
        const parentExists = await NamesteCode.findOne({
          where: { code: parent_code, status: 'active' }
        });

        if (!parentExists) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Parent code not found'
          });
        }
      }

      // Create new NAMASTE code
      const newCode = await NamesteCode.create({
        code,
        display_name,
        definition,
        system_type,
        category,
        synonyms: Array.isArray(synonyms) ? synonyms : [],
        parent_code,
        level: parseInt(level),
        status: 'active',
        version: '1.0',
        metadata
      });

      // Log creation
      await auditService.logAction({
        user_id: req.user.id,
        action: 'NAMASTE_CODE_CREATED',
        resource_type: 'namaste_code',
        resource_id: code,
        new_values: {
          code,
          display_name,
          system_type,
          category
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.status(201).json({
        message: 'NAMASTE code created successfully',
        code: newCode
      });

    } catch (error) {
      logger.error('Create NAMASTE code error:', error);
      next(error);
    }
  }

  // Update existing NAMASTE code
  async updateCode(req, res, next) {
    try {
      const { code } = req.params;
      const { 
        display_name, 
        definition, 
        category,
        synonyms,
        status,
        metadata
      } = req.body;

      const namasteCode = await NamesteCode.findOne({
        where: { code }
      });

      if (!namasteCode) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'NAMASTE code not found'
        });
      }

      // Store old values for audit
      const oldValues = {
        display_name: namasteCode.display_name,
        definition: namasteCode.definition,
        category: namasteCode.category,
        synonyms: namasteCode.synonyms,
        status: namasteCode.status,
        metadata: namasteCode.metadata
      };

      // Update fields
      const updatedFields = {};
      if (display_name !== undefined) updatedFields.display_name = display_name;
      if (definition !== undefined) updatedFields.definition = definition;
      if (category !== undefined) updatedFields.category = category;
      if (synonyms !== undefined) updatedFields.synonyms = Array.isArray(synonyms) ? synonyms : [];
      if (status !== undefined) updatedFields.status = status;
      if (metadata !== undefined) updatedFields.metadata = metadata;

      await namasteCode.update(updatedFields);

      // Log update
      await auditService.logAction({
        user_id: req.user.id,
        action: 'NAMASTE_CODE_UPDATED',
        resource_type: 'namaste_code',
        resource_id: code,
        old_values: oldValues,
        new_values: updatedFields,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({
        message: 'NAMASTE code updated successfully',
        code: namasteCode
      });

    } catch (error) {
      logger.error('Update NAMASTE code error:', error);
      next(error);
    }
  }

  // Get NAMASTE code statistics
  async getStatistics(req, res, next) {
    try {
      const totalCodes = await NamesteCode.count({ 
        where: { status: 'active' } 
      });

      const systemStats = await NamesteCode.findAll({
        attributes: [
          'system_type',
          [NamesteCode.sequelize.fn('COUNT', NamesteCode.sequelize.col('id')), 'count']
        ],
        where: { status: 'active' },
        group: ['system_type'],
        raw: true
      });

      const categoryStats = await NamesteCode.findAll({
        attributes: [
          'category',
          [NamesteCode.sequelize.fn('COUNT', NamesteCode.sequelize.col('id')), 'count']
        ],
        where: { 
          status: 'active',
          category: { [Op.not]: null }
        },
        group: ['category'],
        order: [[NamesteCode.sequelize.fn('COUNT', NamesteCode.sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true
      });

      const levelStats = await NamesteCode.findAll({
        attributes: [
          'level',
          [NamesteCode.sequelize.fn('COUNT', NamesteCode.sequelize.col('id')), 'count']
        ],
        where: { status: 'active' },
        group: ['level'],
        raw: true
      });

      res.json({
        total_codes: totalCodes,
        by_system: systemStats.reduce((acc, item) => {
          acc[item.system_type] = parseInt(item.count);
          return acc;
        }, {}),
        by_category: categoryStats.reduce((acc, item) => {
          acc[item.category] = parseInt(item.count);
          return acc;
        }, {}),
        by_level: levelStats.reduce((acc, item) => {
          acc[`level_${item.level}`] = parseInt(item.count);
          return acc;
        }, {}),
        last_updated: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get NAMASTE statistics error:', error);
      next(error);
    }
  }

  // Search NAMASTE codes
  async searchCodes(req, res, next) {
    try {
      const { 
        q, 
        system_type, 
        category,
        limit = 20, 
        offset = 0,
        include_synonyms = true
      } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Search query must be at least 2 characters'
        });
      }

      const searchTerms = q.toLowerCase().split(/\s+/);
      const whereClause = {
        [Op.and]: [
          {
            [Op.or]: searchTerms.map(term => ({
              [Op.or]: [
                { display_name: { [Op.like]: `%${term}%` } },
                { definition: { [Op.like]: `%${term}%` } },
                { code: { [Op.like]: `%${term}%` } }
              ]
            }))
          },
          { status: 'active' }
        ]
      };

      if (system_type && ['ayurveda', 'siddha', 'unani'].includes(system_type)) {
        whereClause[Op.and].push({ system_type });
      }

      if (category) {
        whereClause[Op.and].push({ category });
      }

      const results = await NamesteCode.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [
          // Exact matches first
          [NamesteCode.sequelize.literal(`CASE WHEN display_name = '${q}' THEN 0 ELSE 1 END`), 'ASC'],
          // Then by relevance
          [NamesteCode.sequelize.literal(`CASE WHEN display_name LIKE '${q}%' THEN 0 ELSE 1 END`), 'ASC'],
          ['display_name', 'ASC']
        ]
      });

      res.json({
        query: q,
        filters: { system_type, category },
        total: results.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        results: results.rows.map(code => ({
          id: code.id,
          code: code.code,
          display_name: code.display_name,
          definition: code.definition,
          system_type: code.system_type,
          category: code.category,
          synonyms: code.synonyms,
          relevance_score: this.calculateRelevanceScore(q, code.display_name)
        }))
      });

    } catch (error) {
      logger.error('Search NAMASTE codes error:', error);
      next(error);
    }
  }

  // Import NAMASTE codes from CSV
  async importCodes(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin role required for import operations'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'CSV file is required'
        });
      }

      // Process CSV import (simplified implementation)
      const csvData = req.file.buffer.toString();
      const lines = csvData.split('\n').slice(1); // Skip header
      
      let imported = 0;
      let errors = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const [code, display_name, definition, system_type, category] = line.split(',').map(s => s.trim().replace(/"/g, ''));
          
          if (!code || !display_name || !system_type) {
            errors.push(`Invalid data in line: ${line}`);
            continue;
          }

          const existingCode = await NamesteCode.findOne({ where: { code } });
          if (existingCode) {
            errors.push(`Code already exists: ${code}`);
            continue;
          }

          await NamesteCode.create({
            code,
            display_name,
            definition,
            system_type,
            category,
            status: 'active',
            version: '1.0'
          });

          imported++;
        } catch (error) {
          errors.push(`Error processing line: ${line} - ${error.message}`);
        }
      }

      // Log import
      await auditService.logAction({
        user_id: req.user.id,
        action: 'NAMASTE_CODES_IMPORTED',
        resource_type: 'namaste_code',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        additional_info: {
          imported_count: imported,
          error_count: errors.length,
          filename: req.file.originalname
        }
      });

      res.json({
        message: 'Import completed',
        imported_count: imported,
        error_count: errors.length,
        errors: errors.slice(0, 10) // Limit error details
      });

    } catch (error) {
      logger.error('Import NAMASTE codes error:', error);
      next(error);
    }
  }

  // Helper method to calculate relevance score
  calculateRelevanceScore(query, text) {
    if (!query || !text) return 0;
    
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (textLower === queryLower) return 1.0;
    if (textLower.startsWith(queryLower)) return 0.9;
    if (textLower.includes(queryLower)) return 0.7;
    
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const matchingWords = queryWords.filter(word => 
      textWords.some(textWord => textWord.includes(word))
    );
    
    return Math.max(0.3, matchingWords.length / queryWords.length * 0.6);
  }
}

module.exports = new NamasteController();
