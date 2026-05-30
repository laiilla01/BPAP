/**
 * BPAP - Production Routes
 * POST   /api/production         - create record (Operator+)
 * GET    /api/production         - list records (all roles)
 * GET    /api/production/:id     - get single record
 * PUT    /api/production/:id     - update record (Operator own / Analyst+)
 * DELETE /api/production/:id     - soft delete (Analyst+)
 */

const router = require('express').Router();
const { body, param, query } = require('express-validator');
const {
  createRecord, getRecords, getRecordById, updateRecord, deleteRecord,
} = require('../controllers/productionController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const validate = require('../middleware/validate');

const ROOMS   = ['B1','B3','B4','B5','B6','B7'];
const SHIFTS  = ['Day','Night','Day-Off'];

// Validation chains
const createValidation = [
  body('room').isIn(ROOMS).withMessage(`Room must be one of: ${ROOMS.join(', ')}`),
  body('machine').notEmpty().trim(),
  body('shift_date').isDate().withMessage('shift_date must be a valid date (YYYY-MM-DD)'),
  body('shift_number').isIn(SHIFTS).withMessage(`Shift must be: ${SHIFTS.join(', ')}`),
  body('planned_quantity').isInt({ min: 1 }).withMessage('planned_quantity must be > 0'),
  body('actual_quantity').isInt({ min: 0 }),
  body('rejected_quantity').optional().isInt({ min: 0 }),
  body('downtime_minutes').optional().isInt({ min: 0 }),
  body('operator_name').notEmpty().trim(),
];

router.post('/', authenticate, authorize('Operator','Analyst','Manager'), createValidation, validate, createRecord);
router.get('/',  authenticate, getRecords);
router.get('/:id', authenticate, param('id').isInt(), validate, getRecordById);
router.put('/:id', authenticate, authorize('Operator','Analyst','Manager'), param('id').isInt(), validate, updateRecord);
router.delete('/:id', authenticate, authorize('Analyst','Manager'), param('id').isInt(), validate, deleteRecord);

module.exports = router;
