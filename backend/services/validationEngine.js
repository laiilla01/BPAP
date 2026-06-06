/**
 * BPAP - Validation Engine (simplified)
 * Validates records before insert. No DB dependency.
 */

/**
 * Validate a production record object
 * Returns array of { field, description, severity }
 */
const validateRecord = (data) => {
  const violations = [];

  if (!data.shift_date) violations.push({ field: 'shift_date', description: 'Shift date is required.', severity: 'Error' });
  if (!data.room)       violations.push({ field: 'room',       description: 'Room is required.',       severity: 'Error' });
  if (!data.machine && !data.speed_cat) violations.push({ field: 'machine', description: 'Machine/Speed-Cat is required.', severity: 'Warning' });

  const planned = parseFloat(data.planned_quantity);
  const actual  = parseFloat(data.actual_quantity);

  if (!planned || planned <= 0) violations.push({ field: 'planned_quantity', description: 'Planned quantity must be > 0.', severity: 'Error' });
  if (actual < 0)               violations.push({ field: 'actual_quantity',  description: 'Actual quantity cannot be negative.', severity: 'Error' });
  if (actual > planned * 1.5)   violations.push({ field: 'actual_quantity',  description: 'Actual quantity exceeds 150% of planned — please verify.', severity: 'Warning' });

  return violations;
};

// No-op stubs kept for interface compatibility
const saveViolations = async () => {};
const getExceptions  = async () => ({ records: [], total: 0 });

module.exports = { validateRecord, saveViolations, getExceptions };
