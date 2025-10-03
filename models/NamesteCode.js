const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NamesteCode = sequelize.define('NamesteCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  display_name: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  definition: {
    type: DataTypes.TEXT
  },
  system_type: {
    type: DataTypes.ENUM('ayurveda', 'siddha', 'unani'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(100)
  },
  synonyms: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  parent_code: {
    type: DataTypes.STRING(50)
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0'
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'namaste_codes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['display_name']
    },
    {
      fields: ['system_type']
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = NamesteCode;
