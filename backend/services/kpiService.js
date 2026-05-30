/**
 * BPAP - KPI Calculation Service
 *
 * Formulas:
 *   Production Efficiency = Actual Output / Planned Output
 *   Defect Rate           = Rejected Units / Actual Units
 *   OEE                   = Availability × Performance × Quality
 *   Downtime %            = Downtime Minutes / Scheduled Minutes
 *
 * OEE components:
 *   Availability  = (Scheduled - Downtime) / Scheduled
 *   Performance   = Actual Output / (Planned Output * Availability)  [capped at 1]
 *   Quality       = Good Units / Actual Units
 */

const { executeQuery, sql } = require('../config/db');

/**
 * Calculate KPIs for a single production record object
 * @param {Object} record
 * @returns {Object} kpis
 */
const calculateKPIs = (record) => {
  const {
    actual_quantity,
    planned_quantity,
    rejected_quantity,
    downtime_minutes,
    scheduled_minutes = 480,
  } = record;

  const good_quantity = actual_quantity - rejected_quantity;
  const productive_minutes = scheduled_minutes - downtime_minutes;

  // Production Efficiency
  const production_efficiency =
    planned_quantity > 0 ? actual_quantity / planned_quantity : 0;

  // Defect Rate
  const defect_rate =
    actual_quantity > 0 ? rejected_quantity / actual_quantity : 0;

  // OEE components
  const availability =
    scheduled_minutes > 0 ? productive_minutes / scheduled_minutes : 0;

  const performance =
    planned_quantity > 0 && availability > 0
      ? Math.min(actual_quantity / (planned_quantity * availability), 1)
      : 0;

  const quality =
    actual_quantity > 0 ? good_quantity / actual_quantity : 0;

  const oee = availability * performance * quality;

  // Downtime percentage
  const downtime_percentage =
    scheduled_minutes > 0 ? downtime_minutes / scheduled_minutes : 0;

  return {
    production_efficiency: +production_efficiency.toFixed(4),
    defect_rate:           +defect_rate.toFixed(4),
    oee:                   +oee.toFixed(4),
    downtime_percentage:   +downtime_percentage.toFixed(4),
    availability:          +availability.toFixed(4),
    performance:           +performance.toFixed(4),
    quality:               +quality.toFixed(4),
    good_quantity,
    productive_minutes,
  };
};

/**
 * Get daily KPIs for a specific date (and optional room)
 */
const getDailyKPIs = async (date, room = null) => {
  let where = `WHERE shift_date = @date AND is_deleted = 0 AND data_status != 'Excluded'`;
  const params = { date: { type: sql.Date, value: new Date(date) } };

  if (room) {
    where += ' AND room = @room';
    params.room = { type: sql.VarChar(10), value: room };
  }

  const result = await executeQuery(
    `SELECT
       room,
       shift_number,
       COUNT(*)                     AS record_count,
       SUM(planned_quantity)        AS total_planned,
       SUM(actual_quantity)         AS total_actual,
       SUM(rejected_quantity)       AS total_rejected,
       SUM(good_quantity)           AS total_good,
       SUM(downtime_minutes)        AS total_downtime,
       SUM(scheduled_minutes)       AS total_scheduled,
       AVG(production_efficiency)   AS avg_efficiency,
       AVG(defect_rate)             AS avg_defect_rate,
       AVG(oee)                     AS avg_oee,
       AVG(downtime_percentage)     AS avg_downtime_pct
     FROM production_records
     ${where}
     GROUP BY room, shift_number
     ORDER BY room, shift_number`,
    params
  );

  return result.recordset;
};

/**
 * Get monthly KPIs for a given year-month (YYYY-MM)
 */
const getMonthlyKPIs = async (yearMonth, room = null) => {
  const [year, month] = yearMonth.split('-');

  let where = `WHERE YEAR(shift_date) = @year AND MONTH(shift_date) = @month
               AND is_deleted = 0 AND data_status != 'Excluded'`;
  const params = {
    year:  { type: sql.Int, value: parseInt(year) },
    month: { type: sql.Int, value: parseInt(month) },
  };

  if (room) {
    where += ' AND room = @room';
    params.room = { type: sql.VarChar(10), value: room };
  }

  const result = await executeQuery(
    `SELECT
       room,
       COUNT(*)                     AS record_count,
       SUM(planned_quantity)        AS total_planned,
       SUM(actual_quantity)         AS total_actual,
       SUM(rejected_quantity)       AS total_rejected,
       SUM(good_quantity)           AS total_good,
       SUM(downtime_minutes)        AS total_downtime,
       AVG(production_efficiency)   AS avg_efficiency,
       AVG(defect_rate)             AS avg_defect_rate,
       AVG(oee)                     AS avg_oee,
       AVG(downtime_percentage)     AS avg_downtime_pct
     FROM production_records
     ${where}
     GROUP BY room
     ORDER BY room`,
    params
  );

  return result.recordset;
};

/**
 * Room comparison — side-by-side KPIs for all rooms in a date range
 */
const getRoomComparison = async (from, to) => {
  const result = await executeQuery(
    `SELECT
       room,
       COUNT(*)                   AS record_count,
       AVG(production_efficiency) AS avg_efficiency,
       AVG(defect_rate)           AS avg_defect_rate,
       AVG(oee)                   AS avg_oee,
       AVG(downtime_percentage)   AS avg_downtime_pct,
       SUM(actual_quantity)       AS total_actual,
       SUM(rejected_quantity)     AS total_rejected
     FROM production_records
     WHERE shift_date BETWEEN @from AND @to
       AND is_deleted = 0 AND data_status != 'Excluded'
     GROUP BY room
     ORDER BY avg_oee DESC`,
    {
      from: { type: sql.Date, value: new Date(from) },
      to:   { type: sql.Date, value: new Date(to) },
    }
  );
  return result.recordset;
};

/**
 * Shift comparison — Day vs Night KPIs
 */
const getShiftComparison = async (from, to, room = null) => {
  let where = `WHERE shift_date BETWEEN @from AND @to
               AND is_deleted = 0 AND data_status != 'Excluded'`;
  const params = {
    from: { type: sql.Date, value: new Date(from) },
    to:   { type: sql.Date, value: new Date(to) },
  };

  if (room) {
    where += ' AND room = @room';
    params.room = { type: sql.VarChar(10), value: room };
  }

  const result = await executeQuery(
    `SELECT
       shift_number,
       COUNT(*)                   AS record_count,
       AVG(production_efficiency) AS avg_efficiency,
       AVG(defect_rate)           AS avg_defect_rate,
       AVG(oee)                   AS avg_oee,
       SUM(actual_quantity)       AS total_actual
     FROM production_records
     ${where}
     GROUP BY shift_number
     ORDER BY shift_number`,
    params
  );
  return result.recordset;
};

/**
 * Chart data: daily OEE trend for a room over a month
 */
const getOEETrend = async (yearMonth, room) => {
  const [year, month] = yearMonth.split('-');
  const result = await executeQuery(
    `SELECT
       shift_date,
       AVG(oee) AS avg_oee,
       AVG(production_efficiency) AS avg_efficiency,
       COUNT(*) AS records
     FROM production_records
     WHERE YEAR(shift_date) = @year AND MONTH(shift_date) = @month
       AND room = @room
       AND is_deleted = 0 AND data_status != 'Excluded'
     GROUP BY shift_date
     ORDER BY shift_date`,
    {
      year:  { type: sql.Int,         value: parseInt(year) },
      month: { type: sql.Int,         value: parseInt(month) },
      room:  { type: sql.VarChar(10), value: room },
    }
  );
  return result.recordset;
};

module.exports = {
  calculateKPIs,
  getDailyKPIs,
  getMonthlyKPIs,
  getRoomComparison,
  getShiftComparison,
  getOEETrend,
};
