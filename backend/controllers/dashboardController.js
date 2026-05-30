/**
 * BPAP - Dashboard & KPI Controller
 */

const {
  getDailyKPIs,
  getMonthlyKPIs,
  getRoomComparison,
  getShiftComparison,
  getOEETrend,
} = require('../services/kpiService');
const { executeQuery, sql } = require('../config/db');
const { success, error } = require('../utils/response');

// ── GET /api/dashboard/summary ────────────────────────────
// High-level stats for the executive dashboard
const getSummary = async (req, res) => {
  const result = await executeQuery(
    `SELECT
       COUNT(*)                     AS total_records,
       SUM(actual_quantity)         AS total_production,
       SUM(rejected_quantity)       AS total_rejected,
       SUM(downtime_minutes)        AS total_downtime,
       AVG(production_efficiency)   AS avg_efficiency,
       AVG(oee)                     AS avg_oee,
       AVG(defect_rate)             AS avg_defect_rate,
       AVG(downtime_percentage)     AS avg_downtime_pct,
       MIN(shift_date)              AS data_from,
       MAX(shift_date)              AS data_to
     FROM production_records
     WHERE is_deleted = 0 AND data_status != 'Excluded'`
  );
  return success(res, result.recordset[0]);
};

// ── GET /api/dashboard/daily?date=YYYY-MM-DD&room=B1 ─────
const getDailyDashboard = async (req, res) => {
  const { date, room } = req.query;
  if (!date) return error(res, 'date query param required (YYYY-MM-DD)', 400);

  const data = await getDailyKPIs(date, room);
  return success(res, data);
};

// ── GET /api/dashboard/monthly?month=YYYY-MM&room=B1 ─────
const getMonthlyDashboard = async (req, res) => {
  const { month, room } = req.query;
  if (!month) return error(res, 'month query param required (YYYY-MM)', 400);

  const data = await getMonthlyKPIs(month, room);
  return success(res, data);
};

// ── GET /api/dashboard/rooms?from=&to= ───────────────────
const getRoomDashboard = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return error(res, 'from and to date params required', 400);

  const data = await getRoomComparison(from, to);
  return success(res, data);
};

// ── GET /api/dashboard/shifts?from=&to=&room= ────────────
const getShiftDashboard = async (req, res) => {
  const { from, to, room } = req.query;
  if (!from || !to) return error(res, 'from and to date params required', 400);

  const data = await getShiftComparison(from, to, room);
  return success(res, data);
};

// ── GET /api/dashboard/oee-trend?month=YYYY-MM&room=B1 ───
const getOEEChartData = async (req, res) => {
  const { month, room } = req.query;
  if (!month || !room) return error(res, 'month and room params required', 400);

  const data = await getOEETrend(month, room);
  return success(res, data);
};

// ── GET /api/dashboard/stats ──────────────────────────────
// Statistics for charts: downtime by cause, production by room
const getStatistics = async (req, res) => {
  const { from, to } = req.query;
  const params = {};
  let where = `WHERE is_deleted = 0 AND data_status != 'Excluded'`;

  if (from) { where += ' AND shift_date >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)   { where += ' AND shift_date <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }

  const [byRoom, byCause, byShift, topMachines] = await Promise.all([
    executeQuery(
      `SELECT room, SUM(actual_quantity) AS total, AVG(oee) AS avg_oee
       FROM production_records ${where} GROUP BY room ORDER BY room`,
      params
    ),
    executeQuery(
      `SELECT dc.cause_name, SUM(pr.downtime_minutes) AS total_downtime, COUNT(*) AS occurrences
       FROM production_records pr
       LEFT JOIN downtime_causes dc ON pr.downtime_cause_id = dc.cause_id
       ${where} AND pr.downtime_minutes > 0
       GROUP BY dc.cause_name ORDER BY total_downtime DESC`,
      params
    ),
    executeQuery(
      `SELECT shift_number, AVG(production_efficiency) AS avg_efficiency,
              AVG(oee) AS avg_oee, COUNT(*) AS records
       FROM production_records ${where} GROUP BY shift_number`,
      params
    ),
    executeQuery(
      `SELECT TOP 10 machine, AVG(oee) AS avg_oee, SUM(actual_quantity) AS total
       FROM production_records ${where} GROUP BY machine ORDER BY avg_oee DESC`,
      params
    ),
  ]);

  return success(res, {
    production_by_room:   byRoom.recordset,
    downtime_by_cause:    byCause.recordset,
    kpi_by_shift:         byShift.recordset,
    top_machines_by_oee:  topMachines.recordset,
  });
};

module.exports = {
  getSummary, getDailyDashboard, getMonthlyDashboard,
  getRoomDashboard, getShiftDashboard, getOEEChartData, getStatistics,
};
