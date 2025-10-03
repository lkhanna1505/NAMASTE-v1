const { NamesteCode, CodeMapping, ICD11Code } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class NamasteService {
  // Get all NAMASTE codes with optional filtering
  async getAll(filters = {}) {
    try {
      const {
        system_type = null,
        category = null,
        status = 'active',
        level = null,
        parent_code = null,
        include_synonyms = true,
        limit = 100,
        offset = 0
      } = filters;

      const whereClause = { status };
      
      if (system_type && ['ayurveda', 'siddha', 'unani'].includes(system_type)) {
        whereClause.system_type = system_type;
      }
      
      if (category) {
        whereClause.category = category;
      }

      if (level !== null) {
        whereClause.level = parseInt(level);
      }

      if (parent_code) {
        whereClause.parent_code = parent_code;
      }

      const attributes = [
        'id', 'code', 'display_name', 'definition', 
        'system_type', 'category', 'parent_code', 'level', 
        'status', 'version', 'created_at'
      ];

      if (include_synonyms) {
        attributes.push('synonyms');
      }

      const result = await NamesteCode.findAndCountAll({
        where: whereClause,
        attributes,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['system_type', 'ASC'], ['display_name', 'ASC']]
      });

      return {
        total: result.count,
        codes: result.rows
      };

    } catch (error) {
      logger.error('Get all NAMASTE codes error:', error);
      throw error;
    }
  }

  // Get NAMASTE code by code
  async getByCode(code, options = {}) {
    try {
      const {
        include_mappings = false,
        include_hierarchy = false,
        include_synonyms = true
      } = options;

      const whereClause = { code, status: 'active' };
      
      const attributes = [
        'id', 'code', 'display_name', 'definition',
        'system_type', 'category', 'parent_code', 'level',
        'status', 'version', 'metadata', 'created_at', 'updated_at'
      ];

      if (include_synonyms) {
        attributes.push('synonyms');
      }

      const namasteCode = await NamesteCode.findOne({
        where: whereClause,
        attributes
      });

      if (!namasteCode) {
        return null;
      }

      const result = namasteCode.toJSON();

      // Include mappings if requested
      if (include_mappings) {
        result.mappings = await this.getCodeMappings(code);
      }

      // Include hierarchy if requested
      if (include_hierarchy) {
        result.hierarchy = await this.getCodeHierarchy(code);
      }

      return result;

    } catch (error) {
      logger.error('Get NAMASTE code by code error:', error);
      throw error;
    }
  }

  // Get NAMASTE codes by system type
  async getBySystemType(systemType, options = {}) {
    try {
      if (!['ayurveda', 'siddha', 'unani'].includes(systemType)) {
        throw new Error('Invalid system type');
      }

      return this.getAll({
        ...options,
        system_type: systemType
      });

    } catch (error) {
      logger.error('Get NAMASTE codes by system type error:', error);
      throw error;
    }
  }

  // Search NAMASTE codes
  async search(query, options = {}) {
    try {
      const {
        system_type = null,
        category = null,
        limit = 20,
        offset = 0,
        include_synonyms = true,
        fuzzy_search = true
      } = options;

      if (!query || query.length < 2) {
        throw new Error('Search query must be at least 2 characters');
      }

      const searchTerms = query.toLowerCase().split(/\s+/);
      const whereClause = {
        [Op.and]: [
          { status: 'active' }
        ]
      };

      // Build search conditions
      const searchConditions = [];
      
      searchTerms.forEach(term => {
        const termConditions = [
          { display_name: { [Op.like]: `%${term}%` } },
          { code: { [Op.like]: `%${term}%` } },
          { definition: { [Op.like]: `%${term}%` } }
        ];

        if (include_synonyms && fuzzy_search) {
          // Search in synonyms JSON array (MySQL/MariaDB specific)
          termConditions.push({
            synonyms: { [Op.like]: `%${term}%` }
          });
        }

        searchConditions.push({
          [Op.or]: termConditions
        });
      });

      whereClause[Op.and].push({
        [Op.and]: searchConditions
      });

      // Apply filters
      if (system_type) {
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
          [NamesteCode.sequelize.literal(`CASE WHEN display_name = '${query}' THEN 0 ELSE 1 END`), 'ASC'],
          // Then by starts with
          [NamesteCode.sequelize.literal(`CASE WHEN display_name LIKE '${query}%' THEN 0 ELSE 1 END`), 'ASC'],
          // Then by relevance
          ['display_name', 'ASC']
        ]
      });

      // Calculate relevance scores
      const resultsWithScore = results.rows.map(code => ({
        ...code.toJSON(),
        relevance_score: this.calculateRelevanceScore(query, code.display_name)
      }));

      return {
        query,
        total: results.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        results: resultsWithScore
      };

    } catch (error) {
      logger.error('Search NAMASTE codes error:', error);
      throw error;
    }
  }

  // Get code mappings
  async getCodeMappings(namasteCode) {
    try {
      const mappings = await CodeMapping.findAll({
        where: {
          namaste_code: namasteCode,
          is_active: true
        },
        include: [{
          association: 'icd11CodeDetails',
          attributes: ['icd_id', 'code', 'title', 'definition', 'module']
        }],
        attributes: [
          'id', 'icd11_code', 'mapping_type', 'confidence_score',
          'notes', 'verified_by', 'verified_at', 'created_at'
        ]
      });

      return mappings.map(mapping => ({
        id: mapping.id,
        icd11_code: mapping.icd11_code,
        icd11_title: mapping.icd11CodeDetails?.title,
        icd11_definition: mapping.icd11CodeDetails?.definition,
        icd11_module: mapping.icd11CodeDetails?.module,
        mapping_type: mapping.mapping_type,
        confidence_score: parseFloat(mapping.confidence_score),
        notes: mapping.notes,
        verified: !!mapping.verified_by,
        verified_at: mapping.verified_at,
        created_at: mapping.created_at
      }));

    } catch (error) {
      logger.error('Get code mappings error:', error);
      throw error;
    }
  }

  // Get code hierarchy (parent and children)
  async getCodeHierarchy(namasteCode) {
    try {
      const code = await NamesteCode.findOne({
        where: { code: namasteCode, status: 'active' }
      });

      if (!code) {
        return null;
      }

      const hierarchy = {
        current: code,
        parent: null,
        children: [],
        siblings: [],
        ancestors: [],
        descendants: []
      };

      // Get parent
      if (code.parent_code) {
        hierarchy.parent = await NamesteCode.findOne({
          where: { code: code.parent_code, status: 'active' }
        });

        // Get siblings (codes with same parent)
        hierarchy.siblings = await NamesteCode.findAll({
          where: {
            parent_code: code.parent_code,
            code: { [Op.ne]: namasteCode },
            status: 'active'
          },
          order: [['display_name', 'ASC']]
        });
      }

      // Get children
      hierarchy.children = await NamesteCode.findAll({
        where: {
          parent_code: namasteCode,
          status: 'active'
        },
        order: [['display_name', 'ASC']]
      });

      // Get ancestors (all parent codes up the hierarchy)
      hierarchy.ancestors = await this.getAncestors(code);

      // Get descendants (all child codes down the hierarchy)
      hierarchy.descendants = await this.getDescendants(namasteCode);

      return hierarchy;

    } catch (error) {
      logger.error('Get code hierarchy error:', error);
      throw error;
    }
  }

  // Get all ancestors of a code
  async getAncestors(code, ancestors = []) {
    if (!code.parent_code) {
      return ancestors;
    }

    const parent = await NamesteCode.findOne({
      where: { code: code.parent_code, status: 'active' }
    });

    if (parent) {
      ancestors.unshift(parent);
      return this.getAncestors(parent, ancestors);
    }

    return ancestors;
  }

  // Get all descendants of a code
  async getDescendants(namasteCode, descendants = []) {
    const children = await NamesteCode.findAll({
      where: {
        parent_code: namasteCode,
        status: 'active'
      }
    });

    for (const child of children) {
      descendants.push(child);
      await this.getDescendants(child.code, descendants);
    }

    return descendants;
  }

  // Get statistics
  async getStatistics() {
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

      // Mapping statistics
      const totalMappings = await CodeMapping.count({
        where: { is_active: true }
      });

      const mappedCodes = await CodeMapping.count({
        distinct: true,
        col: 'namaste_code',
        where: { is_active: true }
      });

      const mappingPercentage = totalCodes > 0 ? ((mappedCodes / totalCodes) * 100).toFixed(1) : 0;

      return {
        total_codes: totalCodes,
        mapped_codes: mappedCodes,
        unmapped_codes: totalCodes - mappedCodes,
        mapping_percentage: parseFloat(mappingPercentage),
        total_mappings: totalMappings,
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
      };

    } catch (error) {
      logger.error('Get NAMASTE statistics error:', error);
      throw error;
    }
  }

  // Validate code structure
  async validateCode(codeData) {
    const errors = [];

    // Required fields
    if (!codeData.code) errors.push('Code is required');
    if (!codeData.display_name) errors.push('Display name is required');
    if (!codeData.system_type) errors.push('System type is required');

    // System type validation
    if (codeData.system_type && !['ayurveda', 'siddha', 'unani'].includes(codeData.system_type)) {
      errors.push('System type must be one of: ayurveda, siddha, unani');
    }

    // Code format validation (example pattern)
    if (codeData.code && !/^[A-Z]{3}[0-9]{3,6}$/.test(codeData.code)) {
      errors.push('Code must follow pattern: 3 letters followed by 3-6 digits (e.g., NAM001)');
    }

    // Parent code validation
    if (codeData.parent_code) {
      const parentExists = await NamesteCode.findOne({
        where: { code: codeData.parent_code, status: 'active' }
      });
      if (!parentExists) {
        errors.push('Parent code does not exist');
      }
    }

    // Check for duplicate code
    if (codeData.code) {
      const existingCode = await NamesteCode.findOne({
        where: { code: codeData.code }
      });
      if (existingCode) {
        errors.push('Code already exists');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Calculate relevance score for search results
  calculateRelevanceScore(query, text) {
    if (!query || !text) return 0;
    
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match
    if (textLower === queryLower) return 1.0;
    
    // Starts with query
    if (textLower.startsWith(queryLower)) return 0.9;
    
    // Contains query as whole word
    const regex = new RegExp(`\\b${queryLower}\\b`, 'i');
    if (regex.test(textLower)) return 0.8;
    
    // Contains query
    if (textLower.includes(queryLower)) return 0.7;
    
    // Word matches
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const matchingWords = queryWords.filter(word => 
      textWords.some(textWord => textWord.includes(word))
    );
    
    return Math.max(0.3, (matchingWords.length / queryWords.length) * 0.6);
  }

  // Get autocomplete suggestions
  async getAutocompleteSuggestions(query, limit = 10, systemType = null) {
    try {
      if (!query || query.length < 2) {
        return [];
      }

      const whereClause = {
        display_name: { [Op.like]: `${query}%` },
        status: 'active'
      };

      if (systemType) {
        whereClause.system_type = systemType;
      }

      const suggestions = await NamesteCode.findAll({
        where: whereClause,
        attributes: ['code', 'display_name', 'system_type', 'category'],
        limit: parseInt(limit),
        order: [['display_name', 'ASC']]
      });

      return suggestions.map(code => ({
        code: code.code,
        display: code.display_name,
        system_type: code.system_type,
        category: code.category
      }));

    } catch (error) {
      logger.error('Get autocomplete suggestions error:', error);
      throw error;
    }
  }

  // Import codes from array
  async importCodes(codesArray, options = {}) {
    try {
      const { validate = true, skip_duplicates = true } = options;
      
      let imported = 0;
      let skipped = 0;
      let errors = [];

      for (const codeData of codesArray) {
        try {
          // Validate if requested
          if (validate) {
            const validation = await this.validateCode(codeData);
            if (!validation.valid) {
              errors.push({
                code: codeData.code,
                errors: validation.errors
              });
              continue;
            }
          }

          // Check for duplicates
          if (skip_duplicates) {
            const existing = await NamesteCode.findOne({
              where: { code: codeData.code }
            });
            if (existing) {
              skipped++;
              continue;
            }
          }

          // Create the code
          await NamesteCode.create({
            ...codeData,
            status: 'active',
            version: codeData.version || '1.0'
          });

          imported++;

        } catch (error) {
          errors.push({
            code: codeData.code,
            error: error.message
          });
        }
      }

      return {
        imported,
        skipped,
        errors: errors.length,
        error_details: errors.slice(0, 10) // Limit error details
      };

    } catch (error) {
      logger.error('Import NAMASTE codes error:', error);
      throw error;
    }
  }
}

module.exports = new NamasteService();
