/**
 * BPAP - Export Controller
 * Export production data to Excel (.xlsx) or PDF
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { executeQuery, sql } = require('../config/db');
const { logAudit } = require('../services/auditService');
const logger = require('../utils/logger');

// ── GET /api/export/excel?from=&to=&room= ─────────────────
const exportExcel = async (req, res) => {
  const { from, to, room } = req.query;

  let where = `WHERE is_deleted = 0 AND data_status != 'Excluded'`;
  const params = {};
  if (from)  { where += ' AND shift_date >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)    { where += ' AND shift_date <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }
  if (room)  { where += ' AND room = @room';         params.room = { type: sql.VarChar(10), value: room }; }

  const result = await executeQuery(
    `SELECT pr.record_id, pr.room, pr.machine, pr.shift_date, pr.shift_number,
            pr.planned_quantity, pr.actual_quantity, pr.rejected_quantity,
            pr.good_quantity, pr.downtime_minutes, pr.operator_name,
            pr.production_efficiency, pr.defect_rate, pr.oee, pr.downtime_percentage,
            dc.cause_name AS downtime_cause, pr.data_status
     FROM production_records pr
     LEFT JOIN downtime_causes dc ON pr.downtime_cause_id = dc.cause_id
     ${where}
     ORDER BY pr.shift_date DESC, pr.room`,
    params
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BPAP System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Production Records', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Define columns
  sheet.columns = [
    { header: 'ID',               key: 'record_id',            width: 8 },
    { header: 'Room',             key: 'room',                 width: 8 },
    { header: 'Machine',          key: 'machine',              width: 15 },
    { header: 'Date',             key: 'shift_date',           width: 14 },
    { header: 'Shift',            key: 'shift_number',         width: 10 },
    { header: 'Planned',          key: 'planned_quantity',     width: 12 },
    { header: 'Actual',           key: 'actual_quantity',      width: 12 },
    { header: 'Rejected',         key: 'rejected_quantity',    width: 12 },
    { header: 'Good',             key: 'good_quantity',        width: 12 },
    { header: 'Downtime (min)',   key: 'downtime_minutes',     width: 15 },
    { header: 'Downtime Cause',   key: 'downtime_cause',       width: 20 },
    { header: 'Efficiency (%)',   key: 'production_efficiency', width: 16 },
    { header: 'Defect Rate (%)',  key: 'defect_rate',          width: 15 },
    { header: 'OEE (%)',          key: 'oee',                  width: 12 },
    { header: 'Downtime (%)',     key: 'downtime_percentage',  width: 14 },
    { header: 'Operator',         key: 'operator_name',        width: 20 },
    { header: 'Status',          key: 'data_status',          width: 12 },
  ];

  // Style header row
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Add data rows
  result.recordset.forEach((row) => {
    const dataRow = sheet.addRow({
      ...row,
      shift_date: row.shift_date ? new Date(row.shift_date).toLocaleDateString('en-GB') : '',
      production_efficiency: row.production_efficiency ? (row.production_efficiency * 100).toFixed(2) + '%' : '',
      defect_rate:           row.defect_rate ? (row.defect_rate * 100).toFixed(2) + '%' : '',
      oee:                   row.oee ? (row.oee * 100).toFixed(2) + '%' : '',
      downtime_percentage:   row.downtime_percentage ? (row.downtime_percentage * 100).toFixed(2) + '%' : '',
    });

    // Highlight flagged records
    if (row.data_status === 'Flagged') {
      dataRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      });
    }
  });

  // Add borders to all cells
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    });
  });

  // Audit
  await logAudit({
    userId: req.user.user_id, action: 'EXPORT',
    tableName: 'production_records',
    newValue: `Excel export: ${result.recordset.length} records`,
    ipAddress: req.ip,
  });

  // Stream to response
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="BPAP_Production_${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ── GET /api/export/pdf?from=&to=&room= ──────────────────
const exportPDF = async (req, res) => {
  const { from, to, room } = req.query;

  let where = `WHERE is_deleted = 0 AND data_status != 'Excluded'`;
  const params = {};
  if (from)  { where += ' AND shift_date >= @from'; params.from = { type: sql.Date, value: new Date(from) }; }
  if (to)    { where += ' AND shift_date <= @to';   params.to   = { type: sql.Date, value: new Date(to) }; }
  if (room)  { where += ' AND room = @room';         params.room = { type: sql.VarChar(10), value: room }; }

  const [records, summary] = await Promise.all([
    executeQuery(
      `SELECT TOP 100 room, machine, shift_date, shift_number,
              actual_quantity, rejected_quantity, oee, production_efficiency
       FROM production_records ${where} ORDER BY shift_date DESC`, params
    ),
    executeQuery(
      `SELECT COUNT(*) AS total, AVG(oee) AS avg_oee,
              AVG(production_efficiency) AS avg_efficiency,
              SUM(actual_quantity) AS total_actual
       FROM production_records ${where}`, params
    ),
  ]);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="BPAP_Report_${Date.now()}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text('BPAP - Production Report', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text(`JOSWE Pharmaceutical | Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown();

  // Summary
  const s = summary.recordset[0];
  doc.fontSize(12).font('Helvetica-Bold').text('Summary');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Total Records: ${s.total} | Total Production: ${s.total_actual?.toLocaleString() || 0}`);
  doc.text(`Avg OEE: ${s.avg_oee ? (s.avg_oee * 100).toFixed(1) + '%' : 'N/A'} | Avg Efficiency: ${s.avg_efficiency ? (s.avg_efficiency * 100).toFixed(1) + '%' : 'N/A'}`);
  doc.moveDown();

  // Table header
  doc.fontSize(12).font('Helvetica-Bold').text('Production Records (latest 100)');
  doc.moveDown(0.5);

  records.recordset.forEach((r, i) => {
    const line = `${new Date(r.shift_date).toLocaleDateString('en-GB')} | ${r.room} | ${r.machine} | ${r.shift_number} | Actual: ${r.actual_quantity} | OEE: ${r.oee ? (r.oee * 100).toFixed(1) + '%' : 'N/A'}`;
    doc.fontSize(8).font(i % 2 === 0 ? 'Helvetica' : 'Helvetica').text(line);
  });

  await logAudit({
    userId: req.user.user_id, action: 'EXPORT',
    tableName: 'production_records',
    newValue: `PDF export: ${records.recordset.length} records`,
    ipAddress: req.ip,
  });

  doc.end();
};

module.exports = { exportExcel, exportPDF };
