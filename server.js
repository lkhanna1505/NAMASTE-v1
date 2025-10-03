const app = require('./app');
const { sequelize } = require('./models');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync database models
    await sequelize.sync({ alter: true });
    logger.info('Database synchronized');

    // Start server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`🏥 NAMASTE-ICD11 API Server running on http://${HOST}:${PORT}`);
      logger.info(`📚 API Documentation: http://${HOST}:${PORT}/api-docs`);
      logger.info(`🔍 FHIR Metadata: http://${HOST}:${PORT}/fhir/metadata`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        await sequelize.close();
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        await sequelize.close();
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
