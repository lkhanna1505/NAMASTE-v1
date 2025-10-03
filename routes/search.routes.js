const express = require('express');
const router = express.Router();
const { NamesteCode, ICD11Code } = require('../models');
const { validateSearchQuery } = require('../middleware/validation.middleware');
const { optionalAuth } = require('../middleware/auth.middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/search/diseases:
 *   get:
 *     summary: Search across all disease code systems
 *     tags: [Search]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 */
router.get('/diseases', optionalAuth, validateSearchQuery, async (req, res) => {
  try {
    const { q, limit, offset } = req.query;
    
    // Search NAMASTE codes
    const namasteResults = await NamesteCode.findAll({
      where: {
        [Op.or]: [
          { display_name: { [Op.like]: `%${q}%` } },
          { code: { [Op.like]: `%${q}%` } },
          { definition: { [Op.like]: `%${q}%` } }
        ],
        status: 'active'
      },
      limit: Math.floor(limit / 2),
      offset
    });

    // Search ICD-11 codes  
    const icd11Results = await ICD11Code.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.like]: `%${q}%` } },
          { code: { [Op.like]: `%${q}%` } },
          { definition: { [Op.like]: `%${q}%` } }
        ],
        status: 'active'
      },
      limit: Math.floor(limit / 2),
      offset
    });

    const results = {
      query: q,
      total: namasteResults.length + icd11Results.length,
      namaste: namasteResults.map(code => ({
        system: 'namaste',
        code: code.code,
        display: code.display_name,
        definition: code.definition,
        system_type: code.system_type,
        category: code.category
      })),
      icd11: icd11Results.map(code => ({
        system: 'icd11', 
        code: code.icd_id,
        display: code.title,
        definition: code.definition,
        module: code.module
      }))
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/search/namaste:
 *   get:
 *     summary: Search NAMASTE codes
 *     tags: [Search]
 */
router.get('/namaste', optionalAuth, validateSearchQuery, async (req, res) => {
  try {
    const { q, limit, offset, system } = req.query;
    
    const whereClause = {
      [Op.or]: [
        { display_name: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
        { definition: { [Op.like]: `%${q}%` } }
      ],
      status: 'active'
    };

    if (system && ['ayurveda', 'siddha', 'unani'].includes(system)) {
      whereClause.system_type = system;
    }

    const results = await NamesteCode.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['display_name', 'ASC']]
    });

    res.json({
      query: q,
      total: results.count,
      limit,
      offset,
      results: results.rows
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/search/icd11:
 *   get:
 *     summary: Search ICD-11 codes
 *     tags: [Search]
 */
router.get('/icd11', optionalAuth, validateSearchQuery, async (req, res) => {
  try {
    const { q, limit, offset, module } = req.query;
    
    const whereClause = {
      [Op.or]: [
        { title: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
        { definition: { [Op.like]: `%${q}%` } }
      ],
      status: 'active'
    };

    if (module && ['tm2', 'biomedicine'].includes(module)) {
      whereClause.module = module;
    }

    const results = await ICD11Code.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['title', 'ASC']]
    });

    res.json({
      query: q,
      total: results.count,
      limit,
      offset,
      results: results.rows
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/autocomplete:
 *   get:
 *     summary: Autocomplete suggestions
 *     tags: [Search]
 */
router.get('/autocomplete', optionalAuth, async (req, res) => {
  try {
    const { q, systems = 'all' } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = [];

    if (systems === 'all' || systems.includes('namaste')) {
      const namasteSuggestions = await NamesteCode.findAll({
        where: {
          display_name: { [Op.like]: `${q}%` },
          status: 'active'
        },
        attributes: ['code', 'display_name', 'system_type'],
        limit: 5,
        order: [['display_name', 'ASC']]
      });

      suggestions.push(...namasteSuggestions.map(s => ({
        system: 'namaste',
        code: s.code,
        display: s.display_name,
        system_type: s.system_type
      })));
    }

    if (systems === 'all' || systems.includes('icd11')) {
      const icd11Suggestions = await ICD11Code.findAll({
        where: {
          title: { [Op.like]: `${q}%` },
          status: 'active'
        },
        attributes: ['icd_id', 'title', 'module'],
        limit: 5,
        order: [['title', 'ASC']]
      });

      suggestions.push(...icd11Suggestions.map(s => ({
        system: 'icd11',
        code: s.icd_id,
        display: s.title,
        module: s.module
      })));
    }

    res.json({
      query: q,
      suggestions: suggestions.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
