const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  abha_id: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING(255),
    validate: {
      isEmail: true
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: true // For OAuth users
  },
  role: {
    type: DataTypes.ENUM('clinician', 'admin', 'viewer'),
    defaultValue: 'clinician'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_login: {
    type: DataTypes.DATE
  },
  refresh_token: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('password_hash') && user.password_hash) {
        const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        user.password_hash = await bcrypt.hash(user.password_hash, rounds);
      }
    }
  }
});

User.prototype.validatePassword = async function(password) {
  if (!this.password_hash) return false;
  return bcrypt.compare(password, this.password_hash);
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password_hash;
  delete values.refresh_token;
  return values;
};

module.exports = User;
