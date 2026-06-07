/**
 * BPAP - Production Routes (FINAL - no auth on POST, added public GET /)
 */

const router = require('express').Router();
const { body, param } = require('express-validator');
const { createRecord, getRecords, getRecordById, updateRecord, deleteRecord } = require('../controllers/productionController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { getPool } = require('../config/db');
const sql = require('mssql');

const ROOMS  = ['B1','B3','B4','B5','B6','B7'];
const SHIFTS = ['Day','Night','Day-Off'];

const createValidation = [
  body('room').isIn(ROOMS).withMessage(`Room must be one of: ${ROOMS.join(', ')}`),
  body('shift_date').isDate().withMessage('shift_date must be a valid date (YYYY-MM-DD)'),
  body('shift_number').isIn(SHIFTS).withMessage(`Shift must be: ${SHIFTS.join(', ')}`),
  body('planned_quantity').isNumeric({ min: 0 }).withMessage('planned_quantity must be a number'),
  body('actual_quantity').isNumeric({ min: 0 }).withMessage('actual_quantity must be a number'),
];

// ── Public routes (no auth) ──────────────────────────────

router.get('/products', async (req, res) => {
    try {
        const pool = await getPool();
        const search = req.query.q || '';
        const result = await pool.request()
            .input('search', sql.NVarChar, `%${search}%`)
            .query(`
                SELECT DISTINCT 
                    [Product Name] AS ProductName,
                    [Product Code] AS ProductCode
                FROM Daily_Time_Sheet_Master
                WHERE [Product Name] LIKE @search
                AND [Product Name] IS NOT NULL
                AND [Product Name] != 'null'
                ORDER BY [Product Name]
            `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/products/markets', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT [Market]
            FROM Daily_Time_Sheet_Master
            WHERE [Market] IS NOT NULL AND [Market] != 'null' AND [Market] != ''
            ORDER BY [Market]
        `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/markets', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT [Market]
            FROM Daily_Time_Sheet_Master
            WHERE [Market] IS NOT NULL AND [Market] != 'null' AND [Market] != ''
            ORDER BY [Market]
        `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/delays', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT
                DelayKey, DelayCode, DelayGroup, Description, DelayCategory
            FROM dbo.DelayDetails
            WHERE Description IS NOT NULL AND Description != ''
            ORDER BY Description
        `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
router.get('/machines', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT MachineCode
            FROM shared.Dim_Machine
            WHERE MachineCode IS NOT NULL
            ORDER BY MachineCode
        `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
router.get('/processes', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT [Process Code] AS ProcessName
            FROM Daily_Time_Sheet_Master
            WHERE [Process Code] IS NOT NULL
            ORDER BY [Process Code]
        `);
        res.json({ success: true, data: result.recordset });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── Public GET / — for dashboard recent records (no auth) ──
router.get('/', async (req, res) => {
    try {
        const pool = await getPool();
        const limit = parseInt(req.query.limit) || 10;
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit)
                    [Batch Number]   AS BatchNumber,
                    [Product Name]   AS MachineCode,
                    [Shift]          AS ShiftCode,
                    [Date]           AS FullDate,
                    'InProgress'     AS BatchStatus
                FROM Daily_Time_Sheet_Master
                WHERE [Date] IS NOT NULL
                ORDER BY [Date] DESC
            `);
        res.json({ success: true, data: result.recordset });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── Protected routes ─────────────────────────────────────
router.post('/',      createValidation, validate, createRecord);   // no auth — users table doesn't exist
router.get('/:id',    authenticate, param('id').notEmpty(), validate, getRecordById);
router.put('/:id',    authenticate, authorize('Operator','Analyst','Manager'), param('id').notEmpty(), validate, updateRecord);
router.delete('/:id', authenticate, authorize('Analyst','Manager'), param('id').notEmpty(), validate, deleteRecord);

module.exports = router;