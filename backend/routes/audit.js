/**
 * BPAP - Audit & Exceptions Routes
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { getAuditLogs } = require('../services/auditService');
const { getExceptions, saveViolations } = require('../services/validationEngine');
const { executeQuery, sql } = require('../config/db');
const { success, error, paginated } = require('../utils/response');

const analystUp = authorize('Analyst', 'Manager', 'Executive');

// GET /api/audit — full audit trail
router.get('/', authenticate, analystUp, async (req, res) => {
  const { page = 1, limit = 50, userId, action, tableName, from, to } = req.query;
  const { records, total } = await getAuditLogs({ page, limit, userId, action, tableName, from, to });
  return paginated(res, records, total, page, limit);
});

// GET /api/audit/exceptions
router.get('/exceptions', authenticate, analystUp, async (req, res) => {
  const { page = 1, limit = 50, resolved, severity, recordId } = req.query;
  const { records, total } = await getExceptions({ page, limit, resolved, severity, recordId });
  return paginated(res, records, total, page, limit);
});

// PATCH /api/audit/exceptions/:id/resolve
router.patch('/exceptions/:id/resolve', authenticate, analystUp, async (req, res) => {
  const { id } = req.params;
  await executeQuery(
    `UPDATE exceptions_log SET is_resolved = 1, resolved_by = @userId, resolved_at = GETDATE()
     WHERE exception_id = @id`,
    {
      id:     { type: sql.Int, value: parseInt(id) },
      userId: { type: sql.Int, value: req.user.user_id },
    }
  );
  return success(res, null, 'Exception marked as resolved');
});

// GET /api/audit/downtime-causes
router.get('/downtime-causes', authenticate, async (req, res) => {
  const result = await executeQuery(
    `SELECT * FROM downtime_causes WHERE is_active = 1 ORDER BY cause_name`
  );
  return success(res, result.recordset);
});

module.exports = router;
