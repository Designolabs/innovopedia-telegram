const { createLogger, format, transports } = require('winston');
const config = require('../config');

const { combine, timestamp, printf, colorize } = format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}]: ${message}${metaString}`;
});

// Create logger instance
const logger = createLogger({
  level: config.logging.level,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize(),
    consoleFormat
  ),
  transports: [
    new transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// Create a stream for morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
