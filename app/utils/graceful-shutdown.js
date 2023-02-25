const logger = require('../config/logger');
const db = require('../models');

const gracefulShutdown = async server => {
  try {
    await db.sequelize.close();
    logger.log('info', '[SHUTDOWN] Closed database connection', { tags: 'shutdown,db,server' });
    server.close();
    process.exit();
  } catch (error) {
    logger.log('error', `[SHUTDOWN] ${error.message}`, { tags: 'shutdown,server' });
    process.exit(1);
  }
};

module.exports = gracefulShutdown;
