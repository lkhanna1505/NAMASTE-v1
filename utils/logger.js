const winston = require('winston');
const path = require('path');
const fs = require('fs');

const loggerTransports = []; // Array to hold transports

// Explicitly check for local environments to enable file logging
const isLocalEnv = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

// --- CONDITIONAL FILE LOGGING (Only runs in local/dev/test) ---
if (isLocalEnv) {
    const logDir = 'logs';

    // 1. CONDITIONAL FILE SYSTEM CHECK & DIRECTORY CREATION
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir); 
      } catch (e) {
        // This should now only run locally.
        console.warn(`[LOGGER WARNING] Could not create log directory at ${logDir}: ${e.message}`);
      }
    }

    // 2. ADD FILE TRANSPORTS (Line 24 in your code is here)
    loggerTransports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        })
    );

    // 3. ADD COLORIZED CONSOLE TRANSPORT FOR DEVELOPMENT
    loggerTransports.push(
        new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            ),
            level: process.env.LOG_LEVEL || 'debug'
        })
    );

} else {
    // --- PRODUCTION/DEPLOYED ENVIRONMENT LOGGING ---
    // Runs when NODE_ENV is 'production', 'staging', or simply unset (which is the Vercel issue)
    loggerTransports.push(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.simple()
            ),
            level: process.env.LOG_LEVEL || 'info' // Use 'info' or above in production
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