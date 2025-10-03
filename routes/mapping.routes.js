const express = require('express');
const router = express.Router();
const { CodeMapping, NamesteCode, ICD11Code } = require('../models');
const { authenticateToken, authorize } = require('../middleware/auth.middleware');
const { validateCreateMapping } = require('../middleware/validation.middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/mapping/namaste-to-icd11/{code}:
 *   get:
 *     summary: Map NAMASTE code to ICD-11
 *     tags: [Code Mapping]
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: NAMASTE code
 */
router.get('/namaste-to-icd11/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const mappings = await CodeMapping.findAll({
      where: { 
        namaste_code: code,
        is_active: true 
      },
      include: [
        {
          association: 'namasteCodeDetails',
          attributes: ['code', 'display_name', 'definition', 'system_type']
        },
        {
          association: 'icd11CodeDetails',
          attributes: ['icd_id', 'code', 'title', 'definition', 'module']
        }
      ]
    });

    if (mappings.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No mappings found for this NAMASTE code'
      });
    }

    res.json({
      source_code: code,
      source_system: 'namaste',
      target_system: 'icd11',
      mappings: mappings.map(mapping => ({
        target_code: mapping.icd11_code,
        target_display: mapping.icd11CodeDetails.title,
        mapping_type: mapping.mapping_type,
        confidence_score: parseFloat(mapping.confidence_score),
        verified: !!mapping.verified_by,
        verified_at: mapping.verified_at,
        notes: mapping.notes
      }))
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
 * /api/mapping/icd11-to-namaste/{code}:
 *   get:
 *     summary: Map ICD-11 code to NAMASTE
 *     tags: [Code Mapping]
 */
router.get('/icd11-to-namaste/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const mappings = await CodeMapping.findAll({
      where: { 
        icd11_code: code,
        is_active: true 
      },
      include: [
        {
          association: 'namasteCodeDetails',
          attributes: ['code', 'display_name', 'definition', 'system_type']
        },
        {
          association: 'icd11CodeDetails',
          attributes: ['icd_id', 'code', 'title', 'definition', 'module']
        }
      ]
    });

    if (mappings.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No mappings found for this ICD-11 code'
      });
    }

    res.json({
      source_code: code,
      source_system: 'icd11',
      target_system: 'namaste',
      mappings: mappings.map(mapping => ({
        target_code: mapping.namaste_code,
        target_display: mapping.namasteCodeDetails.display_name,
        target_system_type: mapping.namasteCodeDetails.system_type,
        mapping_type: mapping.mapping_type,
        confidence_score: parseFloat(mapping.confidence_score),
        verified: !!mapping.verified_by,
        verified_at: mapping.verified_at,
        notes: mapping.notes
      }))
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
 * /api/mapping/create:
 *   post:
 *     summary: Create new code mapping
 *     tags: [Code Mapping]
 *     security:
 *       - bearerAuth: []
 */
router.post('/create', authenticateToken, authorize('admin', 'clinician'), validateCreateMapping, async (req, res) => {
  try {
    const { namaste_code, icd11_code, mapping_type, confidence_score, notes } = req.body;
    
    // Verify both codes exist
    const namasteExists = await NamesteCode.findOne({
      where: { code: namaste_code, status: 'active' }
    });
    
    const icd11Exists = await ICD11Code.findOne({
      where: { 
        [Op.or]: [
          { icd_id: icd11_code },
          { code: icd11_code }
        ],
        status: 'active'
      }
    });

    if (!namasteExists) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'NAMASTE code not found'
      });
    }

    if (!icd11Exists) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'ICD-11 code not found'
      });
    }

    // Check if mapping already exists
    const existingMapping = await CodeMapping.findOne({
      where: {
        namaste_code,
        icd11_code: icd11Exists.icd_id
      }
    });

    if (existingMapping) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Mapping already exists'
      });
    }

    // Create new mapping
    const newMapping = await CodeMapping.create({
      namaste_code,
      icd11_code: icd11Exists.icd_id,
      mapping_type: mapping_type || 'equivalent',
      confidence_score: confidence_score || 1.0,
      notes,
      verified_by: req.user.id,
      verified_at: new Date()
    });

    res.status(201).json({
      message: 'Mapping created successfully',
      mapping: newMapping
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
 * /api/mapping/{id}:
 *   put:
 *     summary: Update existing mapping
 *     tags: [Code Mapping]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', authenticateToken, authorize('admin', 'clinician'), async (req, res) => {
  try {
    const { id } = req.params;
    const { mapping_type, confidence_score, notes, is_active } = req.body;
    
    const mapping = await CodeMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Mapping not found'
      });
    }

    // Update mapping
    await mapping.update({
      mapping_type: mapping_type || mapping.mapping_type,
      confidence_score: confidence_score !== undefined ? confidence_score : mapping.confidence_score,
      notes: notes !== undefined ? notes : mapping.notes,
      is_active: is_active !== undefined ? is_active : mapping.is_active,
      verified_by: req.user.id,
      verified_at: new Date()
    });

    res.json({
      message: 'Mapping updated successfully',
      mapping
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
 * /api/mapping/{id}:
 *   delete:
 *     summary: Delete mapping
 *     tags: [Code Mapping]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const mapping = await CodeMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Mapping not found'
      });
    }

    // Soft delete by setting is_active to false
    await mapping.update({ is_active: false });

    res.json({
      message: 'Mapping deleted successfully'
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
 * /api/mapping/batch-translate:
 *   post:
 *     summary: Batch translate multiple codes
 *     tags: [Code Mapping]
 */
router.post('/batch-translate', async (req, res) => {
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
        message: 'Maximum 50 codes allowed per batch'
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
          { association: 'namasteCodeDetails' },
          { association: 'icd11CodeDetails' }
        ]
      });

      codes.forEach(code => {
        const codeMappings = mappings.filter(m => m.namaste_code === code);
        results[code] = codeMappings.map(mapping => ({
          target_code: mapping.icd11_code,
          target_display: mapping.icd11CodeDetails.title,
          mapping_type: mapping.mapping_type,
          confidence_score: parseFloat(mapping.confidence_score)
        }));
      });
    } else if (source_system === 'icd11' && target_system === 'namaste') {
      const mappings = await CodeMapping.findAll({
        where: {
          icd11_code: { [Op.in]: codes },
          is_active: true
        },
        include: [
          { association: 'namasteCodeDetails' },
          { association: 'icd11CodeDetails' }
        ]
      });

      codes.forEach(code => {
        const codeMappings = mappings.filter(m => m.icd11_code === code);
        results[code] = codeMappings.map(mapping => ({
          target_code: mapping.namaste_code,
          target_display: mapping.namasteCodeDetails.display_name,
          target_system_type: mapping.namasteCodeDetails.system_type,
          mapping_type: mapping.mapping_type,
          confidence_score: parseFloat(mapping.confidence_score)
        }));
      });
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid source_system or target_system'
      });
    }

    res.json({
      source_system,
      target_system,
      total_requested: codes.length,
      results
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
