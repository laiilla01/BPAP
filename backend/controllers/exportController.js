/**
 * BPAP - Export Controller
 * Reads from shared.Production_Summary (NEW_Production database)
 */

const ExcelJS      = require('exceljs');
const PDFDocument  = require('pdfkit');
const { executeQuery, sql } = require('../config/db');
const { logAudit } = require('../services/auditService');

// ── GET /api/export/excel?from=&to=&room= ─────────────────────
const exportExcel = async (req, res) => {
  const { from, to, room } = req.query;

  const params = {};
  let where = `WHERE 1=1`;
  if (from) { where += ' AND FullDate >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)   { where += ' AND FullDate <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }
  if (room) { where += ' AND RoomCode = @room';  params.room = { type: sql.VarChar(10), value: room }; }

  const result = await executeQuery(
    `SELECT
       ProductionKey, FullDate, ShiftCode, RoomCode, RoomName,
       MachineCode, BatchNumber, BatchStatus,
       ReceivedQty, AchievedQty, QtyBlistered, WasteQty, YieldPercent,
       DurationHours, StartTime, EndTime,
       ProcessCode, ProcessName, ActivityCode, ActivityName,
       DelayCode, DelayCategory, DelayCostImpact,
       ProductName, MarketCode, MarketName,
       IsNightShift, IsOverTime, IsProductive, IsValid
     FROM shared.Production_Summary
     ${where}
     ORDER BY FullDate DESC, RoomCode`,
    params
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BPAP System — JOSWE';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Production Records', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'ID',              key: 'ProductionKey',  width: 8  },
    { header: 'Date',            key: 'FullDate',       width: 14 },
    { header: 'Shift',           key: 'ShiftCode',      width: 10 },
    { header: 'Room',            key: 'RoomCode',       width: 8  },
    { header: 'Room Name',       key: 'RoomName',       width: 15 },
    { header: 'Machine',         key: 'MachineCode',    width: 15 },
    { header: 'Batch No.',       key: 'BatchNumber',    width: 18 },
    { header: 'Status',          key: 'BatchStatus',    width: 12 },
    { header: 'Product',         key: 'ProductName',    width: 25 },
    { header: 'Market',          key: 'MarketName',     width: 15 },
    { header: 'Received (kg)',   key: 'ReceivedQty',    width: 14 },
    { header: 'Achieved (kg)',   key: 'AchievedQty',    width: 14 },
    { header: 'Blistered',       key: 'QtyBlistered',   width: 12 },
    { header: 'Waste (kg)',      key: 'WasteQty',       width: 12 },
    { header: 'Yield %',         key: 'YieldPercent',   width: 10 },
    { header: 'Duration (hrs)',  key: 'DurationHours',  width: 14 },
    { header: 'Start Time',      key: 'StartTime',      width: 12 },
    { header: 'End Time',        key: 'EndTime',        width: 12 },
    { header: 'Process',         key: 'ProcessName',    width: 18 },
    { header: 'Activity',        key: 'ActivityName',   width: 18 },
    { header: 'Delay Code',      key: 'DelayCode',      width: 14 },
    { header: 'Delay Category',  key: 'DelayCategory',  width: 18 },
    { header: 'Night Shift',     key: 'IsNightShift',   width: 12 },
    { header: 'Overtime',        key: 'IsOverTime',     width: 10 },
  ];

  // Style header
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006875' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Add rows
  result.recordset.forEach((row) => {
    const dataRow = sheet.addRow({
      ...row,
      FullDate:     row.FullDate ? new Date(row.FullDate).toLocaleDateString('en-GB') : '',
      YieldPercent: row.YieldPercent != null ? parseFloat(row.YieldPercent).toFixed(2) + '%' : '',
      ReceivedQty:  row.ReceivedQty != null ? parseFloat(row.ReceivedQty).toFixed(3) : '',
      AchievedQty:  row.AchievedQty != null ? parseFloat(row.AchievedQty).toFixed(3) : '',
      WasteQty:     row.WasteQty    != null ? parseFloat(row.WasteQty).toFixed(3)    : '',
      IsNightShift: row.IsNightShift ? 'Yes' : 'No',
      IsOverTime:   row.IsOverTime   ? 'Yes' : 'No',
    });
    dataRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    // Highlight rejected/on-hold rows
    if (row.BatchStatus === 'Rejected' || row.BatchStatus === 'OnHold') {
      dataRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFDAD6' } };
      });
    }
  });

  await logAudit({
    userId: req.user.user_id, action: 'EXPORT',
    tableName: 'shared.Production_Summary',
    description: `Excel export: ${result.recordset.length} records`,
    ipAddress: req.ip,
  }).catch(() => {});

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="JOSWE_Production_${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ── GET /api/export/pdf?from=&to=&room= ───────────────────────
const exportPDF = async (req, res) => {
  const { from, to, room } = req.query;

  const params = {};
  let where = `WHERE 1=1`;
  if (from) { where += ' AND FullDate >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)   { where += ' AND FullDate <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }
  if (room) { where += ' AND RoomCode = @room';  params.room = { type: sql.VarChar(10), value: room }; }

  const [records, summary] = await Promise.all([
    executeQuery(
      `SELECT TOP 100 FullDate, RoomCode, MachineCode, ShiftCode, BatchNumber,
              AchievedQty, WasteQty, YieldPercent, BatchStatus
       FROM shared.Production_Summary ${where} ORDER BY FullDate DESC`,
      params
    ),
    executeQuery(
      `SELECT COUNT(*) AS total,
              AVG(YieldPercent)  AS avg_yield,
              SUM(AchievedQty)   AS total_actual,
              SUM(WasteQty)      AS total_waste
       FROM shared.Production_Summary ${where}`,
      params
    ),
  ]);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="JOSWE_Report_${Date.now()}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text('JOSWE BPAP — Production Report', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown();

  // Summary
  const s = summary.recordset[0];
  doc.fontSize(12).font('Helvetica-Bold').text('Summary');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Total Records: ${s.total}   |   Total Achieved: ${parseFloat(s.total_actual || 0).toFixed(1)} kg   |   Total Waste: ${parseFloat(s.total_waste || 0).toFixed(1)} kg`);
  doc.text(`Avg Yield: ${s.avg_yield != null ? parseFloat(s.avg_yield).toFixed(1) + '%' : 'N/A'}`);
  doc.moveDown();

  // Records
  doc.fontSize(12).font('Helvetica-Bold').text('Records (latest 100)');
  doc.moveDown(0.5);
  records.recordset.forEach((r, i) => {
    const line = `${new Date(r.FullDate).toLocaleDateString('en-GB')} | ${r.RoomCode} | ${r.MachineCode || '—'} | ${r.ShiftCode} | Achieved: ${parseFloat(r.AchievedQty||0).toFixed(1)} kg | Yield: ${r.YieldPercent != null ? parseFloat(r.YieldPercent).toFixed(1)+'%' : 'N/A'} | ${r.BatchStatus}`;
    doc.fontSize(8).font('Helvetica').text(line, { lineGap: 2 });
  });

  await logAudit({
    userId: req.user.user_id, action: 'EXPORT',
    tableName: 'shared.Production_Summary',
    description: `PDF export: ${records.recordset.length} records`,
    ipAddress: req.ip,
  }).catch(() => {});

  doc.end();
};

module.exports = { exportExcel, exportPDF };
