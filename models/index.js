const sequelize = require('../config/database');
const User = require('./User');
const NamesteCode = require('./NamesteCode');
const ICD11Code = require('./ICD11Code');
const CodeMapping = require('./CodeMapping');
const AuditLog = require('./AuditLog');
const PatientRecord = require('./PatientRecord');

// Define associations
CodeMapping.belongsTo(NamesteCode, { 
  foreignKey: 'namaste_code', 
  targetKey: 'code',
  as: 'namasteCodeDetails'
});

CodeMapping.belongsTo(ICD11Code, { 
  foreignKey: 'icd11_code', 
  targetKey: 'icd_id',
  as: 'icd11CodeDetails'
});

CodeMapping.belongsTo(User, { 
  foreignKey: 'verified_by',
  as: 'verifier'
});

AuditLog.belongsTo(User, { 
  foreignKey: 'user_id',
  as: 'user'
});

PatientRecord.belongsTo(User, { 
  foreignKey: 'created_by',
  as: 'creator'
});

const models = {
  User,
  NamesteCode,
  ICD11Code,
  CodeMapping,
  AuditLog,
  PatientRecord,
  sequelize
};

module.exports = models;
