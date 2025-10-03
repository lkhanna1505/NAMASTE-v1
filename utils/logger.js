const winston = require('winston');
const path = require('path');
const fs = require('fs');

const loggerTransports = []; // Array to hold transports

// Check if we are in a local development or testing environment
const isLocalEnv = ['development', 'test'].includes(process.env.NODE_ENV);

// --- CONDITIONAL FILE LOGGING ---
if (isLocalEnv) {
    const logDir = 'logs';

    // 1. CONDITIONAL FILE SYSTEM CHECK & DIRECTORY CREATION
    if (!fs.existsSync(logDir)) {
      try {
        // This is where the crash occurs due to winston's internal check.
        // Even if we wrap this, winston's File constructor still attempts it.
        // We ensure we only hit this in local envs where it should work.
        fs.mkdirSync(logDir); 
      } catch (e) {
        // Log a warning if directory creation fails locally
        console.warn(`[LOGGER WARNING] Could not create log directory at ${logDir}: ${e.message}`);
      }
    }

    // 2. ADD FILE TRANSPORTS
    loggerTransports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        })
    );

    // 3. ADD CONSOLE TRANSPORT FOR DEVELOPMENT (with color)
    loggerTransports.push(
        new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            ),
            level: 'debug' 
        })
    );

} else {
    // --- PRODUCTION/DEPLOYED ENVIRONMENT LOGGING ---
    // Only use Console transport in all other environments (Vercel, Lambda)
    loggerTransports.push(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.simple()
            )
        })
    );
}

// ----------------------------------------------------

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'namaste-icd11-api' },
  transports: loggerTransports, // Use the dynamic array
});

module.exports = logger;