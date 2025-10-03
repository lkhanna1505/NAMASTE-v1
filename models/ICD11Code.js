const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ICD11Code = sequelize.define('ICD11Code', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  icd_id: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50)
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  definition: {
    type: DataTypes.TEXT
  },
  module: {
    type: DataTypes.ENUM('tm2', 'biomedicine'),
    allowNull: false
  },
  parent_id: {
    type: DataTypes.STRING(100)
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  synonyms: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  narrower_terms: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  broader_terms: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  last_sync: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  who_metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'icd11_codes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['title']
    },
    {
      fields: ['module']
    },
    {
      fields: ['parent_id']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = ICD11Code;
