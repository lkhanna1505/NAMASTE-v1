const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

class AuthService {
  generateTokens(user) {
    const payload = {
      userId: user.id,
      abhaId: user.abha_id,
      role: user.role
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
    });

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      
      if (!user || !user.is_active || user.refresh_token !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async login(abhaId, password = null) {
    const user = await User.findOne({ where: { abha_id: abhaId } });
    
    if (!user || !user.is_active) {
      throw new Error('Invalid credentials');
    }

    if (password && !await user.validatePassword(password)) {
      throw new Error('Invalid credentials');
    }

    const tokens = this.generateTokens(user);
    
    // Store refresh token
    await user.update({
      refresh_token: tokens.refreshToken,
      last_login: new Date()
    });

    return { user, ...tokens };
  }

  async logout(userId) {
    await User.update(
      { refresh_token: null },
      { where: { id: userId } }
    );
  }
}

module.exports = new AuthService();
