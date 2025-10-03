const express = require('express');
const router = express.Router();
const { User, AuditLog, NamesteCode, ICD11Code, CodeMapping } = require('../models');
const { authenticateToken, authorize } = require('../middleware/auth.middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get audit logs (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/audit-logs', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { limit = 100, offset = 0, user_id, action, start_date, end_date } = req.query;
    
    const whereClause = {};
    if (user_id) whereClause.user_id = user_id;
    if (action) whereClause.action = { [Op.like]: `%${action}%` };
    if (start_date && end_date) {
      whereClause.created_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    }

    const logs = await AuditLog.findAndCountAll({
      where: whereClause,
      include: [{ 
        model: User, 
        as: 'user',
        attributes: ['id', 'name', 'abha_id', 'role']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      total: logs.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      logs: logs.rows
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
 * /api/admin/system-health:
 *   get:
 *     summary: System health check
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/system-health', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: 'connected',
        tables: {}
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      uptime: Math.floor(process.uptime()) + ' seconds'
    };

    // Check table counts
    health.database.tables.users = await User.count();
    health.database.tables.namaste_codes = await NamesteCode.count();
    health.database.tables.icd11_codes = await ICD11Code.count();
    health.database.tables.code_mappings = await CodeMapping.count();
    health.database.tables.audit_logs = await AuditLog.count();

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/admin/metrics:
 *   get:
 *     summary: Usage metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/metrics', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const metrics = {
      users: {
        total: await User.count(),
        active: await User.count({ where: { is_active: true } }),
        by_role: await User.findAll({
          attributes: [
            'role',
            [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']
          ],
          group: ['role'],
          raw: true
        })
      },
      api_usage: {
        total_requests: await AuditLog.count({
          where: {
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        }),
        unique_users: await AuditLog.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: { [Op.gte]: thirtyDaysAgo },
            user_id: { [Op.not]: null }
          }
        }),
        top_endpoints: await AuditLog.findAll({
          attributes: [
            'action',
            [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
          ],
          where: {
            created_at: { [Op.gte]: thirtyDaysAgo }
          },
          group: ['action'],
          order: [[AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'DESC']],
          limit: 10,
          raw: true
        })
      },
      data: {
        namaste_codes: await NamesteCode.count({ where: { status: 'active' } }),
        icd11_codes: await ICD11Code.count({ where: { status: 'active' } }),
        mappings: await CodeMapping.count({ where: { is_active: true } })
      }
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { limit = 50, offset = 0, role, active } = req.query;
    
    const whereClause = {};
    if (role) whereClause.role = role;
    if (active !== undefined) whereClause.is_active = active === 'true';

    const users = await User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password_hash', 'refresh_token'] }
    });

    res.json({
      total: users.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      users: users.rows
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
