# BPAP Backend - Setup Guide
**Blistering Production Analytics Platform**
JOSWE Pharmaceutical Company

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18+ LTS | https://nodejs.org |
| npm | 9+ | (included with Node) |
| SQL Server | 2019/2022 or Azure SQL | (your existing instance) |
| VS Code | Latest | https://code.visualstudio.com |

---

## Step 1 — Install Dependencies

```bash
cd bpap-backend
npm install
```

---

## Step 2 — Configure Environment

Copy the example .env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DB_SERVER=192.168.1.100    ← your SQL Server IP or hostname
DB_NAME=BPAP_DB
DB_USER=sa
DB_PASSWORD=YourPassword
JWT_SECRET=change_this_to_a_long_random_string
```

**If your SQL Server is on Windows and you're on Mac:**
- Use the Windows machine's local IP address (e.g. 192.168.1.100)
- Make sure SQL Server allows TCP/IP connections (SQL Server Configuration Manager → Protocols → Enable TCP/IP)
- Make sure port 1433 is open in Windows Firewall

---

## Step 3 — Create Database Schema

Open SQL Server Management Studio (or Azure Data Studio) and run:

```
config/schema.sql
```

This creates all tables, indexes, constraints, and seeds lookup data.

---

## Step 4 — Create Admin User

```bash
node utils/seedAdmin.js
```

This creates:
- **Username:** admin
- **Password:** Admin@2025
- **Role:** Analyst

⚠️ Change this password after first login!

---

## Step 5 — Start the Server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server starts at: **http://localhost:5000**

Health check: **http://localhost:5000/health**

---

## Step 6 — Test with Postman

1. Open Postman
2. Import → File → select `POSTMAN_COLLECTION.json`
3. Run "Login" request first — token is saved automatically
4. All other requests use the saved token

---

## API Routes Summary

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| POST | /api/auth/login | Public | Login |
| POST | /api/auth/logout | Any | Logout |
| POST | /api/auth/refresh | Public | Refresh token |
| POST | /api/auth/register | Analyst+ | Create user |
| GET | /api/auth/me | Any | Current user |
| POST | /api/production | Operator+ | Submit record |
| GET | /api/production | Any | List records |
| GET | /api/production/:id | Any | Get record |
| PUT | /api/production/:id | Operator+ | Update record |
| DELETE | /api/production/:id | Analyst+ | Delete record |
| GET | /api/dashboard/summary | Analyst+ | Executive KPIs |
| GET | /api/dashboard/daily | Analyst+ | Daily KPIs |
| GET | /api/dashboard/monthly | Analyst+ | Monthly KPIs |
| GET | /api/dashboard/rooms | Analyst+ | Room comparison |
| GET | /api/dashboard/shifts | Analyst+ | Shift comparison |
| GET | /api/dashboard/oee-trend | Analyst+ | OEE chart data |
| GET | /api/dashboard/stats | Analyst+ | Full statistics |
| GET | /api/audit | Analyst+ | Audit trail |
| GET | /api/audit/exceptions | Analyst+ | Validation violations |
| PATCH | /api/audit/exceptions/:id/resolve | Analyst+ | Resolve exception |
| GET | /api/audit/downtime-causes | Any | Downtime causes list |
| GET | /api/export/excel | Analyst+ | Export Excel |
| GET | /api/export/pdf | Analyst+ | Export PDF |

---

## Connecting Frontend Pages

See `utils/frontendIntegration.js` for copy-paste fetch() examples for each page:

- **Login page** → `loginUser(username, password)`
- **Session form** → `submitProductionRecord(formData)`
- **Dashboard** → `loadDashboardSummary()`, `loadDailyKPIs(date, room)`
- **Activity Log** → `loadProductionRecords(page, filters)`
- **Summary/Export** → `downloadExcelReport(from, to)`

---

## Project File Structure

```
bpap-backend/
├── server.js                 ← Entry point
├── package.json
├── .env                      ← Your config (never commit this)
├── .env.example              ← Template
├── SETUP.md                  ← This file
├── POSTMAN_COLLECTION.json   ← API test collection
│
├── config/
│   ├── db.js                 ← SQL Server connection pool
│   └── schema.sql            ← Full database schema
│
├── controllers/
│   ├── authController.js     ← Login, register, refresh
│   ├── productionController.js ← CRUD for production records
│   ├── dashboardController.js  ← KPI endpoints
│   └── exportController.js   ← Excel & PDF export
│
├── middleware/
│   ├── auth.js               ← JWT verification
│   ├── roles.js              ← Role-based access control
│   ├── errorHandler.js       ← Global error handler
│   ├── requestLogger.js      ← HTTP request logging
│   └── validate.js           ← express-validator result handler
│
├── routes/
│   ├── auth.js
│   ├── production.js
│   ├── dashboard.js
│   ├── audit.js
│   └── export.js
│
├── services/
│   ├── auditService.js       ← Audit trail (append-only)
│   ├── kpiService.js         ← KPI calculations (OEE, efficiency, etc.)
│   └── validationEngine.js   ← Logical validation + exceptions
│
├── utils/
│   ├── logger.js             ← Winston logger
│   ├── response.js           ← Standardized API responses
│   ├── seedAdmin.js          ← Creates first admin user
│   └── frontendIntegration.js ← fetch() examples for your HTML pages
│
├── logs/                     ← Auto-generated log files
└── uploads/                  ← File upload storage
```

---

## KPI Formulas Used

| KPI | Formula |
|-----|---------|
| Production Efficiency | Actual Output ÷ Planned Output |
| Defect Rate | Rejected Units ÷ Actual Units |
| Downtime % | Downtime Minutes ÷ Scheduled Minutes |
| OEE | Availability × Performance × Quality |
| Availability | (Scheduled − Downtime) ÷ Scheduled |
| Performance | min(Actual ÷ (Planned × Availability), 1) |
| Quality | Good Units ÷ Actual Units |

---

## Roles & Permissions

| Role | Data Entry | View Records | Dashboard | Export | Manage Users |
|------|-----------|-------------|-----------|--------|-------------|
| Operator | ✅ Own only | ✅ Own only | ❌ | ❌ | ❌ |
| Analyst | ✅ All | ✅ All | ✅ | ✅ | ✅ Create |
| Manager | ✅ All | ✅ All | ✅ | ✅ | ✅ Create |
| Executive | ❌ | ✅ All | ✅ | ✅ | ❌ |
