const express = require('express');
const router = express.Router();
const { ICD11Code } = require('../models');
const { authenticateToken, authorize } = require('../middleware/auth.middleware');
const axios = require('axios');

/**
 * @swagger
 * /api/icd11/tm2/{code}:
 *   get:
 *     summary: Get ICD-11 TM2 code details
 *     tags: [ICD-11]
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/tm2/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const icdCode = await ICD11Code.findOne({
      where: { 
        [require('sequelize').Op.or]: [
          { icd_id: code },
          { code: code }
        ],
        module: 'tm2',
        status: 'active'
      }
    });

    if (!icdCode) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'ICD-11 TM2 code not found'
      });
    }

    res.json(icdCode);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/icd11/biomedicine/{code}:
 *   get:
 *     summary: Get ICD-11 biomedicine code details
 *     tags: [ICD-11]
 */
router.get('/biomedicine/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const icdCode = await ICD11Code.findOne({
      where: { 
        [require('sequelize').Op.or]: [
          { icd_id: code },
          { code: code }
        ],
        module: 'biomedicine',
        status: 'active'
      }
    });

    if (!icdCode) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'ICD-11 biomedicine code not found'
      });
    }

    res.json(icdCode);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/icd11/sync:
 *   post:
 *     summary: Sync with WHO ICD-11 API
 *     tags: [ICD-11]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sync', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    // In production, implement actual WHO API sync
    // This is a placeholder for the sync operation
    
    const syncResult = {
      message: 'ICD-11 sync initiated',
      status: 'in_progress',
      estimated_completion: '5 minutes',
      note: 'This is a placeholder. Implement actual WHO API integration.'
    };

    res.json(syncResult);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/icd11/batch-lookup:
 *   post:
 *     summary: Batch lookup ICD-11 codes
 *     tags: [ICD-11]
 */
router.post('/batch-lookup', async (req, res) => {
  try {
    const { codes } = req.body;
    
    if (!codes || !Array.isArray(codes)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'codes array is required'
      });
    }

    const results = await ICD11Code.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { icd_id: { [require('sequelize').Op.in]: codes } },
          { code: { [require('sequelize').Op.in]: codes } }
        ],
        status: 'active'
      }
    });

    const responseMap = {};
    results.forEach(result => {
      responseMap[result.icd_id] = result;
      if (result.code) {
        responseMap[result.code] = result;
      }
    });

    res.json({
      requested: codes,
      found: results.length,
      results: responseMap
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
