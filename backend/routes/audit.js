/**
 * BPAP - Audit Routes
 * Uses: audit_log table, dbo.DelayDetails lookup
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { getAuditLogs } = require('../services/auditService');
const { executeQuery, sql } = require('../config/db');
const { success, error, paginated } = require('../utils/response');

const analystUp = authorize('Analyst', 'Manager', 'Executive');

// GET /api/audit — audit trail
router.get('/', authenticate, analystUp, async (req, res) => {
  const { page = 1, limit = 50, userId, action, from, to } = req.query;
  const { records, total } = await getAuditLogs({ page, limit, userId, action, from, to });
  return paginated(res, records, total, page, limit);
});

// GET /api/audit/exceptions — stub (no exceptions_log in NEW_Production)
router.get('/exceptions', authenticate, analystUp, async (req, res) => {
  return success(res, [], 'No exceptions log in this database.');
});

// GET /api/audit/downtime-causes — from dbo.DelayDetails
router.get('/downtime-causes', authenticate, async (req, res) => {
  try {
    const result = await executeQuery(
      `SELECT DISTINCT
         DelayCode      AS cause_id,
         DelayCode      AS cause_name,
         DelayCategory  AS category,
         DelayGroup     AS delay_group
       FROM dbo.DelayDetails
       WHERE DelayCode IS NOT NULL AND LTRIM(RTRIM(DelayCode)) <> ''
       ORDER BY DelayCategory, DelayCode`
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    // Fallback: static list so the frontend never breaks
    return success(res, [
      { cause_id: 'MECH', cause_name: 'Machine technical failure', category: 'Technical' },
      { cause_id: 'MAT',  cause_name: 'Raw material delay',        category: 'Supply' },
      { cause_id: 'SHIFT',cause_name: 'Shift change',              category: 'Operational' },
      { cause_id: 'RECAL',cause_name: 'Recalibration',             category: 'Technical' },
      { cause_id: 'QA',   cause_name: 'Waiting Q.A Department',    category: 'Quality' },
      { cause_id: 'OTHER',cause_name: 'Other',                     category: 'Other' },
    ]);
  }
});

module.exports = router;
