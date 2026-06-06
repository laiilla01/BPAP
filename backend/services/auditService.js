/**
 * BPAP - Audit Service
 * Logs to dbo.audit_log table in NEW_Production
 */

const { executeQuery, sql } = require('../config/db');

/**
 * Log an action to audit_log
 */
const logAudit = async ({ userId, action, tableName = null, recordId = null, description = null, ipAddress = null }) => {
  try {
    await executeQuery(
      `INSERT INTO audit_log (user_id, action, table_name, record_id, description, ip_address)
       VALUES (@userId, @action, @tableName, @recordId, @description, @ip)`,
      {
        userId:      { type: sql.Int,               value: userId },
        action:      { type: sql.VarChar(20),        value: action },
        tableName:   { type: sql.VarChar(100),       value: tableName },
        recordId:    { type: sql.Int,                value: recordId },
        description: { type: sql.NVarChar(sql.MAX),  value: description },
        ip:          { type: sql.VarChar(50),         value: ipAddress },
      }
    );
  } catch (err) {
    // Audit failure must never crash the main operation
    console.warn('Audit log failed (non-fatal):', err.message);
  }
};

/**
 * Get audit logs (paginated)
 */
const getAuditLogs = async ({ page = 1, limit = 50, userId, action, from, to } = {}) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = {
    limit:  { type: sql.Int, value: parseInt(limit) },
    offset: { type: sql.Int, value: offset },
  };

  let where = `WHERE 1=1`;
  if (userId) { where += ' AND al.user_id = @uid';     params.uid    = { type: sql.Int,          value: parseInt(userId) }; }
  if (action) { where += ' AND al.action = @action';   params.action = { type: sql.VarChar(20),  value: action }; }
  if (from)   { where += ' AND al.timestamp >= @from'; params.from   = { type: sql.DateTime2,    value: new Date(from) }; }
  if (to)     { where += ' AND al.timestamp <= @to';   params.to     = { type: sql.DateTime2,    value: new Date(to) }; }

  try {
    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM audit_log al ${where}`, params
    );
    const result = await executeQuery(
      `SELECT al.*, u.username, u.full_name
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${where}
       ORDER BY al.timestamp DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    return { records: result.recordset, total: countResult.recordset[0].total };
  } catch (err) {
    return { records: [], total: 0 };
  }
};

module.exports = { logAudit, getAuditLogs };
