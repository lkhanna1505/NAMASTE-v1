const { NamesteCode, ICD11Code, CodeMapping } = require('../models');
const { Op } = require('sequelize');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

class SearchController {
  async globalSearch(req, res) {
    try {
      const { q, limit = 20, offset = 0, systems = 'all' } = req.query;
      
      if (!q || q.length < 2) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Search query must be at least 2 characters'
        });
      }

      const sanitizedQuery = helpers.sanitizeSearchQuery(q);
      const searchResults = {
        query: sanitizedQuery,
        total: 0,
        results: {}
      };

      // Search NAMASTE codes
      if (systems === 'all' || systems.includes('namaste')) {
        const namasteResults = await this.searchNamasteSystem(sanitizedQuery, limit / 2, offset);
        searchResults.results.namaste = namasteResults;
        searchResults.total += namasteResults.length;
      }

      // Search ICD-11 codes
      if (systems === 'all' || systems.includes('icd11')) {
        const icd11Results = await this.searchICD11System(sanitizedQuery, limit / 2, offset);
        searchResults.results.icd11 = icd11Results;
        searchResults.total += icd11Results.length;
      }

      // Add related mappings
      if (searchResults.total > 0) {
        searchResults.mappings = await this.findRelatedMappings(searchResults.results);
      }

      res.json(searchResults);
    } catch (error) {
      logger.error('Global search failed:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  async searchNamasteSystem(query, limit = 10, offset = 0) {
    const results = await NamesteCode.findAll({
      where: {
        [Op.or]: [
          { display_name: { [Op.like]: `%${query}%` } },
          { code: { [Op.like]: `%${query}%` } },
          { definition: { [Op.like]: `%${query}%` } }
        ],
        status: 'active'
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        // Exact matches first
        [Op.literal(`CASE WHEN display_name = '${query}' THEN 0 ELSE 1 END`), 'ASC'],
        // Then by relevance (starts with query)
        [Op.literal(`CASE WHEN display_name LIKE '${query}%' THEN 0 ELSE 1 END`), 'ASC'],
        ['display_name', 'ASC']
      ]
    });

    return results.map(code => ({
      system: 'namaste',
      code: code.code,
      display: code.display_name,
      definition: code.definition,
      system_type: code.system_type,
      category: code.category,
      relevance_score: this.calculateRelevanceScore(query, code.display_name)
    }));
  }

  async searchICD11System(query, limit = 10, offset = 0) {
    const results = await ICD11Code.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.like]: `%${query}%` } },
          { code: { [Op.like]: `%${query}%` } },
          { definition: { [Op.like]: `%${query}%` } }
        ],
        status: 'active'
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        [Op.literal(`CASE WHEN title = '${query}' THEN 0 ELSE 1 END`), 'ASC'],
        [Op.literal(`CASE WHEN title LIKE '${query}%' THEN 0 ELSE 1 END`), 'ASC'],
        ['title', 'ASC']
      ]
    });

    return results.map(code => ({
      system: 'icd11',
      code: code.icd_id,
      display: code.title,
      definition: code.definition,
      module: code.module,
      relevance_score: this.calculateRelevanceScore(query, code.title)
    }));
  }

  async findRelatedMappings(searchResults) {
    const mappings = { namaste_to_icd11: [], icd11_to_namaste: [] };

    // Find mappings for NAMASTE codes
    if (searchResults.namaste && searchResults.namaste.length > 0) {
      const namasteCodes = searchResults.namaste.map(r => r.code);
      const namasteToIcd11 = await CodeMapping.findAll({
        where: {
          namaste_code: { [Op.in]: namasteCodes },
          is_active: true
        },
        include: [
          { association: 'icd11CodeDetails', attributes: ['icd_id', 'title', 'module'] }
        ]
      });

      mappings.namaste_to_icd11 = namasteToIcd11.map(mapping => ({
        source_code: mapping.namaste_code,
        target_code: mapping.icd11_code,
        target_display: mapping.icd11CodeDetails.title,
        mapping_type: mapping.mapping_type,
        confidence_score: parseFloat(mapping.confidence_score)
      }));
    }

    // Find mappings for ICD-11 codes
    if (searchResults.icd11 && searchResults.icd11.length > 0) {
      const icd11Codes = searchResults.icd11.map(r => r.code);
      const icd11ToNamaste = await CodeMapping.findAll({
        where: {
          icd11_code: { [Op.in]: icd11Codes },
          is_active: true
        },
        include: [
          { association: 'namasteCodeDetails', attributes: ['code', 'display_name', 'system_type'] }
        ]
      });

      mappings.icd11_to_namaste = icd11ToNamaste.map(mapping => ({
        source_code: mapping.icd11_code,
        target_code: mapping.namaste_code,
        target_display: mapping.namasteCodeDetails.display_name,
        target_system_type: mapping.namasteCodeDetails.system_type,
        mapping_type: mapping.mapping_type,
        confidence_score: parseFloat(mapping.confidence_score)
      }));
    }

    return mappings;
  }

  calculateRelevanceScore(query, text) {
    if (!query || !text) return 0;
    
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match
    if (textLower === queryLower) return 1.0;
    
    // Starts with query
    if (textLower.startsWith(queryLower)) return 0.9;
    
    // Contains query
    if (textLower.includes(queryLower)) return 0.7;
    
    // Word matches
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const matchingWords = queryWords.filter(word => 
      textWords.some(textWord => textWord.includes(word))
    );
    
    return Math.max(0.3, matchingWords.length / queryWords.length * 0.6);
  }

  async advancedSearch(req, res) {
    try {
      const {
        q,
        system_type,
        category,
        module,
        mapping_exists,
        confidence_min,
        confidence_max,
        verified_only,
        limit = 50,
        offset = 0
      } = req.query;

      const results = {
        query: q,
        filters: {
          system_type,
          category,
          module,
          mapping_exists,
          confidence_min,
          confidence_max,
          verified_only
        },
        results: []
      };

      // Build complex query based on filters
      let baseQuery = {};
      let include = [];

      if (q) {
        baseQuery[Op.or] = [
          { display_name: { [Op.like]: `%${q}%` } },
          { code: { [Op.like]: `%${q}%` } },
          { definition: { [Op.like]: `%${q}%` } }
        ];
      }

      if (system_type) {
        baseQuery.system_type = system_type;
      }

      if (category) {
        baseQuery.category = category;
      }

      baseQuery.status = 'active';

      // Search NAMASTE codes with mappings if needed
      if (mapping_exists === 'true') {
        include.push({
          model: CodeMapping,
          as: 'mappings',
          where: { is_active: true },
          required: true,
          include: [{
            association: 'icd11CodeDetails',
            attributes: ['icd_id', 'title', 'module']
          }]
        });

        if (confidence_min || confidence_max) {
          include[0].where.confidence_score = {};
          if (confidence_min) include[0].where.confidence_score[Op.gte] = parseFloat(confidence_min);
          if (confidence_max) include[0].where.confidence_score[Op.lte] = parseFloat(confidence_max);
        }

        if (verified_only === 'true') {
          include[0].where.verified_by = { [Op.not]: null };
        }
      }

      const namasteResults = await NamesteCode.findAll({
        where: baseQuery,
        include,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['display_name', 'ASC']]
      });

      results.results = namasteResults.map(code => ({
        system: 'namaste',
        code: code.code,
        display: code.display_name,
        definition: code.definition,
        system_type: code.system_type,
        category: code.category,
        mappings: code.mappings ? code.mappings.map(mapping => ({
          icd11_code: mapping.icd11_code,
          icd11_title: mapping.icd11CodeDetails?.title,
          mapping_type: mapping.mapping_type,
          confidence_score: parseFloat(mapping.confidence_score),
          verified: !!mapping.verified_by
        })) : []
      }));

      results.total = results.results.length;
      res.json(results);
    } catch (error) {
      logger.error('Advanced search failed:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  async getSearchSuggestions(req, res) {
    try {
      const { q, system = 'all', limit = 10 } = req.query;
      
      if (!q || q.length < 2) {
        return res.json({ suggestions: [] });
      }

      const suggestions = [];

      // Get NAMASTE suggestions
      if (system === 'all' || system === 'namaste') {
        const namasteSuggestions = await NamesteCode.findAll({
          where: {
            display_name: { [Op.like]: `${q}%` },
            status: 'active'
          },
          attributes: ['code', 'display_name', 'system_type'],
          limit: Math.ceil(limit / 2),
          order: [['display_name', 'ASC']]
        });

        suggestions.push(...namasteSuggestions.map(s => ({
          system: 'namaste',
          code: s.code,
          display: s.display_name,
          system_type: s.system_type,
          type: 'exact_match'
        })));
      }

      // Get ICD-11 suggestions
      if (system === 'all' || system === 'icd11') {
        const icd11Suggestions = await ICD11Code.findAll({
          where: {
            title: { [Op.like]: `${q}%` },
            status: 'active'
          },
          attributes: ['icd_id', 'title', 'module'],
          limit: Math.ceil(limit / 2),
          order: [['title', 'ASC']]
        });

        suggestions.push(...icd11Suggestions.map(s => ({
          system: 'icd11',
          code: s.icd_id,
          display: s.title,
          module: s.module,
          type: 'exact_match'
        })));
      }

      // Add fuzzy matches if not enough exact matches
      if (suggestions.length < limit) {
        const remaining = limit - suggestions.length;
        const fuzzyMatches = await this.getFuzzyMatches(q, system, remaining);
        suggestions.push(...fuzzyMatches);
      }

      res.json({
        query: q,
        suggestions: suggestions.slice(0, limit)
      });
    } catch (error) {
      logger.error('Search suggestions failed:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  async getFuzzyMatches(query, system, limit) {
    const fuzzyMatches = [];
    
    try {
      if (system === 'all' || system === 'namaste') {
        const namasteMatches = await NamesteCode.findAll({
          where: {
            [Op.or]: [
              { display_name: { [Op.like]: `%${query}%` } },
              { definition: { [Op.like]: `%${query}%` } }
            ],
            display_name: { [Op.notLike]: `${query}%` }, // Exclude exact matches
            status: 'active'
          },
          attributes: ['code', 'display_name', 'system_type'],
          limit: Math.ceil(limit / 2),
          order: [['display_name', 'ASC']]
        });

        fuzzyMatches.push(...namasteMatches.map(s => ({
          system: 'namaste',
          code: s.code,
          display: s.display_name,
          system_type: s.system_type,
          type: 'fuzzy_match'
        })));
      }

      if (system === 'all' || system === 'icd11') {
        const icd11Matches = await ICD11Code.findAll({
          where: {
            [Op.or]: [
              { title: { [Op.like]: `%${query}%` } },
              { definition: { [Op.like]: `%${query}%` } }
            ],
            title: { [Op.notLike]: `${query}%` }, // Exclude exact matches
            status: 'active'
          },
          attributes: ['icd_id', 'title', 'module'],
          limit: Math.ceil(limit / 2),
          order: [['title', 'ASC']]
        });

        fuzzyMatches.push(...icd11Matches.map(s => ({
          system: 'icd11',
          code: s.icd_id,
          display: s.title,
          module: s.module,
          type: 'fuzzy_match'
        })));
      }
    } catch (error) {
      logger.error('Fuzzy matching failed:', error);
    }

    return fuzzyMatches;
  }
}

module.exports = new SearchController();
