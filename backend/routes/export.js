/**
 * BPAP - Export Routes
 * GET /api/export/excel
 * GET /api/export/pdf
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { exportExcel, exportPDF } = require('../controllers/exportController');

const analystUp = authorize('Analyst', 'Manager', 'Executive');

router.get('/excel', authenticate, analystUp, exportExcel);
router.get('/pdf',   authenticate, analystUp, exportPDF);

module.exports = router;
