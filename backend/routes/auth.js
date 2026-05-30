/**
 * BPAP - Auth Routes
 * POST /api/auth/login
 * POST /api/auth/logout
 * POST /api/auth/refresh
 * POST /api/auth/register   (Analyst only)
 * GET  /api/auth/me
 */

const router = require('express').Router();
const { body } = require('express-validator');
const { login, logout, refreshToken, register, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const validate = require('../middleware/validate');

// Login
router.post('/login',
  [
    body('username').notEmpty().trim().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  login
);

// Refresh token
router.post('/refresh',
  body('refreshToken').notEmpty().withMessage('Refresh token required'),
  validate,
  refreshToken
);

// Logout (requires auth)
router.post('/logout', authenticate, logout);

// Register new user (Analyst+ only)
router.post('/register',
  authenticate,
  authorize('Analyst', 'Manager'),
  [
    body('username').notEmpty().trim().isLength({ min: 3 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('full_name').notEmpty().trim(),
    body('role_id').isInt({ min: 1, max: 4 }),
    body('room_assigned').optional().isIn(['B1','B3','B4','B5','B6','B7']),
  ],
  validate,
  register
);

// Get current user
router.get('/me', authenticate, getMe);

module.exports = router;
