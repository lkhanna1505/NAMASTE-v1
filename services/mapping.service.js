const { CodeMapping, NamesteCode, ICD11Code } = require('../models');
const { Op } = require('sequelize');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

class MappingService {
  async createMapping(namasteCode, icd11Code, mappingType = 'equivalent', userId = null) {
    try {
      // Verify codes exist
      const namaste = await NamesteCode.findOne({
        where: { code: namasteCode, status: 'active' }
      });
      
      const icd11 = await ICD11Code.findOne({
        where: {
          [Op.or]: [
            { icd_id: icd11Code },
            { code: icd11Code }
          ],
          status: 'active'
        }
      });

      if (!namaste || !icd11) {
        throw new Error('Source or target code not found');
      }

      // Calculate confidence score
      const confidenceScore = helpers.calculateMappingConfidence(
        namaste.display_name,
        icd11.title
      );

      // Create mapping
      const mapping = await CodeMapping.create({
        namaste_code: namasteCode,
        icd11_code: icd11.icd_id,
        mapping_type: mappingType,
        confidence_score: confidenceScore,
        verified_by: userId,
        verified_at: userId ? new Date() : null,
        is_active: true
      });

      return mapping;
    } catch (error) {
      logger.error('Failed to create mapping:', error);
      throw error;
    }
  }

  async findSuggestedMappings(namasteCode, limit = 5) {
    try {
      const namasteEntity = await NamesteCode.findOne({
        where: { code: namasteCode, status: 'active' }
      });

      if (!namasteEntity) {
        throw new Error('NAMASTE code not found');
      }

      // Search for similar ICD-11 codes
      const searchTerms = namasteEntity.display_name
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2);

      const suggestions = await ICD11Code.findAll({
        where: {
          [Op.or]: searchTerms.map(term => ({
            title: { [Op.like]: `%${term}%` }
          })),
          module: 'tm2',
          status: 'active'
        },
        limit,
        order: [['title', 'ASC']]
      });

      return suggestions.map(suggestion => ({
        icd11_code: suggestion.icd_id,
        icd11_title: suggestion.title,
        confidence_score: helpers.calculateMappingConfidence(
          namasteEntity.display_name,
          suggestion.title
        ),
        suggested_mapping_type: this.suggestMappingType(
          namasteEntity.display_name,
          suggestion.title
        )
      }));
    } catch (error) {
      logger.error('Failed to find suggested mappings:', error);
      throw error;
    }
  }

  suggestMappingType(sourceDisplay, targetDisplay) {
    const source = sourceDisplay.toLowerCase();
    const target = targetDisplay.toLowerCase();

    // Exact or very similar
    if (source === target || source.includes(target) || target.includes(source)) {
      return 'equivalent';
    }

    // Source is more specific
    if (source.split(' ').length > target.split(' ').length) {
      return 'narrower';
    }

    // Target is more specific
    if (target.split(' ').length > source.split(' ').length) {
      return 'broader';
    }

    return 'related';
  }

  async validateMapping(mappingId) {
    try {
      const mapping = await CodeMapping.findByPk(mappingId, {
        include: [
          { association: 'namasteCodeDetails' },
          { association: 'icd11CodeDetails' }
        ]
      });

      if (!mapping) {
        throw new Error('Mapping not found');
      }

      const validation = {
        mapping_id: mappingId,
        is_valid: true,
        confidence_score: parseFloat(mapping.confidence_score),
        issues: []
      };

      // Check if codes still exist and are active
      if (!mapping.namasteCodeDetails || mapping.namasteCodeDetails.status !== 'active') {
        validation.is_valid = false;
        validation.issues.push('NAMASTE code is inactive or not found');
      }

      if (!mapping.icd11CodeDetails || mapping.icd11CodeDetails.status !== 'active') {
        validation.is_valid = false;
        validation.issues.push('ICD-11 code is inactive or not found');
      }

      // Check mapping type consistency
      const recalculatedConfidence = helpers.calculateMappingConfidence(
        mapping.namasteCodeDetails?.display_name || '',
        mapping.icd11CodeDetails?.title || ''
      );

      if (Math.abs(recalculatedConfidence - mapping.confidence_score) > 0.3) {
        validation.issues.push('Confidence score may need recalculation');
      }

      return validation;
    } catch (error) {
      logger.error('Failed to validate mapping:', error);
      throw error;
    }
  }

  async getMappingStatistics() {
    try {
      const stats = await CodeMapping.findAll({
        attributes: [
          [CodeMapping.sequelize.fn('COUNT', CodeMapping.sequelize.col('id')), 'total_mappings'],
          [CodeMapping.sequelize.fn('COUNT', CodeMapping.sequelize.literal('CASE WHEN verified_by IS NOT NULL THEN 1 END')), 'verified_mappings'],
          [CodeMapping.sequelize.fn('AVG', CodeMapping.sequelize.col('confidence_score')), 'avg_confidence'],
          [CodeMapping.sequelize.fn('MIN', CodeMapping.sequelize.col('confidence_score')), 'min_confidence'],
          [CodeMapping.sequelize.fn('MAX', CodeMapping.sequelize.col('confidence_score')), 'max_confidence']
        ],
        where: { is_active: true },
        raw: true
      });

      const typeStats = await CodeMapping.findAll({
        attributes: [
          'mapping_type',
          [CodeMapping.sequelize.fn('COUNT', CodeMapping.sequelize.col('id')), 'count']
        ],
        where: { is_active: true },
        group: ['mapping_type'],
        raw: true
      });

      const systemStats = await CodeMapping.findAll({
        attributes: [
          [CodeMapping.sequelize.literal('namasteCodeDetails.system_type'), 'system_type'],
          [CodeMapping.sequelize.fn('COUNT', CodeMapping.sequelize.col('CodeMapping.id')), 'count']
        ],
        include: [{
          association: 'namasteCodeDetails',
          attributes: []
        }],
        where: { is_active: true },
        group: ['namasteCodeDetails.system_type'],
        raw: true
      });

      return {
        total: {
          mappings: parseInt(stats[0]?.total_mappings || 0),
          verified: parseInt(stats[0]?.verified_mappings || 0),
          avg_confidence: parseFloat(stats[0]?.avg_confidence || 0).toFixed(2),
          min_confidence: parseFloat(stats[0]?.min_confidence || 0),
          max_confidence: parseFloat(stats[0]?.max_confidence || 0)
        },
        by_type: typeStats.reduce((acc, item) => {
          acc[item.mapping_type] = parseInt(item.count);
          return acc;
        }, {}),
        by_system: systemStats.reduce((acc, item) => {
          acc[item.system_type] = parseInt(item.count);
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Failed to get mapping statistics:', error);
      throw error;
    }
  }

  async exportMappings(format = 'json', filters = {}) {
    try {
      const whereClause = { is_active: true };
      
      if (filters.system_type) {
        whereClause['$namasteCodeDetails.system_type$'] = filters.system_type;
      }
      
      if (filters.mapping_type) {
        whereClause.mapping_type = filters.mapping_type;
      }
      
      if (filters.verified_only) {
        whereClause.verified_by = { [Op.not]: null };
      }

      const mappings = await CodeMapping.findAll({
        where: whereClause,
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
        ],
        order: [['created_at', 'DESC']]
      });

      if (format === 'csv') {
        return this.convertToCSV(mappings);
      }

      return mappings.map(mapping => ({
        id: mapping.id,
        namaste: {
          code: mapping.namasteCodeDetails.code,
          display: mapping.namasteCodeDetails.display_name,
          definition: mapping.namasteCodeDetails.definition,
          system_type: mapping.namasteCodeDetails.system_type,
          category: mapping.namasteCodeDetails.category
        },
        icd11: {
          id: mapping.icd11CodeDetails.icd_id,
          code: mapping.icd11CodeDetails.code,
          title: mapping.icd11CodeDetails.title,
          definition: mapping.icd11CodeDetails.definition,
          module: mapping.icd11CodeDetails.module
        },
        mapping: {
          type: mapping.mapping_type,
          confidence_score: parseFloat(mapping.confidence_score),
          notes: mapping.notes,
          verified_by: mapping.verifier?.name,
          verified_at: mapping.verified_at,
          created_at: mapping.created_at
        }
      }));
    } catch (error) {
      logger.error('Failed to export mappings:', error);
      throw error;
    }
  }

  convertToCSV(mappings) {
    const headers = [
      'NAMASTE_Code',
      'NAMASTE_Display',
      'NAMASTE_System',
      'ICD11_ID',
      'ICD11_Title',
      'Mapping_Type',
      'Confidence_Score',
      'Verified_By',
      'Verified_At',
      'Notes'
    ];

    const rows = mappings.map(mapping => [
      mapping.namasteCodeDetails.code,
      `"${mapping.namasteCodeDetails.display_name}"`,
      mapping.namasteCodeDetails.system_type,
      mapping.icd11CodeDetails.icd_id,
      `"${mapping.icd11CodeDetails.title}"`,
      mapping.mapping_type,
      mapping.confidence_score,
      mapping.verifier?.name || '',
      mapping.verified_at || '',
      `"${mapping.notes || ''}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

module.exports = new MappingService();
