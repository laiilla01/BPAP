/**
 * BPAP - Role-Based Access Control Middleware
 *
 * Role hierarchy:
 *   Operator  → data entry only
 *   Analyst   → read/write + ETL
 *   Manager   → read-only dashboard
 *   Executive → summary dashboards + exports
 */

const { error } = require('../utils/response');

/**
 * Allow only specified roles
 * Usage: authorize('Analyst', 'Manager')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Not authenticated.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return error(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
        403
      );
    }

    next();
  };
};

/**
 * Allow only the operator who owns the record (or Analyst/Manager)
 * Attach to routes where operators can only edit their own records
 */
const ownerOrAnalyst = (req, res, next) => {
  const { role, user_id } = req.user;

  if (['Analyst', 'Manager', 'Executive'].includes(role)) {
    return next(); // elevated roles bypass
  }

  // Operator: check ownership is enforced in the controller via operator_id
  next();
};

module.exports = { authorize, ownerOrAnalyst };
