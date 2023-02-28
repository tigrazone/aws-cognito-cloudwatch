/* eslint-disable consistent-return */
/* eslint-disable max-len */
/* eslint-disable no-param-reassign */

const compression = require('compression');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const stoppable = require('stoppable');

const logger = require('./app/config/logger');
const gracefulShutdown = require('./app/utils/graceful-shutdown');

const app = express();

// compressed content
// eslint-disable-next-line no-use-before-define
app.use(compression({ filter: shouldCompress }));

// disable `X-Powered-By` header that reveals information about the server
app.disable('x-powered-by');

// set security HTTP headers
app.use(helmet());

app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

function shouldCompress(req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false;
  }

  // fallback to standard filter function
  return compression.filter(req, res);
}

const db = require('./app/models');

db.sequelize.sync()
  .then(() => {
    logger.log('info', '[STARTUP] Synced db', { tags: 'startup,db' });
  })
  .catch(err => {
    logger.log('error', `Failed to sync db: ${err.message}`, { tags: 'startup,db' });
  });

app.use(morgan(
  'combined',
  {
    write(message) {
      logger.info(message.substring(0, message.lastIndexOf('\n')));
    },
    skip() {
      return process.env.NODE_ENV === 'test';
    },
  },
));

// health check route
app.get('/health_checks', (req, res) => {
  const data = {
    uptime: process.uptime(),
    message: 'Ok',
    date: new Date(),
  };

  res.json({ data });
});

// api/dashboard routes
require('./app/routes/api_dashboard.routes')(app);
require('./app/routes/api_auth.routes')(app);

// Custom server error handler
app.use((err, req, res, next) => {
  if (err) {
    logger.log('error', err.message, { tags: 'server' });

    if (!err.statusCode) { err.statusCode = 500; } // Set 500 server code error if statuscode not set

    return res.status(err.statusCode).send({
      statusCode: err.statusCode,
      message: err.message,
    });
  }

  next();
});

// set port, listen for requests
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.log('info', `[STARTUP] Server is running on port ${PORT}.`, { tags: 'startup,server' });
});

// In case of an error
app.on('error', (appErr, appCtx) => {
  logger.error(`App Error: '${appErr.stack}' on url: '${appCtx.req.url}' with headers: '${appCtx.req.headers}'`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async err => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(err.name, err.message);
  logger.error(`unhandledRejection Stack: ${JSON.stringify(err.stack)}`);

  await gracefulShutdown(stoppable(server));
});

// Handle uncaught exceptions
process.on('uncaughtException', async uncaughtExc => {
  // Won't execute
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(`UncaughtException Error: ${uncaughtExc}`);
  logger.error(`UncaughtException Stack: ${JSON.stringify(uncaughtExc.stack)}`);

  await gracefulShutdown(stoppable(server));
});

// quit on ctrl+c
process.on('SIGINT', async () => {
  logger.warn('Got SIGINT (aka ctrl+c). Graceful shutdown');

  await gracefulShutdown(stoppable(server));
});

// quit properly
process.on('SIGTERM', async () => {
  logger.warn('Got SIGTERM => Graceful shutdown');

  await gracefulShutdown(stoppable(server));
});
