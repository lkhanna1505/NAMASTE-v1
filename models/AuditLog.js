const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  resource_type: {
    type: DataTypes.STRING(50)
  },
  resource_id: {
    type: DataTypes.STRING(100)
  },
  old_values: {
    type: DataTypes.JSON
  },
  new_values: {
    type: DataTypes.JSON
  },
  ip_address: {
    type: DataTypes.STRING(45)
  },
  user_agent: {
    type: DataTypes.TEXT
  },
  request_id: {
    type: DataTypes.STRING(100)
  },
  session_id: {
    type: DataTypes.STRING(100)
  },
  additional_info: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['action']
    },
    {
      fields: ['resource_type']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = AuditLog;
