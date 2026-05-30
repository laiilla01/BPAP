/**
 * BPAP - HTTP Request Logger (Morgan → Winston)
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

// Stream morgan output to winston
const stream = {
  write: (message) => logger.info(message.trim()),
};

const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms | :remote-addr',
  { stream }
);

module.exports = requestLogger;
