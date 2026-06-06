/**
 * BPAP - Dashboard & KPI Controller
 * Reads from: shared.Production_Summary (view over blistering + coating)
 *             v_DelaySummary, v_MachinePerformance (views)
 *             dbo.DelayDetails (lookup)
 */

const { executeQuery, sql } = require('../config/db');
const { success, error } = require('../utils/response');

// ── GET /api/dashboard/summary ────────────────────────────────
const getSummary = async (req, res) => {
  try {
    const result = await executeQuery(
      `SELECT
         COUNT(*)                        AS total_records,
         SUM(AchievedQty)                AS total_production,
         SUM(ReceivedQty)                AS total_planned,
         SUM(WasteQty)                   AS total_waste,
         AVG(YieldPercent)               AS avg_efficiency,
         SUM(DurationHours)              AS total_duration_hours,
         MIN(FullDate)                   AS data_from,
         MAX(FullDate)                   AS data_to
       FROM shared.Production_Summary`
    );
    return success(res, result.recordset[0]);
  } catch (dbErr) {
    return error(res, 'Dashboard summary failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/daily?date=YYYY-MM-DD&room=B1 ─────────
const getDailyDashboard = async (req, res) => {
  const { date, room } = req.query;
  if (!date) return error(res, 'date query param required (YYYY-MM-DD)', 400);

  const params = { date: { type: sql.Date, value: new Date(date) } };
  let where = `WHERE FullDate = @date`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  try {
    const result = await executeQuery(
      `SELECT
         RoomCode,
         RoomName,
         ShiftCode,
         COUNT(*)             AS record_count,
         SUM(ReceivedQty)     AS total_planned,
         SUM(AchievedQty)     AS total_actual,
         SUM(WasteQty)        AS total_waste,
         AVG(YieldPercent)    AS avg_yield,
         SUM(DurationHours)   AS total_hours
       FROM shared.Production_Summary ${where}
       GROUP BY RoomCode, RoomName, ShiftCode
       ORDER BY RoomCode, ShiftCode`,
      params
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    return error(res, 'Daily dashboard failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/monthly?month=YYYY-MM&room=B1 ─────────
const getMonthlyDashboard = async (req, res) => {
  const { month, room } = req.query;
  if (!month) return error(res, 'month query param required (YYYY-MM)', 400);

  const [year, mon] = month.split('-');
  const params = {
    year:  { type: sql.Int, value: parseInt(year) },
    month: { type: sql.Int, value: parseInt(mon) },
  };
  let where = `WHERE YEAR(FullDate) = @year AND MONTH(FullDate) = @month`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  try {
    const result = await executeQuery(
      `SELECT
         RoomCode, RoomName,
         COUNT(*)             AS record_count,
         SUM(ReceivedQty)     AS total_planned,
         SUM(AchievedQty)     AS total_actual,
         SUM(WasteQty)        AS total_waste,
         AVG(YieldPercent)    AS avg_yield
       FROM shared.Production_Summary ${where}
       GROUP BY RoomCode, RoomName
       ORDER BY RoomCode`,
      params
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    return error(res, 'Monthly dashboard failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/rooms?from=&to= ───────────────────────
const getRoomDashboard = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return error(res, 'from and to date params required', 400);

  try {
    const result = await executeQuery(
      `SELECT
         RoomCode,
         RoomName,
         COUNT(*)             AS record_count,
         SUM(AchievedQty)     AS total_actual,
         SUM(WasteQty)        AS total_waste,
         AVG(YieldPercent)    AS avg_yield,
         SUM(DurationHours)   AS total_hours
       FROM shared.Production_Summary
       WHERE FullDate BETWEEN @from AND @to
       GROUP BY RoomCode, RoomName
       ORDER BY RoomCode`,
      {
        from: { type: sql.Date, value: new Date(from) },
        to:   { type: sql.Date, value: new Date(to) },
      }
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    return error(res, 'Room dashboard failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/shifts?from=&to=&room= ────────────────
const getShiftDashboard = async (req, res) => {
  const { from, to, room } = req.query;
  if (!from || !to) return error(res, 'from and to date params required', 400);

  const params = {
    from: { type: sql.Date, value: new Date(from) },
    to:   { type: sql.Date, value: new Date(to) },
  };
  let where = `WHERE FullDate BETWEEN @from AND @to`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  try {
    const result = await executeQuery(
      `SELECT
         ShiftCode,
         COUNT(*)             AS record_count,
         AVG(YieldPercent)    AS avg_yield,
         SUM(AchievedQty)     AS total_actual
       FROM shared.Production_Summary ${where}
       GROUP BY ShiftCode
       ORDER BY ShiftCode`,
      params
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    return error(res, 'Shift dashboard failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/oee-trend?month=YYYY-MM&room=B1 ───────
const getOEEChartData = async (req, res) => {
  const { month, room } = req.query;
  if (!month || !room) return error(res, 'month and room params required', 400);

  const [year, mon] = month.split('-');
  try {
    const result = await executeQuery(
      `SELECT
         FullDate,
         AVG(YieldPercent)    AS avg_yield,
         SUM(AchievedQty)     AS total_actual,
         COUNT(*)             AS records
       FROM shared.Production_Summary
       WHERE YEAR(FullDate) = @year AND MONTH(FullDate) = @month AND RoomCode = @room
       GROUP BY FullDate
       ORDER BY FullDate`,
      {
        year:  { type: sql.Int,         value: parseInt(year) },
        month: { type: sql.Int,         value: parseInt(mon) },
        room:  { type: sql.VarChar(10), value: room },
      }
    );
    return success(res, result.recordset);
  } catch (dbErr) {
    return error(res, 'OEE trend failed: ' + dbErr.message, 500);
  }
};

// ── GET /api/dashboard/stats ──────────────────────────────────
const getStatistics = async (req, res) => {
  const { from, to } = req.query;
  const params = {};
  let where = `WHERE 1=1`;
  if (from) { where += ' AND FullDate >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)   { where += ' AND FullDate <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }

  try {
    const [byRoom, byDelay, byShift, byMachine] = await Promise.all([
      executeQuery(
        `SELECT RoomCode, RoomName, SUM(AchievedQty) AS total, AVG(YieldPercent) AS avg_yield
         FROM shared.Production_Summary ${where} GROUP BY RoomCode, RoomName ORDER BY RoomCode`,
        params
      ),
      executeQuery(
        `SELECT DelayCode, DelayCategory, COUNT(*) AS occurrences
         FROM shared.Production_Summary ${where} WHERE DelayCode IS NOT NULL AND DelayCode != ''
         GROUP BY DelayCode, DelayCategory ORDER BY occurrences DESC`,
        params
      ),
      executeQuery(
        `SELECT ShiftCode, AVG(YieldPercent) AS avg_yield, COUNT(*) AS records
         FROM shared.Production_Summary ${where} GROUP BY ShiftCode`,
        params
      ),
      executeQuery(
        `SELECT TOP 10 MachineCode, AVG(YieldPercent) AS avg_yield, SUM(AchievedQty) AS total
         FROM shared.Production_Summary ${where} WHERE MachineCode IS NOT NULL
         GROUP BY MachineCode ORDER BY avg_yield DESC`,
        params
      ),
    ]);

    return success(res, {
      production_by_room:  byRoom.recordset,
      downtime_by_cause:   byDelay.recordset,
      kpi_by_shift:        byShift.recordset,
      top_machines_by_oee: byMachine.recordset,
    });
  } catch (dbErr) {
    return error(res, 'Statistics failed: ' + dbErr.message, 500);
  }
};

module.exports = {
  getSummary, getDailyDashboard, getMonthlyDashboard,
  getRoomDashboard, getShiftDashboard, getOEEChartData, getStatistics,
};
