/**
 * BPAP - Dashboard Routes
 * All routes require authentication. Operators are excluded.
 */

const router = require('express').Router();
const {
  getSummary, getDailyDashboard, getMonthlyDashboard,
  getRoomDashboard, getShiftDashboard, getOEEChartData, getStatistics,
} = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

const analystUp = authorize('Analyst', 'Manager', 'Executive');

router.get('/summary',  authenticate, analystUp, getSummary);
router.get('/daily',    authenticate, analystUp, getDailyDashboard);
router.get('/monthly',  authenticate, analystUp, getMonthlyDashboard);
router.get('/rooms',    authenticate, analystUp, getRoomDashboard);
router.get('/shifts',   authenticate, analystUp, getShiftDashboard);
router.get('/oee-trend',authenticate, analystUp, getOEEChartData);
router.get('/stats',    authenticate, analystUp, getStatistics);

module.exports = router;
