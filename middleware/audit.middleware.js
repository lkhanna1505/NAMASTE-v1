const { AuditLog } = require('../models');
const { v4: uuidv4 } = require('uuid');

const auditMiddleware = (req, res, next) => {
  // Generate request ID for tracking
  req.requestId = uuidv4();
  
  // Store original res.json to intercept responses
  const originalJson = res.json;
  
  res.json = function(data) {
    // Log the audit trail
    setImmediate(async () => {
      try {
        const auditData = {
          user_id: req.user ? req.user.id : null,
          action: `${req.method} ${req.route ? req.route.path : req.path}`,
          resource_type: extractResourceType(req.path),
          resource_id: req.params.id || null,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent'),
          request_id: req.requestId,
          additional_info: {
            query: req.query,
            body: sanitizeBody(req.body),
            status_code: res.statusCode,
            response_size: JSON.stringify(data).length
          }
        };

        await AuditLog.create(auditData);
      } catch (error) {
        console.error('Audit logging failed:', error);
      }
    });

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

function extractResourceType(path) {
  if (path.includes('/namaste')) return 'namaste_code';
  if (path.includes('/icd11')) return 'icd11_code';
  if (path.includes('/mapping')) return 'code_mapping';
  if (path.includes('/fhir')) return 'fhir_resource';
  if (path.includes('/auth')) return 'authentication';
  return 'unknown';
}

function sanitizeBody(body) {
  if (!body) return null;
  
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'key'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

module.exports = auditMiddleware;
