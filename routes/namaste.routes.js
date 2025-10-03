const express = require('express');
const router = express.Router();
const { NamesteCode } = require('../models');
const { authenticateToken, authorize } = require('../middleware/auth.middleware');
const { validateCreateNamesteCode } = require('../middleware/validation.middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/namaste/codes:
 *   get:
 *     summary: Get all NAMASTE codes
 *     tags: [NAMASTE]
 *     parameters:
 *       - name: system_type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ayurveda, siddha, unani]
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 */
router.get('/codes', async (req, res) => {
  try {
    const { system_type, category, limit = 50, offset = 0 } = req.query;
    
    const whereClause = { status: 'active' };
    if (system_type) whereClause.system_type = system_type;
    if (category) whereClause.category = category;

    const result = await NamesteCode.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['display_name', 'ASC']]
    });

    res.json({
      total: result.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      codes: result.rows
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
 * /api/namaste/codes/{code}:
 *   get:
 *     summary: Get specific NAMASTE code
 *     tags: [NAMASTE]
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/codes/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const namasteCode = await NamesteCode.findOne({
      where: { code, status: 'active' }
    });

    if (!namasteCode) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'NAMASTE code not found'
      });
    }

    res.json(namasteCode);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/namaste/codes:
 *   post:
 *     summary: Create new NAMASTE code
 *     tags: [NAMASTE]
 *     security:
 *       - bearerAuth: []
 */
router.post('/codes', authenticateToken, authorize('admin', 'clinician'), validateCreateNamesteCode, async (req, res) => {
  try {
    const codeData = req.body;
    
    // Check if code already exists
    const existingCode = await NamesteCode.findOne({ where: { code: codeData.code } });
    if (existingCode) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'NAMASTE code already exists'
      });
    }

    const newCode = await NamesteCode.create(codeData);
    
    res.status(201).json({
      message: 'NAMASTE code created successfully',
      code: newCode
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
 * /api/namaste/stats:
 *   get:
 *     summary: Get NAMASTE statistics
 *     tags: [NAMASTE]
 */
router.get('/stats', async (req, res) => {
  try {
    const totalCodes = await NamesteCode.count({ where: { status: 'active' } });
    
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
      where: { status: 'active', category: { [Op.not]: null } },
      group: ['category'],
      raw: true,
      limit: 10
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
      }, {})
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
