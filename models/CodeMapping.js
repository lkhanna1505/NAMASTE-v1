const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CodeMapping = sequelize.define('CodeMapping', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  namaste_code: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  icd11_code: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  mapping_type: {
    type: DataTypes.ENUM('equivalent', 'broader', 'narrower', 'related'),
    defaultValue: 'equivalent'
  },
  confidence_score: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 1.00,
    validate: {
      min: 0.00,
      max: 1.00
    }
  },
  verified_by: {
    type: DataTypes.INTEGER
  },
  verified_at: {
    type: DataTypes.DATE
  },
  notes: {
    type: DataTypes.TEXT
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'code_mappings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['namaste_code', 'icd11_code']
    },
    {
      fields: ['mapping_type']
    },
    {
      fields: ['confidence_score']
    }
  ]
});

module.exports = CodeMapping;
