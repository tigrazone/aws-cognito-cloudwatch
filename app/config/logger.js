require('dotenv').config();

const winston = require('winston');
const CloudWatchTransport = require('winston-aws-cloudwatch');

const NODE_ENV = process.env.NODE_ENV || 'development';

const logger = winston.createLogger({
  transports: [
    new (winston.transports.Console)({
      timestamp: true,
      colorize: true,
    }),
  ],
  exitOnError: false, // do not exit on handled exceptions
});

const config = {
  logGroupName: process.env.CLOUDWATCH_GROUP_NAME,
  logStreamName: process.env.CLOUDWATCH_STREAM_NAME,
  createLogGroup: false,
  createLogStream: false,
  submissionInterval: 2000,
  submissionRetryCount: 1,
  batchSize: 20,
  awsConfig: {
    accessKeyId: process.env.CLOUDWATCH_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDWATCH_SECRET_ACCESS_KEY,
    region: process.env.CLOUDWATCH_REGION,
  },
  formatLog(item) {
    return `${item.level}: ${item.message} ${JSON.stringify(item.meta)}`;
  },
};

if (NODE_ENV !== 'development') logger.add(CloudWatchTransport, config);

logger.level = process.env.LOG_LEVEL || 'silly';

logger.stream = {
  // eslint-disable-next-line no-unused-vars
  write(message, encoding) {
    logger.info(message);
  },
};

module.exports = logger;
