/**
 * BPAP - JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Verify JWT access token
 * Attaches decoded user to req.user
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return error(res, 'Access denied. No token provided.', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Token expired. Please login again.', 401);
    }
    return error(res, 'Invalid token.', 403);
  }
};

module.exports = { authenticate };
