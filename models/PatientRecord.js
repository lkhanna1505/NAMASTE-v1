const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PatientRecord = sequelize.define('PatientRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  patient_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  encounter_id: {
    type: DataTypes.STRING(100)
  },
  fhir_bundle: {
    type: DataTypes.JSON,
    allowNull: false
  },
  namaste_codes: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  icd11_codes: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  created_by: {
    type: DataTypes.INTEGER
  },
  consent_given: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  consent_version: {
    type: DataTypes.STRING(20)
  },
  consent_date: {
    type: DataTypes.DATE
  },
  data_retention_until: {
    type: DataTypes.DATE
  },
  is_anonymized: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  tableName: 'patient_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['patient_id']
    },
    {
      fields: ['encounter_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['consent_given']
    }
  ]
});

module.exports = PatientRecord;
