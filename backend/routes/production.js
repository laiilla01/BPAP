/**
 * BPAP - Production Routes
 * POST   /api/production      - create record (Operator+)
 * GET    /api/production      - list records (all roles)
 * GET    /api/production/:id  - get single record
 * PUT    /api/production/:id  - update record (Operator+)
 * DELETE /api/production/:id  - soft delete (Analyst+)
 */

const router = require('express').Router();
const { body, param } = require('express-validator');
const { createRecord, getRecords, getRecordById, updateRecord, deleteRecord } = require('../controllers/productionController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const validate = require('../middleware/validate');

const ROOMS  = ['B1','B3','B4','B5','B6','B7'];
const SHIFTS = ['Day','Night','Day-Off'];

const createValidation = [
  body('room').isIn(ROOMS).withMessage(`Room must be one of: ${ROOMS.join(', ')}`),
  body('shift_date').isDate().withMessage('shift_date must be a valid date (YYYY-MM-DD)'),
  body('shift_number').isIn(SHIFTS).withMessage(`Shift must be: ${SHIFTS.join(', ')}`),
  body('planned_quantity').isNumeric({ min: 0 }).withMessage('planned_quantity must be a number'),
  body('actual_quantity').isNumeric({ min: 0 }).withMessage('actual_quantity must be a number'),
];

router.post('/',     authenticate, authorize('Operator','Analyst','Manager'), createValidation, validate, createRecord);
router.get('/',      authenticate, getRecords);
router.get('/:id',   authenticate, param('id').notEmpty(), validate, getRecordById);
router.put('/:id',   authenticate, authorize('Operator','Analyst','Manager'), param('id').notEmpty(), validate, updateRecord);
router.delete('/:id',authenticate, authorize('Analyst','Manager'), param('id').notEmpty(), validate, deleteRecord);

module.exports = router;
