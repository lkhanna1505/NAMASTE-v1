const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Authentication token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Invalid or expired token'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid token'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Authentication required'
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      if (user && user.is_active) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
    logger.debug('Optional auth failed:', error.message);
  }
  
  next();
};

module.exports = {
  authenticateToken,
  authorize,
  optionalAuth
};
