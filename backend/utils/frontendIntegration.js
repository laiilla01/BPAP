/**
 * BPAP - Frontend Integration Examples
 * Copy these fetch() snippets into your HTML/JS pages
 *
 * Base URL: http://localhost:5000/api
 * All protected routes require: Authorization: Bearer <token>
 */

const API_BASE = 'http://localhost:5000/api';

// ── Helper: get stored token ──────────────────────────────
const getToken = () => sessionStorage.getItem('bpap_token');

// ── Helper: authenticated fetch ───────────────────────────
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'API error');
  return data;
};

// ══════════════════════════════════════════════════════════
// 1. LOGIN (JOSWE_Production_Line-UI-Front.html)
// ══════════════════════════════════════════════════════════
const loginUser = async (username, password) => {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  // Store tokens securely
  sessionStorage.setItem('bpap_token', data.data.accessToken);
  sessionStorage.setItem('bpap_refresh', data.data.refreshToken);
  sessionStorage.setItem('bpap_user', JSON.stringify(data.data.user));

  return data.data.user; // { user_id, username, full_name, role, room_assigned }
};

// ══════════════════════════════════════════════════════════
// 2. SUBMIT PRODUCTION RECORD (Session form page)
// ══════════════════════════════════════════════════════════
const submitProductionRecord = async (formData) => {
  /**
   * formData object structure:
   * {
   *   room: "B1",
   *   machine: "Machine-A",
   *   shift_date: "2025-06-01",     ← YYYY-MM-DD format
   *   shift_number: "Day",
   *   day_of_week: "Sun",
   *   market_type: "Local",
   *   planned_quantity: 10000,
   *   actual_quantity: 9500,
   *   rejected_quantity: 200,
   *   downtime_minutes: 30,
   *   scheduled_minutes: 480,
   *   downtime_cause_name: "Machine technical failure",
   *   downtime_notes: "Conveyor belt issue",
   *   process_type: "Blistering",
   *   activity_type: "Blister",
   *   feeder_active: true,
   *   operator_name: "Ahmed Al-Hassan"
   * }
   */
  const result = await apiFetch('/production', {
    method: 'POST',
    body: JSON.stringify(formData),
  });

  console.log('Record saved:', result.data.record_id);
  console.log('KPIs:', result.data.kpis);
  // result.data.kpis = { oee, production_efficiency, defect_rate, downtime_percentage }

  if (result.data.warnings?.length) {
    console.warn('Warnings:', result.data.warnings);
  }

  return result.data;
};

// ══════════════════════════════════════════════════════════
// 3. LOAD DASHBOARD SUMMARY (Dashboard.html)
// ══════════════════════════════════════════════════════════
const loadDashboardSummary = async () => {
  const data = await apiFetch('/dashboard/summary');
  const s = data.data;

  // Example: populate your dashboard cards
  document.getElementById('total-production').textContent = s.total_production?.toLocaleString() || '0';
  document.getElementById('avg-oee').textContent = s.avg_oee ? (s.avg_oee * 100).toFixed(1) + '%' : 'N/A';
  document.getElementById('avg-efficiency').textContent = s.avg_efficiency ? (s.avg_efficiency * 100).toFixed(1) + '%' : 'N/A';
  document.getElementById('avg-defect').textContent = s.avg_defect_rate ? (s.avg_defect_rate * 100).toFixed(2) + '%' : 'N/A';
};

// ══════════════════════════════════════════════════════════
// 4. LOAD DAILY KPIs (Dashboard.html)
// ══════════════════════════════════════════════════════════
const loadDailyKPIs = async (date, room = null) => {
  const params = new URLSearchParams({ date });
  if (room) params.append('room', room);

  const data = await apiFetch(`/dashboard/daily?${params}`);
  return data.data; // Array of KPI objects per room/shift
};

// ══════════════════════════════════════════════════════════
// 5. LOAD CHART DATA - OEE Trend (Dashboard.html)
// ══════════════════════════════════════════════════════════
const loadOEETrendForChart = async (month, room) => {
  const data = await apiFetch(`/dashboard/oee-trend?month=${month}&room=${room}`);
  // Use with Chart.js:
  const labels = data.data.map(d => d.shift_date);
  const oeeValues = data.data.map(d => (d.avg_oee * 100).toFixed(1));
  return { labels, oeeValues };
};

// ══════════════════════════════════════════════════════════
// 6. GET PRODUCTION RECORDS WITH PAGINATION (Activity Log.html)
// ══════════════════════════════════════════════════════════
const loadProductionRecords = async (page = 1, filters = {}) => {
  const params = new URLSearchParams({ page, limit: 20, ...filters });
  const data = await apiFetch(`/production?${params}`);
  // data.pagination = { total, page, limit, totalPages }
  return data;
};

// ══════════════════════════════════════════════════════════
// 7. EXPORT TO EXCEL (Summary.html)
// ══════════════════════════════════════════════════════════
const downloadExcelReport = async (from, to, room = null) => {
  const params = new URLSearchParams({ from, to });
  if (room) params.append('room', room);

  const token = getToken();
  const response = await fetch(`${API_BASE}/export/excel?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BPAP_Production_${from}_to_${to}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ══════════════════════════════════════════════════════════
// 8. GET DOWNTIME CAUSES (for dropdown population)
// ══════════════════════════════════════════════════════════
const loadDowntimeCauses = async () => {
  const data = await apiFetch('/audit/downtime-causes');
  return data.data; // [{ cause_id, cause_name }]
};

// ══════════════════════════════════════════════════════════
// 9. LOGOUT
// ══════════════════════════════════════════════════════════
const logoutUser = async () => {
  const refreshToken = sessionStorage.getItem('bpap_refresh');
  await apiFetch('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  sessionStorage.clear();
  window.location.href = '/login.html';
};

// ══════════════════════════════════════════════════════════
// Example: Wire up your session form (copy to your HTML)
// ══════════════════════════════════════════════════════════
/*
document.getElementById('session-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = JSON.parse(sessionStorage.getItem('bpap_user'));

  const formData = {
    room:               document.querySelector('[name="room"]').value,
    machine:            document.querySelector('[name="machine"]').value,
    shift_date:         document.querySelector('[name="shift_date"]').value,
    shift_number:       document.querySelector('[name="shift"]').value,
    day_of_week:        document.querySelector('[name="day"]').value,
    market_type:        document.querySelector('[name="market"]').value,
    planned_quantity:   parseInt(document.querySelector('[name="planned"]').value),
    actual_quantity:    parseInt(document.querySelector('[name="actual"]').value),
    rejected_quantity:  parseInt(document.querySelector('[name="rejected"]').value || 0),
    downtime_minutes:   parseInt(document.querySelector('[name="downtime"]').value || 0),
    downtime_cause_name:document.querySelector('[name="cause"]').value,
    process_type:       document.querySelector('[name="process"]').value,
    activity_type:      document.querySelector('[name="activity"]').value,
    operator_name:      user.full_name,
  };

  try {
    const result = await submitProductionRecord(formData);
    alert(`✅ Saved! OEE: ${(result.kpis.oee * 100).toFixed(1)}%`);
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
});
*/
