/**
 * BPAP - Production Records Controller
 * Handles CRUD for production_records with validation + audit trail
 */

const { executeQuery, sql } = require('../config/db');
const { calculateKPIs } = require('../services/kpiService');
const { validateRecord, saveViolations } = require('../services/validationEngine');
const { logAudit } = require('../services/auditService');
const { success, created, error, paginated } = require('../utils/response');

// ── POST /api/production ──────────────────────────────────
const createRecord = async (req, res) => {
  const data = req.body;
  const userId = req.user.user_id;

  // 1. Run validation engine
  const violations = validateRecord(data);
  const hasErrors = violations.some((v) => v.severity === 'Error');

  if (hasErrors) {
    // Save violations even for rejected records
    await saveViolations(violations, null);
    return error(res, 'Validation failed. Record not saved.', 422,
      violations.filter(v => v.severity === 'Error')
    );
  }

  // 2. Calculate KPIs
  const kpis = calculateKPIs({
    ...data,
    scheduled_minutes: data.scheduled_minutes || 480,
  });

  // 3. Resolve downtime_cause_id if cause name provided
  let causeId = data.downtime_cause_id || null;
  if (!causeId && data.downtime_cause_name) {
    const causeResult = await executeQuery(
      `SELECT cause_id FROM downtime_causes WHERE cause_name = @name`,
      { name: { type: sql.VarChar(100), value: data.downtime_cause_name } }
    );
    causeId = causeResult.recordset[0]?.cause_id || null;
  }

  // 4. Insert record
  const result = await executeQuery(
    `INSERT INTO production_records (
       room, machine, shift_date, shift_number, day_of_week, market_type,
       planned_quantity, actual_quantity, rejected_quantity,
       downtime_minutes, scheduled_minutes, downtime_cause_id, downtime_notes,
       process_type, activity_type, feeder_active,
       operator_name, operator_id,
       production_efficiency, defect_rate, downtime_percentage, oee
     )
     OUTPUT INSERTED.record_id
     VALUES (
       @room, @machine, @shiftDate, @shiftNum, @dayOfWeek, @marketType,
       @planned, @actual, @rejected,
       @downtime, @scheduled, @causeId, @notes,
       @process, @activity, @feeder,
       @operatorName, @operatorId,
       @efficiency, @defectRate, @downtimePct, @oee
     )`,
    {
      room:         { type: sql.VarChar(10),       value: data.room },
      machine:      { type: sql.VarChar(50),        value: data.machine },
      shiftDate:    { type: sql.Date,               value: new Date(data.shift_date) },
      shiftNum:     { type: sql.VarChar(10),        value: data.shift_number },
      dayOfWeek:    { type: sql.VarChar(10),        value: data.day_of_week || null },
      marketType:   { type: sql.VarChar(50),        value: data.market_type || null },
      planned:      { type: sql.Int,                value: parseInt(data.planned_quantity) },
      actual:       { type: sql.Int,                value: parseInt(data.actual_quantity) },
      rejected:     { type: sql.Int,                value: parseInt(data.rejected_quantity || 0) },
      downtime:     { type: sql.Int,                value: parseInt(data.downtime_minutes || 0) },
      scheduled:    { type: sql.Int,                value: parseInt(data.scheduled_minutes || 480) },
      causeId:      { type: sql.Int,                value: causeId },
      notes:        { type: sql.NVarChar(500),      value: data.downtime_notes || null },
      process:      { type: sql.VarChar(100),       value: data.process_type || null },
      activity:     { type: sql.VarChar(100),       value: data.activity_type || null },
      feeder:       { type: sql.Bit,                value: data.feeder_active ?? null },
      operatorName: { type: sql.VarChar(150),       value: data.operator_name },
      operatorId:   { type: sql.Int,                value: userId },
      efficiency:   { type: sql.Decimal(10, 4),     value: kpis.production_efficiency },
      defectRate:   { type: sql.Decimal(10, 4),     value: kpis.defect_rate },
      downtimePct:  { type: sql.Decimal(10, 4),     value: kpis.downtime_percentage },
      oee:          { type: sql.Decimal(10, 4),     value: kpis.oee },
    }
  );

  const recordId = result.recordset[0].record_id;

  // 5. Save any warnings (non-blocking)
  const warnings = violations.filter(v => v.severity !== 'Error');
  if (warnings.length) await saveViolations(warnings, recordId);

  // 6. Audit trail
  await logAudit({
    userId,
    action:    'INSERT',
    tableName: 'production_records',
    recordId,
    newValue:  JSON.stringify({ ...data, ...kpis }),
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return created(res, { record_id: recordId, kpis, warnings }, 'Production record saved');
};

// ── GET /api/production ───────────────────────────────────
const getRecords = async (req, res) => {
  const {
    page = 1, limit = 20,
    room, shift_number, from, to,
    operator_id, search, sort = 'shift_date', order = 'DESC',
    status,
  } = req.query;

  const offset = (page - 1) * limit;
  const params = {
    limit:  { type: sql.Int, value: parseInt(limit) },
    offset: { type: sql.Int, value: parseInt(offset) },
  };

  let where = `WHERE pr.is_deleted = 0`;

  // Operators can only see their own records
  if (req.user.role === 'Operator') {
    where += ' AND pr.operator_id = @selfId';
    params.selfId = { type: sql.Int, value: req.user.user_id };
  }

  if (room)      { where += ' AND pr.room = @room';         params.room      = { type: sql.VarChar(10), value: room }; }
  if (shift_number) { where += ' AND pr.shift_number = @shift'; params.shift  = { type: sql.VarChar(10), value: shift_number }; }
  if (from)      { where += ' AND pr.shift_date >= @from';   params.from      = { type: sql.Date, value: new Date(from) }; }
  if (to)        { where += ' AND pr.shift_date <= @to';     params.to        = { type: sql.Date, value: new Date(to) }; }
  if (operator_id) { where += ' AND pr.operator_id = @opId'; params.opId     = { type: sql.Int, value: parseInt(operator_id) }; }
  if (status)    { where += ' AND pr.data_status = @status'; params.status    = { type: sql.VarChar(20), value: status }; }
  if (search) {
    where += ' AND (pr.machine LIKE @search OR pr.operator_name LIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }

  // Whitelist sort columns
  const SORT_COLS = ['shift_date', 'room', 'actual_quantity', 'oee', 'created_at'];
  const sortCol = SORT_COLS.includes(sort) ? sort : 'shift_date';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countResult = await executeQuery(
    `SELECT COUNT(*) AS total FROM production_records pr ${where}`, params
  );

  const result = await executeQuery(
    `SELECT pr.*, u.full_name AS operator_full_name, dc.cause_name AS downtime_cause_name
     FROM production_records pr
     LEFT JOIN users u ON pr.operator_id = u.user_id
     LEFT JOIN downtime_causes dc ON pr.downtime_cause_id = dc.cause_id
     ${where}
     ORDER BY pr.${sortCol} ${sortDir}
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params
  );

  return paginated(
    res,
    result.recordset,
    countResult.recordset[0].total,
    page,
    limit
  );
};

// ── GET /api/production/:id ───────────────────────────────
const getRecordById = async (req, res) => {
  const { id } = req.params;

  const result = await executeQuery(
    `SELECT pr.*, u.full_name AS operator_full_name, u.username,
            dc.cause_name AS downtime_cause_name, r.role_name
     FROM production_records pr
     LEFT JOIN users u ON pr.operator_id = u.user_id
     LEFT JOIN users r2 ON pr.operator_id = r2.user_id
     LEFT JOIN roles r ON r2.role_id = r.role_id
     LEFT JOIN downtime_causes dc ON pr.downtime_cause_id = dc.cause_id
     WHERE pr.record_id = @id AND pr.is_deleted = 0`,
    { id: { type: sql.Int, value: parseInt(id) } }
  );

  if (!result.recordset.length) return error(res, 'Record not found.', 404);

  // Operators can only view their own
  const record = result.recordset[0];
  if (req.user.role === 'Operator' && record.operator_id !== req.user.user_id) {
    return error(res, 'Access denied.', 403);
  }

  return success(res, record);
};

// ── PUT /api/production/:id ───────────────────────────────
const updateRecord = async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const userId = req.user.user_id;

  // Fetch existing
  const existing = await executeQuery(
    `SELECT * FROM production_records WHERE record_id = @id AND is_deleted = 0`,
    { id: { type: sql.Int, value: parseInt(id) } }
  );
  if (!existing.recordset.length) return error(res, 'Record not found.', 404);

  const old = existing.recordset[0];

  // Operators can only edit their own
  if (req.user.role === 'Operator' && old.operator_id !== userId) {
    return error(res, 'Access denied.', 403);
  }

  // Recalculate KPIs with updated values
  const merged = { ...old, ...data };
  const violations = validateRecord(merged);
  const hasErrors = violations.some(v => v.severity === 'Error');
  if (hasErrors) return error(res, 'Validation failed.', 422, violations.filter(v => v.severity === 'Error'));

  const kpis = calculateKPIs(merged);

  await executeQuery(
    `UPDATE production_records SET
       room = @room, machine = @machine, shift_date = @shiftDate,
       shift_number = @shiftNum, planned_quantity = @planned,
       actual_quantity = @actual, rejected_quantity = @rejected,
       downtime_minutes = @downtime, downtime_notes = @notes,
       process_type = @process, activity_type = @activity,
       operator_name = @opName,
       production_efficiency = @efficiency, defect_rate = @defectRate,
       downtime_percentage = @downtimePct, oee = @oee,
       updated_at = GETDATE()
     WHERE record_id = @id`,
    {
      id:          { type: sql.Int,            value: parseInt(id) },
      room:        { type: sql.VarChar(10),    value: merged.room },
      machine:     { type: sql.VarChar(50),    value: merged.machine },
      shiftDate:   { type: sql.Date,           value: new Date(merged.shift_date) },
      shiftNum:    { type: sql.VarChar(10),    value: merged.shift_number },
      planned:     { type: sql.Int,            value: parseInt(merged.planned_quantity) },
      actual:      { type: sql.Int,            value: parseInt(merged.actual_quantity) },
      rejected:    { type: sql.Int,            value: parseInt(merged.rejected_quantity || 0) },
      downtime:    { type: sql.Int,            value: parseInt(merged.downtime_minutes || 0) },
      notes:       { type: sql.NVarChar(500),  value: merged.downtime_notes || null },
      process:     { type: sql.VarChar(100),   value: merged.process_type || null },
      activity:    { type: sql.VarChar(100),   value: merged.activity_type || null },
      opName:      { type: sql.VarChar(150),   value: merged.operator_name },
      efficiency:  { type: sql.Decimal(10, 4), value: kpis.production_efficiency },
      defectRate:  { type: sql.Decimal(10, 4), value: kpis.defect_rate },
      downtimePct: { type: sql.Decimal(10, 4), value: kpis.downtime_percentage },
      oee:         { type: sql.Decimal(10, 4), value: kpis.oee },
    }
  );

  // Audit each changed field
  for (const key of Object.keys(data)) {
    if (old[key] !== undefined && String(old[key]) !== String(data[key])) {
      await logAudit({
        userId, action: 'UPDATE', tableName: 'production_records',
        recordId: parseInt(id), fieldName: key,
        oldValue: old[key], newValue: data[key],
        ipAddress: req.ip,
      });
    }
  }

  return success(res, { record_id: parseInt(id), kpis }, 'Record updated');
};

// ── DELETE /api/production/:id (soft delete) ──────────────
const deleteRecord = async (req, res) => {
  const { id } = req.params;

  const existing = await executeQuery(
    `SELECT * FROM production_records WHERE record_id = @id AND is_deleted = 0`,
    { id: { type: sql.Int, value: parseInt(id) } }
  );
  if (!existing.recordset.length) return error(res, 'Record not found.', 404);

  const old = existing.recordset[0];

  await executeQuery(
    `UPDATE production_records SET is_deleted = 1, updated_at = GETDATE() WHERE record_id = @id`,
    { id: { type: sql.Int, value: parseInt(id) } }
  );

  await logAudit({
    userId:    req.user.user_id,
    action:    'DELETE',
    tableName: 'production_records',
    recordId:  parseInt(id),
    oldValue:  JSON.stringify(old),
    ipAddress: req.ip,
  });

  return success(res, null, 'Record deleted');
};

module.exports = { createRecord, getRecords, getRecordById, updateRecord, deleteRecord };
