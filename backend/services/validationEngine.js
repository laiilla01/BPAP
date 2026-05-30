/**
 * BPAP - Exception & Validation Engine
 *
 * Detects logical inconsistencies and range violations
 * before and after data is saved. Violations are stored
 * in exceptions_log.
 */

const { executeQuery, sql } = require('../config/db');
const logger = require('../utils/logger');

const VALID_ROOMS   = ['B1', 'B3', 'B4', 'B5', 'B6', 'B7'];
const VALID_SHIFTS  = ['Day', 'Night', 'Day-Off'];
const VALID_MARKETS = ['Local', 'Export (Europe)', 'Export (Middle East)', 'Export (Africa)'];
const VALID_PROCESS = [
  'Adjustment', 'Blistering', 'Cleaning', 'Line Clearence',
  'Delay', 'Discharging,Weighing & Finalizing', 'Sorting',
  'DE-Blister', 'Break', 'P.Maintenance', 'Polisher',
];

/**
 * Validate a production record object
 * Returns array of violations (empty = no issues)
 * @param {Object} data - raw input
 * @returns {Array} violations
 */
const validateRecord = (data) => {
  const violations = [];

  const {
    room, machine, shift_date, shift_number,
    planned_quantity, actual_quantity, rejected_quantity,
    downtime_minutes, scheduled_minutes = 480,
    operator_name,
  } = data;

  // ── Missing required values ───────────────────────────────
  if (!room)           violations.push({ type: 'missing_value', field: 'room',          description: 'Room is required', severity: 'Error' });
  if (!machine)        violations.push({ type: 'missing_value', field: 'machine',        description: 'Machine is required', severity: 'Error' });
  if (!shift_date)     violations.push({ type: 'missing_value', field: 'shift_date',     description: 'Shift date is required', severity: 'Error' });
  if (!shift_number)   violations.push({ type: 'missing_value', field: 'shift_number',   description: 'Shift number is required', severity: 'Error' });
  if (!operator_name)  violations.push({ type: 'missing_value', field: 'operator_name',  description: 'Operator name is required', severity: 'Error' });
  if (planned_quantity === undefined || planned_quantity === null)
    violations.push({ type: 'missing_value', field: 'planned_quantity', description: 'Planned quantity is required', severity: 'Error' });
  if (actual_quantity === undefined || actual_quantity === null)
    violations.push({ type: 'missing_value', field: 'actual_quantity', description: 'Actual quantity is required', severity: 'Error' });

  // ── Invalid reference / enum values ──────────────────────
  if (room && !VALID_ROOMS.includes(room))
    violations.push({ type: 'invalid_reference', field: 'room', description: `Room '${room}' is not a valid blistering room. Valid: ${VALID_ROOMS.join(', ')}`, severity: 'Error' });
  if (shift_number && !VALID_SHIFTS.includes(shift_number))
    violations.push({ type: 'invalid_reference', field: 'shift_number', description: `Shift '${shift_number}' is invalid. Valid: ${VALID_SHIFTS.join(', ')}`, severity: 'Error' });

  // ── Date format ────────────────────────────────────────────
  if (shift_date) {
    const parsed = new Date(shift_date);
    if (isNaN(parsed.getTime())) {
      violations.push({ type: 'format_error', field: 'shift_date', description: 'Shift date is not a valid date', severity: 'Error' });
    } else if (parsed > new Date()) {
      violations.push({ type: 'range_violation', field: 'shift_date', description: 'Shift date cannot be in the future', severity: 'Warning' });
    }
  }

  // ── Numeric range checks ───────────────────────────────────
  if (planned_quantity !== undefined && planned_quantity <= 0)
    violations.push({ type: 'range_violation', field: 'planned_quantity', description: 'Planned quantity must be > 0', severity: 'Error' });
  if (actual_quantity !== undefined && actual_quantity < 0)
    violations.push({ type: 'range_violation', field: 'actual_quantity', description: 'Actual quantity cannot be negative', severity: 'Error' });
  if (rejected_quantity !== undefined && rejected_quantity < 0)
    violations.push({ type: 'range_violation', field: 'rejected_quantity', description: 'Rejected quantity cannot be negative', severity: 'Error' });
  if (downtime_minutes !== undefined && (downtime_minutes < 0 || downtime_minutes > scheduled_minutes))
    violations.push({ type: 'range_violation', field: 'downtime_minutes', description: `Downtime (${downtime_minutes} min) cannot exceed scheduled time (${scheduled_minutes} min)`, severity: 'Error' });

  // ── Logical consistency checks ────────────────────────────
  if (actual_quantity !== undefined && rejected_quantity !== undefined) {
    if (rejected_quantity > actual_quantity) {
      violations.push({
        type: 'logical_inconsistency',
        field: 'rejected_quantity',
        description: `Rejected (${rejected_quantity}) cannot exceed Actual (${actual_quantity})`,
        severity: 'Error',
      });
    }
  }

  // Efficiency sanity check — actual > 2x planned is suspicious
  if (actual_quantity && planned_quantity && actual_quantity > planned_quantity * 2) {
    violations.push({
      type: 'range_violation',
      field: 'actual_quantity',
      description: `Actual quantity (${actual_quantity}) is more than double planned (${planned_quantity}). Please verify.`,
      severity: 'Warning',
    });
  }

  return violations;
};

/**
 * Save detected violations to exceptions_log table
 */
const saveViolations = async (violations, recordId = null) => {
  for (const v of violations) {
    try {
      await executeQuery(
        `INSERT INTO exceptions_log (record_id, exception_type, field_name, description, severity)
         VALUES (@recordId, @type, @field, @description, @severity)`,
        {
          recordId:    { type: sql.Int,           value: recordId },
          type:        { type: sql.VarChar(50),   value: v.type },
          field:       { type: sql.VarChar(100),  value: v.field || null },
          description: { type: sql.NVarChar(500), value: v.description },
          severity:    { type: sql.VarChar(10),   value: v.severity || 'Warning' },
        }
      );
    } catch (err) {
      logger.error('Failed to save exception:', err.message);
    }
  }
};

/**
 * Get all exceptions with filters
 */
const getExceptions = async ({ page = 1, limit = 50, resolved, severity, recordId }) => {
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = {
    limit:  { type: sql.Int, value: parseInt(limit) },
    offset: { type: sql.Int, value: parseInt(offset) },
  };

  if (resolved !== undefined) {
    where += ' AND e.is_resolved = @resolved';
    params.resolved = { type: sql.Bit, value: resolved === 'true' ? 1 : 0 };
  }
  if (severity) {
    where += ' AND e.severity = @severity';
    params.severity = { type: sql.VarChar(10), value: severity };
  }
  if (recordId) {
    where += ' AND e.record_id = @recordId';
    params.recordId = { type: sql.Int, value: parseInt(recordId) };
  }

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM exceptions_log e ${where}`, params
  );

  const result = await executeQuery(
    `SELECT e.*, u.username AS resolved_by_username
     FROM exceptions_log e
     LEFT JOIN users u ON e.resolved_by = u.user_id
     ${where}
     ORDER BY e.created_at DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params
  );

  return { records: result.recordset, total: countResult.recordset[0].total };
};

module.exports = { validateRecord, saveViolations, getExceptions };
