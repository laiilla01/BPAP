/**
 * BPAP - Production Records Controller
 */

const { executeQuery, sql } = require('../config/db');
const { logAudit } = require('../services/auditService');
const { success, created, error, paginated } = require('../utils/response');

// ── POST /api/production ──────────────────────────────────────
const createRecord = async (req, res) => {
  const data = req.body;
  const userId = req.user?.user_id ?? 0;

  const durationHours = data.scheduled_minutes
    ? parseFloat(data.scheduled_minutes) / 60
    : 8;

  const nonProductiveProcesses = ['Delay', 'Break', 'Cleaning', 'P.Maintenance'];
  const isProductive = nonProductiveProcesses.includes(data.process_type) ? 'N' : 'Y';

  // Split employees
  const employees = (data.operator_name || '').split(',').map(e => e.trim());

  let recordId = null;
  try {
    const result = await executeQuery(
      `INSERT INTO etl.Stg_BlisteringTimeSheet (
        Shift,
        Day,
        Date_Raw,
        ProductName,
        ProductCode,
        BatchNumber,
        ProcessCode,
        Activity,
        RoomNo,
        MachineCode,
        Feeder,
        StartTime_Raw,
        EndTime_Raw,
        Duration_Raw,
        AchievedStatus,
        Market,
        ReceivedQty,
        AchievedQty,
        WasteQty,
        QtyBlistered,
        YieldPercent,
        DelayDescription,
        DelayCode,
        DelayCategory,
        DelayGroup,
        DelayCause,
        Notes,
        OverTime_Raw,
        NightShift_Raw,
        Overlap,
        Employee1,
        Employee2,
        Employee3,
        Employee4,
        Employee5
      )
      OUTPUT INSERTED.StgKey
      VALUES (
        @shift, @day, @date, @productName, @productCode,
        @batch, @processCode, @activity, @room, @machine,
        @feeder, @startTime, @endTime, @duration,
        @achieved, @market,
        @received, @produced, @waste, @blister, @yieldPct,
        @delayDesc, @delayCode, @delayCategory, @delayGroup,
        @delayCause, @notes,
        @overtime, @nightshift, @overlap,
        @emp1, @emp2, @emp3, @emp4, @emp5
      )`,
      {
        shift:         { type: sql.VarChar(20),  value: data.shift_number   || 'Day' },
        day:           { type: sql.VarChar(10),  value: data.day_of_week    || null },
        date:          { type: sql.Date,          value: new Date(data.shift_date) },
        productName:   { type: sql.NVarChar(200), value: data.product_name  || null },
        productCode:   { type: sql.VarChar(50),  value: data.product_code   || null },
        batch:         { type: sql.VarChar(100), value: data.batch_number   || null },
        processCode:   { type: sql.VarChar(100), value: data.process_type   || null },
        activity:      { type: sql.VarChar(100), value: data.activity_type  || null },
        room:          { type: sql.VarChar(10),  value: data.room },
        machine:       { type: sql.VarChar(100), value: data.machine        || null },
        feeder:        { type: sql.VarChar(20),  value: data.feeder_active ? 'Automatic' : 'Manual' },
        startTime:     { type: sql.VarChar(10),  value: data.start_time     || null },
        endTime:       { type: sql.VarChar(10),  value: data.end_time       || null },
        duration:      { type: sql.Float,         value: durationHours },
        achieved:      { type: sql.VarChar(5),   value: isProductive },
        market:        { type: sql.VarChar(100), value: data.market_type    || null },
        received:      { type: sql.Float,         value: parseFloat(data.planned_quantity)  || 0 },
        produced:      { type: sql.Float,         value: parseFloat(data.actual_quantity)   || 0 },
        waste:         { type: sql.Float,         value: parseFloat(data.planned_quantity) - parseFloat(data.actual_quantity) || 0 },
        blister:       { type: sql.Float,         value: parseFloat(data.quantity_blister)  || null },
        yieldPct:      { type: sql.Float,         value: data.planned_quantity > 0
                            ? (parseFloat(data.actual_quantity) / parseFloat(data.planned_quantity)) * 100
                            : null },
        delayDesc:     { type: sql.NVarChar(200), value: data.downtime_cause_name || null },
        delayCode:     { type: sql.VarChar(50),  value: data.delay_code     || 'N/A' },
        delayCategory: { type: sql.VarChar(100), value: data.delay_category || null },
        delayGroup:    { type: sql.VarChar(100), value: data.delay_group    || null },
        delayCause:    { type: sql.NVarChar(500), value: data.downtime_notes || null },
        notes:         { type: sql.NVarChar(500), value: data.downtime_notes || null },
        overtime:      { type: sql.Int, value: data.overtime_minutes   || 0 },
        nightshift:    { type: sql.Int, value: data.nightshift_minutes || 0 },
        overlap:       { type: sql.Int, value: data.overlap_minutes    || 0 },
        emp1:          { type: sql.NVarChar(100), value: employees[0] || null },
        emp2:          { type: sql.NVarChar(100), value: employees[1] || null },
        emp3:          { type: sql.NVarChar(100), value: employees[2] || null },
        emp4:          { type: sql.NVarChar(100), value: employees[3] || null },
        emp5:          { type: sql.NVarChar(100), value: employees[4] || null },
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
      action:      'INSERT',
      tableName:   'etl.Stg_BlisteringTimeSheet',
      recordId,
      description: JSON.stringify({ room: data.room, shift: data.shift_number, date: data.shift_date }),
      ipAddress:   req.ip,
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
  if (room)   { where += ' AND RoomCode = @room';   params.room   = { type: sql.VarChar(10),   value: room }; }
  if (from)   { where += ' AND FullDate >= @from';  params.from   = { type: sql.Date,           value: new Date(from) }; }
  if (to)     { where += ' AND FullDate <= @to';    params.to     = { type: sql.Date,           value: new Date(to) }; }
  if (search) {
    where += ' AND (MachineCode LIKE @search OR BatchNumber LIKE @search OR RoomCode LIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }

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
    return paginated(res, result.recordset, countResult.recordset[0].total, parseInt(page), parseInt(limit));
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
  const userId = req.user?.user_id ?? 0;

  try {
    const setClauses = [];
    const params = { id: { type: sql.Int, value: parseInt(id) } };

    if (data.shift_date)       { setClauses.push('Date_Raw = @date');         params.date    = { type: sql.Date,         value: new Date(data.shift_date) }; }
    if (data.shift_number)     { setClauses.push('Shift = @shift');           params.shift   = { type: sql.VarChar(20),  value: data.shift_number }; }
    if (data.room)             { setClauses.push('RoomNo = @room');           params.room    = { type: sql.VarChar(10),  value: data.room }; }
    if (data.machine)          { setClauses.push('MachineCode = @machine');   params.machine = { type: sql.VarChar(100), value: data.machine }; }
    if (data.planned_quantity !== undefined) { setClauses.push('ReceivedQty = @received'); params.received = { type: sql.Float, value: parseFloat(data.planned_quantity) }; }
    if (data.actual_quantity  !== undefined) { setClauses.push('AchievedQty = @produced'); params.produced = { type: sql.Float, value: parseFloat(data.actual_quantity) }; }
    if (data.batch_status)     { setClauses.push('IsProcessed = @status');    params.status  = { type: sql.VarChar(20),  value: data.batch_status }; }

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
  const userId = req.user?.user_id ?? 0;

  try {
    await executeQuery(
      `UPDATE etl.Stg_BlisteringTimeSheet SET HasError = 1, ErrorMessage = 'Deleted via API' WHERE StgKey = @id`,
      { id: { type: sql.Int, value: parseInt(id) } }
    );
    await logAudit({ userId, action: 'DELETE', tableName: 'etl.Stg_BlisteringTimeSheet', recordId: parseInt(id), description: 'Soft delete via API', ipAddress: req.ip }).catch(() => {});
    return success(res, null, 'Record removed');
  } catch (dbErr) {
    return error(res, 'Delete failed: ' + dbErr.message, 500);
  }
};

module.exports = { createRecord, getRecords, getRecordById, updateRecord, deleteRecord };