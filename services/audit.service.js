const { AuditLog, User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class AuditService {
  // Log an action
  async logAction({
    user_id = null,
    action,
    resource_type = null,
    resource_id = null,
    old_values = null,
    new_values = null,
    ip_address = null,
    user_agent = null,
    request_id = null,
    session_id = null,
    additional_info = {}
  }) {
    try {
      const auditEntry = await AuditLog.create({
        user_id,
        action,
        resource_type,
        resource_id,
        old_values: old_values ? JSON.stringify(old_values) : null,
        new_values: new_values ? JSON.stringify(new_values) : null,
        ip_address,
        user_agent,
        request_id,
        session_id,
        additional_info
      });

      // Log to application logger as well for critical actions
      const criticalActions = [
        'LOGIN_FAILED', 'USER_REGISTERED', 'MAPPING_CREATED',
        'ICD11_SYNC', 'NAMASTE_CODES_IMPORTED', 'MAPPINGS_EXPORTED'
      ];

      if (criticalActions.includes(action)) {
        logger.info('Audit Event', {
          audit_id: auditEntry.id,
          user_id,
          action,
          resource_type,
          resource_id,
          ip_address
        });
      }

      return auditEntry;

    } catch (error) {
      logger.error('Failed to create audit log entry:', error);
      // Don't throw error to avoid breaking the main operation
      return null;
    }
  }

  // Get audit logs with filtering and pagination
  async getLogs({
    limit = 100,
    offset = 0,
    user_id = null,
    action = null,
    resource_type = null,
    resource_id = null,
    start_date = null,
    end_date = null,
    ip_address = null,
    include_user = true
  }) {
    try {
      const whereClause = {};
      
      if (user_id) whereClause.user_id = user_id;
      if (action) {
        if (Array.isArray(action)) {
          whereClause.action = { [Op.in]: action };
        } else {
          whereClause.action = { [Op.like]: `%${action}%` };
        }
      }
      if (resource_type) whereClause.resource_type = resource_type;
      if (resource_id) whereClause.resource_id = resource_id;
      if (ip_address) whereClause.ip_address = ip_address;

      if (start_date && end_date) {
        whereClause.created_at = {
          [Op.between]: [new Date(start_date), new Date(end_date)]
        };
      } else if (start_date) {
        whereClause.created_at = {
          [Op.gte]: new Date(start_date)
        };
      } else if (end_date) {
        whereClause.created_at = {
          [Op.lte]: new Date(end_date)
        };
      }

      const include = [];
      if (include_user) {
        include.push({
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'abha_id', 'role', 'email']
        });
      }

      const result = await AuditLog.findAndCountAll({
        where: whereClause,
        include,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      return {
        total: result.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        logs: result.rows.map(log => this.formatAuditLog(log))
      };

    } catch (error) {
      logger.error('Failed to retrieve audit logs:', error);
      throw error;
    }
  }

  // Get audit statistics
  async getStatistics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total logs in period
      const totalLogs = await AuditLog.count({
        where: {
          created_at: { [Op.gte]: startDate }
        }
      });

      // Logs by action
      const actionStats = await AuditLog.findAll({
        attributes: [
          'action',
          [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: ['action'],
        order: [[AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true
      });

      // Logs by user
      const userStats = await AuditLog.findAll({
        attributes: [
          'user_id',
          [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          user_id: { [Op.not]: null }
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['name', 'abha_id', 'role']
        }],
        group: ['user_id'],
        order: [[AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'DESC']],
        limit: 10
      });

      // Logs by resource type
      const resourceStats = await AuditLog.findAll({
        attributes: [
          'resource_type',
          [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          resource_type: { [Op.not]: null }
        },
        group: ['resource_type'],
        order: [[AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'DESC']],
        raw: true
      });

      // Failed login attempts
      const failedLogins = await AuditLog.count({
        where: {
          action: 'LOGIN_FAILED',
          created_at: { [Op.gte]: startDate }
        }
      });

      // Unique IP addresses
      const uniqueIPs = await AuditLog.count({
        distinct: true,
        col: 'ip_address',
        where: {
          created_at: { [Op.gte]: startDate },
          ip_address: { [Op.not]: null }
        }
      });

      // Daily activity
      const dailyActivity = await AuditLog.findAll({
        attributes: [
          [AuditLog.sequelize.fn('DATE', AuditLog.sequelize.col('created_at')), 'date'],
          [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: [AuditLog.sequelize.fn('DATE', AuditLog.sequelize.col('created_at'))],
        order: [[AuditLog.sequelize.fn('DATE', AuditLog.sequelize.col('created_at')), 'DESC']],
        raw: true
      });

      return {
        period_days: days,
        total_logs: totalLogs,
        failed_logins: failedLogins,
        unique_ips: uniqueIPs,
        top_actions: actionStats.map(stat => ({
          action: stat.action,
          count: parseInt(stat.count)
        })),
        top_users: userStats.map(stat => ({
          user_id: stat.user_id,
          name: stat.user?.name,
          abha_id: stat.user?.abha_id,
          role: stat.user?.role,
          count: parseInt(stat.dataValues.count)
        })),
        by_resource_type: resourceStats.map(stat => ({
          resource_type: stat.resource_type,
          count: parseInt(stat.count)
        })),
        daily_activity: dailyActivity.map(day => ({
          date: day.date,
          count: parseInt(day.count)
        }))
      };

    } catch (error) {
      logger.error('Failed to get audit statistics:', error);
      throw error;
    }
  }

  // Get security events (failed logins, suspicious activities)
  async getSecurityEvents(limit = 50) {
    try {
      const securityActions = [
        'LOGIN_FAILED',
        'TOKEN_EXPIRED',
        'UNAUTHORIZED_ACCESS',
        'RATE_LIMITED',
        'SUSPICIOUS_ACTIVITY'
      ];

      const events = await AuditLog.findAll({
        where: {
          action: { [Op.in]: securityActions },
          created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['name', 'abha_id', 'role'],
          required: false
        }],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit)
      });

      return events.map(event => this.formatAuditLog(event));

    } catch (error) {
      logger.error('Failed to get security events:', error);
      throw error;
    }
  }

  // Track user activity
  async getUserActivity(userId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const activity = await AuditLog.findAll({
        where: {
          user_id: userId,
          created_at: { [Op.gte]: startDate }
        },
        attributes: [
          'action',
          'resource_type',
          'created_at',
          'ip_address',
          'additional_info'
        ],
        order: [['created_at', 'DESC']],
        limit: 100
      });

      // Activity summary
      const actionCounts = {};
      activity.forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      });

      return {
        user_id: userId,
        period_days: days,
        total_actions: activity.length,
        action_summary: actionCounts,
        recent_activity: activity.slice(0, 20).map(log => this.formatAuditLog(log))
      };

    } catch (error) {
      logger.error('Failed to get user activity:', error);
      throw error;
    }
  }

  // Clean old audit logs
  async cleanOldLogs(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deletedCount = await AuditLog.destroy({
        where: {
          created_at: { [Op.lt]: cutoffDate }
        }
      });

      logger.info(`Cleaned ${deletedCount} old audit log entries older than ${daysToKeep} days`);
      return deletedCount;

    } catch (error) {
      logger.error('Failed to clean old audit logs:', error);
      throw error;
    }
  }

  // Export audit logs
  async exportLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.getLogs({
        ...filters,
        limit: 10000, // Large limit for export
        include_user: true
      });

      if (format === 'csv') {
        return this.convertToCSV(logs.logs);
      }

      return logs;

    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      throw error;
    }
  }

  // Convert logs to CSV format
  convertToCSV(logs) {
    const headers = [
      'ID',
      'User_ID',
      'User_Name',
      'Action',
      'Resource_Type',
      'Resource_ID',
      'IP_Address',
      'Created_At',
      'Additional_Info'
    ];

    const rows = logs.map(log => [
      log.id,
      log.user_id || '',
      log.user?.name || '',
      log.action,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
      log.created_at,
      JSON.stringify(log.additional_info || {})
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  // Format audit log for response
  formatAuditLog(log) {
    return {
      id: log.id,
      user_id: log.user_id,
      user: log.user ? {
        name: log.user.name,
        abha_id: log.user.abha_id,
        role: log.user.role
      } : null,
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      old_values: log.old_values ? JSON.parse(log.old_values) : null,
      new_values: log.new_values ? JSON.parse(log.new_values) : null,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      request_id: log.request_id,
      session_id: log.session_id,
      additional_info: log.additional_info || {},
      created_at: log.created_at
    };
  }

  // Middleware to automatically log HTTP requests
  createAuditMiddleware() {
    return (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Log the request after response is sent
        setImmediate(async () => {
          try {
            await this.logAction({
              user_id: req.user?.id || null,
              action: `${req.method}_${req.route?.path || req.path}`,
              resource_type: this.extractResourceType(req.path),
              resource_id: req.params?.id || null,
              ip_address: req.ip,
              user_agent: req.get('User-Agent'),
              request_id: req.requestId,
              additional_info: {
                method: req.method,
                path: req.path,
                status_code: res.statusCode,
                query: req.query,
                body_size: JSON.stringify(req.body || {}).length,
                response_size: data ? data.length : 0
              }
            });
          } catch (error) {
            logger.error('Audit middleware failed:', error);
          }
        });

        return originalSend.call(this, data);
      }.bind(this);

      next();
    };
  }

  // Extract resource type from URL path
  extractResourceType(path) {
    if (path.includes('/namaste')) return 'namaste_code';
    if (path.includes('/icd11')) return 'icd11_code';
    if (path.includes('/mapping')) return 'code_mapping';
    if (path.includes('/fhir')) return 'fhir_resource';
    if (path.includes('/auth')) return 'authentication';
    if (path.includes('/admin')) return 'admin_operation';
    return 'unknown';
  }
}

module.exports = new AuditService();
