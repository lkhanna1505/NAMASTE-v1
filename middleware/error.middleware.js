const logger = require('../utils/logger');

const errorMiddleware = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(`Error ${err.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user: req.user ? req.user.id : 'anonymous'
  });

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const message = err.errors.map(error => error.message).join(', ');
    error = {
      status: 400,
      message: 'Validation Error: ' + message
    };
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    error = {
      status: 409,
      message: 'Resource already exists'
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      status: 401,
      message: 'Invalid token'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      status: 401,
      message: 'Token expired'
    };
  }

  // Default to 500 server error
  const statusCode = error.status || error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal Server Error' : 'Client Error',
    message: process.env.NODE_ENV === 'production' && statusCode >= 500 
      ? 'Something went wrong on our end' 
      : message,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
};

module.exports = errorMiddleware;
