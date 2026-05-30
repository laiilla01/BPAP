/**
 * BPAP - Audit Trail Service
 * Every INSERT/UPDATE/DELETE is logged here.
 * The audit_logs table is append-only — never update or delete from it.
 */

const { executeQuery, sql } = require('../config/db');
const logger = require('../utils/logger');

/**
 * Write an audit entry
 * @param {Object} options
 * @param {number} options.userId
 * @param {string} options.action  - INSERT | UPDATE | DELETE | LOGIN | LOGOUT | EXPORT
 * @param {string} options.tableName
 * @param {number} [options.recordId]
 * @param {string} [options.fieldName]
 * @param {any}    [options.oldValue]
 * @param {any}    [options.newValue]
 * @param {string} [options.ipAddress]
 * @param {string} [options.userAgent]
 */
const logAudit = async ({
  userId,
  action,
  tableName,
  recordId = null,
  fieldName = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  userAgent = null,
}) => {
  try {
    await executeQuery(
      `INSERT INTO audit_logs
        (user_id, action, table_name, record_id, field_name, old_value, new_value, ip_address, user_agent)
       VALUES
        (@userId, @action, @tableName, @recordId, @fieldName, @oldValue, @newValue, @ipAddress, @userAgent)`,
      {
        userId:    { type: sql.Int,          value: userId },
        action:    { type: sql.VarChar(20),  value: action },
        tableName: { type: sql.VarChar(100), value: tableName },
        recordId:  { type: sql.Int,          value: recordId },
        fieldName: { type: sql.VarChar(100), value: fieldName },
        oldValue:  { type: sql.NVarChar(sql.MAX), value: oldValue !== null ? String(oldValue) : null },
        newValue:  { type: sql.NVarChar(sql.MAX), value: newValue !== null ? String(newValue) : null },
        ipAddress: { type: sql.VarChar(50),  value: ipAddress },
        userAgent: { type: sql.VarChar(300), value: userAgent ? userAgent.substring(0, 299) : null },
      }
    );
  } catch (err) {
    // Audit failures should never crash the main request
    logger.error('Audit log failed:', err.message);
  }
};

/**
 * Get audit logs with pagination + filters
 */
const getAuditLogs = async ({ page = 1, limit = 50, userId, action, tableName, from, to }) => {
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = {
    limit:  { type: sql.Int, value: parseInt(limit) },
    offset: { type: sql.Int, value: parseInt(offset) },
  };

  if (userId) {
    where += ' AND al.user_id = @filterUserId';
    params.filterUserId = { type: sql.Int, value: parseInt(userId) };
  }
  if (action) {
    where += ' AND al.action = @filterAction';
    params.filterAction = { type: sql.VarChar(20), value: action };
  }
  if (tableName) {
    where += ' AND al.table_name = @filterTable';
    params.filterTable = { type: sql.VarChar(100), value: tableName };
  }
  if (from) {
    where += ' AND al.timestamp >= @fromDate';
    params.fromDate = { type: sql.DateTime2, value: new Date(from) };
  }
  if (to) {
    where += ' AND al.timestamp <= @toDate';
    params.toDate = { type: sql.DateTime2, value: new Date(to) };
  }

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM audit_logs al ${where}`,
    params
  );

  const result = await executeQuery(
    `SELECT al.*, u.username, u.full_name
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     ${where}
     ORDER BY al.timestamp DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params
  );

  return {
    records: result.recordset,
    total: countResult.recordset[0].total,
  };
};

module.exports = { logAudit, getAuditLogs };
