/**
 * BPAP - KPI Service
 * Reads from shared.Production_Summary view in NEW_Production
 */

const { executeQuery, sql } = require('../config/db');

/**
 * Calculate yield % and waste from raw quantities
 */
const calculateKPIs = ({ actual_quantity, planned_quantity, scheduled_minutes = 480, downtime_minutes = 0 }) => {
  const production_efficiency = planned_quantity > 0 ? actual_quantity / planned_quantity : 0;
  const downtime_percentage   = scheduled_minutes > 0 ? downtime_minutes / scheduled_minutes : 0;
  const availability          = 1 - downtime_percentage;
  const quality               = production_efficiency;
  const oee                   = availability * quality;
  const defect_rate           = 1 - quality;

  return {
    production_efficiency: +production_efficiency.toFixed(4),
    defect_rate:           +defect_rate.toFixed(4),
    oee:                   +oee.toFixed(4),
    downtime_percentage:   +downtime_percentage.toFixed(4),
    availability:          +availability.toFixed(4),
  };
};

const getDailyKPIs = async (date, room = null) => {
  const params = { date: { type: sql.Date, value: new Date(date) } };
  let where = `WHERE FullDate = @date`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  const result = await executeQuery(
    `SELECT RoomCode, RoomName, ShiftCode,
       COUNT(*) AS record_count,
       SUM(ReceivedQty) AS total_planned,
       SUM(AchievedQty) AS total_actual,
       SUM(WasteQty) AS total_waste,
       AVG(YieldPercent) AS avg_yield,
       SUM(DurationHours) AS total_hours
     FROM shared.Production_Summary ${where}
     GROUP BY RoomCode, RoomName, ShiftCode ORDER BY RoomCode`,
    params
  );
  return result.recordset;
};

const getMonthlyKPIs = async (yearMonth, room = null) => {
  const [year, month] = yearMonth.split('-');
  const params = {
    year:  { type: sql.Int, value: parseInt(year) },
    month: { type: sql.Int, value: parseInt(month) },
  };
  let where = `WHERE YEAR(FullDate) = @year AND MONTH(FullDate) = @month`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  const result = await executeQuery(
    `SELECT RoomCode, RoomName,
       COUNT(*) AS record_count,
       SUM(ReceivedQty) AS total_planned,
       SUM(AchievedQty) AS total_actual,
       SUM(WasteQty) AS total_waste,
       AVG(YieldPercent) AS avg_yield
     FROM shared.Production_Summary ${where}
     GROUP BY RoomCode, RoomName ORDER BY RoomCode`,
    params
  );
  return result.recordset;
};

const getRoomComparison = async (from, to) => {
  const result = await executeQuery(
    `SELECT RoomCode, RoomName,
       COUNT(*) AS record_count,
       AVG(YieldPercent) AS avg_yield,
       SUM(AchievedQty) AS total_actual,
       SUM(WasteQty) AS total_waste
     FROM shared.Production_Summary
     WHERE FullDate BETWEEN @from AND @to
     GROUP BY RoomCode, RoomName ORDER BY avg_yield DESC`,
    {
      from: { type: sql.Date, value: new Date(from) },
      to:   { type: sql.Date, value: new Date(to) },
    }
  );
  return result.recordset;
};

const getShiftComparison = async (from, to, room = null) => {
  const params = {
    from: { type: sql.Date, value: new Date(from) },
    to:   { type: sql.Date, value: new Date(to) },
  };
  let where = `WHERE FullDate BETWEEN @from AND @to`;
  if (room) { where += ' AND RoomCode = @room'; params.room = { type: sql.VarChar(10), value: room }; }

  const result = await executeQuery(
    `SELECT ShiftCode,
       COUNT(*) AS record_count,
       AVG(YieldPercent) AS avg_yield,
       SUM(AchievedQty) AS total_actual
     FROM shared.Production_Summary ${where}
     GROUP BY ShiftCode ORDER BY ShiftCode`,
    params
  );
  return result.recordset;
};

const getOEETrend = async (yearMonth, room) => {
  const [year, month] = yearMonth.split('-');
  const result = await executeQuery(
    `SELECT FullDate, AVG(YieldPercent) AS avg_yield, COUNT(*) AS records
     FROM shared.Production_Summary
     WHERE YEAR(FullDate) = @year AND MONTH(FullDate) = @month AND RoomCode = @room
     GROUP BY FullDate ORDER BY FullDate`,
    {
      year:  { type: sql.Int,         value: parseInt(year) },
      month: { type: sql.Int,         value: parseInt(month) },
      room:  { type: sql.VarChar(10), value: room },
    }
  );
  return result.recordset;
};

module.exports = { calculateKPIs, getDailyKPIs, getMonthlyKPIs, getRoomComparison, getShiftComparison, getOEETrend };
