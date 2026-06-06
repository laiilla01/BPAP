/**
 * BPAP - Production Records Controller
 * Reads from:  shared.Production_Summary (view over all finalized records)
 *              etl.Stg_BlisteringTimeSheet (staging / new entries)
 * Writes to:   etl.Stg_BlisteringTimeSheet
 */

const { executeQuery, sql } = require('../config/db');
const { logAudit } = require('../services/auditService');
const { success, created, error, paginated } = require('../utils/response');

// ── POST /api/production ──────────────────────────────────────
const createRecord = async (req, res) => {
  const data = req.body;
  const userId = req.user.user_id;

  // Duration in hours from scheduled_minutes
  const durationHours = data.scheduled_minutes
    ? parseFloat(data.scheduled_minutes) / 60
    : 8;

  // IsProductive: false only for Delay/Break/Cleaning/Maintenance processes
  const nonProductiveProcesses = ['Delay', 'Break', 'Cleaning', 'P.Maintenance'];
  const isProductive = nonProductiveProcesses.includes(data.process_type) ? 0 : 1;

  let recordId = null;
  try {
    const result = await executeQuery(
      `INSERT INTO etl.Stg_BlisteringTimeSheet (
         FullDate,
         Shift,
         RoomNo,
         MachineCode,
         ReceivedWeight,
         ProducedWeight,
         QtyBlistered,
         DelayCode,
         BatchStatus,
         SourceSchema,
         StartTime,
         EndTime,
         Duration_Raw,
         Activity,
         BatchNumber
       )
       OUTPUT INSERTED.StgKey
       VALUES (
         @shiftDate, @shift, @room, @machine,
         @received, @produced, @blister,
         @delayCode, @batchStatus, 'blistering',
         @startTime, @endTime, @duration,
         @activity, @batch
       )`,
      {
        shiftDate:   { type: sql.Date,         value: new Date(data.shift_date) },
        shift:       { type: sql.VarChar(20),   value: data.shift_number || 'Day' },
        room:        { type: sql.VarChar(10),   value: data.room },
        machine:     { type: sql.VarChar(100),  value: data.machine || '' },
        received:    { type: sql.Float,         value: parseFloat(data.planned_quantity) || 0 },
        produced:    { type: sql.Float,         value: parseFloat(data.actual_quantity)  || 0 },
        blister:     { type: sql.Float,         value: parseFloat(data.quantity_blister) || null },
        delayCode:   { type: sql.VarChar(50),   value: data.downtime_cause_name || null },
        batchStatus: { type: sql.VarChar(20),   value: data.batch_status || 'InProgress' },
        startTime:   { type: sql.VarChar(10),   value: data.start_time   || null },
        endTime:     { type: sql.VarChar(10),   value: data.end_time     || null },
        duration:    { type: sql.Float,         value: durationHours },
        activity:    { type: sql.Bit,           value: isProductive },
        batch:       { type: sql.VarChar(100),  value: data.batch_number || null },
      }
    );
    recordId = result.recordset[0]?.StgKey ?? null;
  } catch (dbErr) {
    console.error('Insert error:', dbErr.message);
    return error(res, 'Failed to save record: ' + dbErr.message, 500);
  }

  // Audit log (non-blocking)
  try {
    await logAudit({
      userId,
      action:     'INSERT',
      tableName:  'etl.Stg_BlisteringTimeSheet',
      recordId,
      description: JSON.stringify({ room: data.room, shift: data.shift_number, date: data.shift_date }),
      ipAddress:  req.ip,
    });
  } catch (_) {}

  return created(res, { record_id: recordId }, 'Production record saved');
};

// ── GET /api/production ───────────────────────────────────────
const getRecords = async (req, res) => {
  const { page = 1, limit = 20, room, from, to, search, sort = 'FullDate', order = 'DESC' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = {
    limit:  { type: sql.Int, value: parseInt(limit) },
    offset: { type: sql.Int, value: offset },
  };

  let where = `WHERE 1=1`;
  if (room)   { where += ' AND RoomCode = @room';   params.room   = { type: sql.VarChar(10),  value: room }; }
  if (from)   { where += ' AND FullDate >= @from';  params.from   = { type: sql.Date,          value: new Date(from) }; }
  if (to)     { where += ' AND FullDate <= @to';    params.to     = { type: sql.Date,          value: new Date(to) }; }
  if (search) {
    where += ' AND (MachineCode LIKE @search OR BatchNumber LIKE @search OR RoomCode LIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }

  // Safe sort columns from the view
  const SAFE_SORT = ['FullDate','RoomCode','AchievedQty','YieldPercent','ShiftCode'];
  const sortCol = SAFE_SORT.includes(sort) ? sort : 'FullDate';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  try {
    const countResult = await executeQuery(
      `SELECT COUNT(*) AS total FROM shared.Production_Summary ${where}`, params
    );

    const result = await executeQuery(
      `SELECT * FROM shared.Production_Summary
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );

    return paginated(
      res,
      result.recordset,
      countResult.recordset[0].total,
      parseInt(page),
      parseInt(limit)
    );
  } catch (dbErr) {
    console.error('getRecords error:', dbErr.message);
    return error(res, 'Failed to fetch records: ' + dbErr.message, 500);
  }
};

// ── GET /api/production/:id ───────────────────────────────────
const getRecordById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await executeQuery(
      `SELECT * FROM shared.Production_Summary WHERE ProductionKey = @id`,
      { id: { type: sql.Int, value: parseInt(id) } }
    );
    if (!result.recordset.length) return error(res, 'Record not found.', 404);
    return success(res, result.recordset[0]);
  } catch (dbErr) {
    return error(res, 'Failed to fetch record: ' + dbErr.message, 500);
  }
};

// ── PUT /api/production/:id ───────────────────────────────────
const updateRecord = async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const userId = req.user.user_id;

  try {
    const setClauses = [];
    const params = { id: { type: sql.Int, value: parseInt(id) } };

    if (data.shift_date)       { setClauses.push('FullDate = @shiftDate');   params.shiftDate  = { type: sql.Date,        value: new Date(data.shift_date) }; }
    if (data.shift_number)     { setClauses.push('Shift = @shift');          params.shift      = { type: sql.VarChar(20),  value: data.shift_number }; }
    if (data.room)             { setClauses.push('RoomNo = @room');          params.room       = { type: sql.VarChar(10),  value: data.room }; }
    if (data.machine)          { setClauses.push('MachineCode = @machine');  params.machine    = { type: sql.VarChar(100), value: data.machine }; }
    if (data.planned_quantity !== undefined) { setClauses.push('ReceivedWeight = @received'); params.received = { type: sql.Float, value: parseFloat(data.planned_quantity) }; }
    if (data.actual_quantity !== undefined)  { setClauses.push('ProducedWeight = @produced'); params.produced = { type: sql.Float, value: parseFloat(data.actual_quantity) }; }
    if (data.batch_status)     { setClauses.push('BatchStatus = @status');   params.status     = { type: sql.VarChar(20),  value: data.batch_status }; }

    if (!setClauses.length) return error(res, 'No fields to update.', 400);

    await executeQuery(
      `UPDATE etl.Stg_BlisteringTimeSheet SET ${setClauses.join(', ')} WHERE StgKey = @id`,
      params
    );

    await logAudit({ userId, action: 'UPDATE', tableName: 'etl.Stg_BlisteringTimeSheet', recordId: parseInt(id), description: JSON.stringify(data), ipAddress: req.ip }).catch(() => {});

    return success(res, { record_id: parseInt(id) }, 'Record updated');
  } catch (dbErr) {
    return error(res, 'Update failed: ' + dbErr.message, 500);
  }
};

// ── DELETE /api/production/:id ────────────────────────────────
const deleteRecord = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  try {
    // Mark as Rejected instead of hard delete
    await executeQuery(
      `UPDATE etl.Stg_BlisteringTimeSheet SET BatchStatus = 'Rejected' WHERE StgKey = @id`,
      { id: { type: sql.Int, value: parseInt(id) } }
    );
    await logAudit({ userId, action: 'DELETE', tableName: 'etl.Stg_BlisteringTimeSheet', recordId: parseInt(id), description: 'Soft delete via API', ipAddress: req.ip }).catch(() => {});
    return success(res, null, 'Record removed');
  } catch (dbErr) {
    return error(res, 'Delete failed: ' + dbErr.message, 500);
  }
};

module.exports = { createRecord, getRecords, getRecordById, updateRecord, deleteRecord };
