const icd11Service = require('../services/icd11.service');
const { ICD11Code } = require('../models');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class ICD11Controller {
  // Get ICD-11 TM2 code details
  async getTm2Code(req, res, next) {
    try {
      const { code } = req.params;
      
      if (!code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Code parameter is required'
        });
      }

      // First try to get from local database
      let icd11Code = await ICD11Code.findOne({
        where: {
          [Op.or]: [
            { icd_id: code },
            { code: code }
          ],
          module: 'tm2',
          status: 'active'
        }
      });

      // If not found locally, try WHO API
      if (!icd11Code) {
        try {
          const whoData = await icd11Service.getEntityDetails(code);
          if (whoData) {
            // Store in local database for future use
            icd11Code = await ICD11Code.create({
              icd_id: whoData.id || code,
              code: whoData.code,
              title: whoData.title?.['@value'] || whoData.title || 'Unknown',
              definition: whoData.definition?.['@value'] || whoData.definition,
              module: 'tm2',
              who_metadata: whoData,
              status: 'active'
            });
          }
        } catch (whoError) {
          logger.warn('WHO API fetch failed:', whoError.message);
        }
      }

      if (!icd11Code) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'ICD-11 TM2 code not found'
        });
      }

      // Log access
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'ICD11_TM2_ACCESS',
          resource_type: 'icd11_code',
          resource_id: code,
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      res.json({
        id: icd11Code.id,
        icd_id: icd11Code.icd_id,
        code: icd11Code.code,
        title: icd11Code.title,
        definition: icd11Code.definition,
        module: icd11Code.module,
        parent_id: icd11Code.parent_id,
        level: icd11Code.level,
        synonyms: icd11Code.synonyms,
        status: icd11Code.status,
        last_sync: icd11Code.last_sync,
        who_metadata: icd11Code.who_metadata
      });

    } catch (error) {
      logger.error('Get TM2 code error:', error);
      next(error);
    }
  }

  // Get ICD-11 biomedicine code details  
  async getBiomedicineCode(req, res, next) {
    try {
      const { code } = req.params;

      const icd11Code = await ICD11Code.findOne({
        where: {
          [Op.or]: [
            { icd_id: code },
            { code: code }
          ],
          module: 'biomedicine',
          status: 'active'
        }
      });

      if (!icd11Code) {
        // Try WHO API for biomedicine codes
        try {
          const whoData = await icd11Service.getEntityDetails(code);
          if (whoData && !whoData.title?.includes('Traditional')) {
            const newCode = await ICD11Code.create({
              icd_id: whoData.id || code,
              code: whoData.code,
              title: whoData.title?.['@value'] || whoData.title || 'Unknown',
              definition: whoData.definition?.['@value'] || whoData.definition,
              module: 'biomedicine',
              who_metadata: whoData,
              status: 'active'
            });
            
            return res.json(newCode);
          }
        } catch (whoError) {
          logger.warn('WHO API fetch failed:', whoError.message);
        }

        return res.status(404).json({
          error: 'Not Found',
          message: 'ICD-11 biomedicine code not found'
        });
      }

      res.json(icd11Code);

    } catch (error) {
      logger.error('Get biomedicine code error:', error);
      next(error);
    }
  }

  // Sync with WHO ICD-11 API
  async syncWithWho(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin role required for sync operations'
        });
      }

      const { module = 'tm2', force = false } = req.body;

      // Check if sync is already running
      const lastSync = await ICD11Code.findOne({
        where: { module },
        order: [['last_sync', 'DESC']]
      });

      if (lastSync && !force) {
        const timeSinceLastSync = Date.now() - new Date(lastSync.last_sync).getTime();
        const hoursSinceLastSync = timeSinceLastSync / (1000 * 60 * 60);
        
        if (hoursSinceLastSync < 24) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Sync was performed less than 24 hours ago. Use force=true to override.',
            last_sync: lastSync.last_sync
          });
        }
      }

      // Start sync process (this should be done asynchronously in production)
      const syncResult = await icd11Service.syncTM2Module();

      // Log sync operation
      await auditService.logAction({
        user_id: req.user.id,
        action: 'ICD11_SYNC',
        resource_type: 'icd11_sync',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        additional_info: {
          module,
          force,
          synced_count: syncResult.synced
        }
      });

      res.json({
        message: 'ICD-11 sync completed successfully',
        module,
        synced_entities: syncResult.synced,
        total_entities: syncResult.total,
        sync_date: new Date().toISOString()
      });

    } catch (error) {
      logger.error('WHO sync error:', error);
      next(error);
    }
  }

  // Batch lookup ICD-11 codes
  async batchLookup(req, res, next) {
    try {
      const { codes, module } = req.body;

      if (!codes || !Array.isArray(codes)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'codes array is required'
        });
      }

      if (codes.length > 100) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Maximum 100 codes allowed per batch request'
        });
      }

      const whereClause = {
        [Op.or]: [
          { icd_id: { [Op.in]: codes } },
          { code: { [Op.in]: codes } }
        ],
        status: 'active'
      };

      if (module) {
        whereClause.module = module;
      }

      const results = await ICD11Code.findAll({
        where: whereClause,
        attributes: [
          'id', 'icd_id', 'code', 'title', 'definition', 
          'module', 'parent_id', 'level', 'status'
        ]
      });

      // Create response map
      const responseMap = {};
      const foundCodes = new Set();

      results.forEach(result => {
        const key = result.icd_id;
        responseMap[key] = result;
        foundCodes.add(result.icd_id);
        
        if (result.code && result.code !== result.icd_id) {
          responseMap[result.code] = result;
          foundCodes.add(result.code);
        }
      });

      // Identify missing codes
      const missingCodes = codes.filter(code => !foundCodes.has(code));

      // Log batch lookup
      if (req.user) {
        await auditService.logAction({
          user_id: req.user.id,
          action: 'ICD11_BATCH_LOOKUP',
          resource_type: 'icd11_code',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: {
            requested_count: codes.length,
            found_count: results.length,
            missing_count: missingCodes.length
          }
        });
      }

      res.json({
        requested_codes: codes,
        found_count: results.length,
        missing_count: missingCodes.length,
        missing_codes: missingCodes,
        results: responseMap
      });

    } catch (error) {
      logger.error('Batch lookup error:', error);
      next(error);
    }
  }

  // Search ICD-11 codes
  async searchCodes(req, res, next) {
    try {
      const { 
        q, 
        module = 'tm2', 
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
                { title: { [Op.like]: `%${term}%` } },
                { definition: { [Op.like]: `%${term}%` } },
                { code: { [Op.like]: `%${term}%` } }
              ]
            }))
          },
          { module },
          { status: 'active' }
        ]
      };

      const results = await ICD11Code.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [
          // Exact matches first
          [Op.literal(`CASE WHEN title = '${q}' THEN 0 ELSE 1 END`), 'ASC'],
          // Then by relevance
          [Op.literal(`CASE WHEN title LIKE '${q}%' THEN 0 ELSE 1 END`), 'ASC'],
          ['title', 'ASC']
        ]
      });

      res.json({
        query: q,
        module,
        total: results.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        results: results.rows.map(code => ({
          id: code.id,
          icd_id: code.icd_id,
          code: code.code,
          title: code.title,
          definition: code.definition,
          module: code.module,
          relevance_score: this.calculateRelevanceScore(q, code.title)
        }))
      });

    } catch (error) {
      logger.error('Search ICD-11 codes error:', error);
      next(error);
    }
  }

  // Get ICD-11 statistics
  async getStatistics(req, res, next) {
    try {
      const totalCodes = await ICD11Code.count({ 
        where: { status: 'active' } 
      });

      const moduleStats = await ICD11Code.findAll({
        attributes: [
          'module',
          [ICD11Code.sequelize.fn('COUNT', ICD11Code.sequelize.col('id')), 'count']
        ],
        where: { status: 'active' },
        group: ['module'],
        raw: true
      });

      const recentSync = await ICD11Code.findOne({
        where: { status: 'active' },
        order: [['last_sync', 'DESC']],
        attributes: ['last_sync', 'module']
      });

      res.json({
        total_codes: totalCodes,
        by_module: moduleStats.reduce((acc, item) => {
          acc[item.module] = parseInt(item.count);
          return acc;
        }, {}),
        last_sync: recentSync ? {
          date: recentSync.last_sync,
          module: recentSync.module
        } : null,
        sync_status: 'active'
      });

    } catch (error) {
      logger.error('Get ICD-11 statistics error:', error);
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

module.exports = new ICD11Controller();
