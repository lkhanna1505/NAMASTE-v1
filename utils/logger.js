const winston = require('winston');
const path = require('path');
const fs = require('fs');

const loggerTransports = []; // Array to hold transports
const logDir = 'logs';

// --- DEVELOPMENT/LOCAL ENVIRONMENT LOGGING ---
// Enable file writing and directory creation ONLY if not in production
if (process.env.NODE_ENV !== 'production') {

    // 1. CONDITIONAL FILE SYSTEM CHECK & DIRECTORY CREATION
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir);
      } catch (e) {
        // Log a warning if directory creation fails (though it shouldn't locally)
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

    // 3. ADD COLORIZED CONSOLE TRANSPORT FOR DEVELOPMENT
    loggerTransports.push(
        new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            ),
            level: 'debug' // Use debug level for local dev
        })
    );

} else {
    // --- PRODUCTION/DEPLOYED ENVIRONMENT LOGGING ---
    // Only use Console transport in production (Vercel, Lambda, etc.)
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