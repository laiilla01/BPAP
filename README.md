# BPAP — Blistering Production Analytics Platform
**JOSWE Pharmaceutical Company**

---

## Project Structure

```
JOSWE-UI/                              ← Root project folder
│
├── 📄 JOSWE_Production_Line-UI-Front.html   ← Main login / session entry page
├── 📄 Dashboard.html                        ← KPI dashboard
├── 📄 Activity Log.html                     ← Production records log
├── 📄 Batch Info.html                       ← Batch information
├── 📄 Delay & Notes.html                    ← Delay / downtime entry
├── 📄 Summary.html                          ← Summary & export page
│
└── backend/                           ← Node.js API server
    ├── server.js                      ← Entry point (port 5000)
    ├── package.json
    ├── .env                           ← Your config (create from .env.example)
    ├── .env.example
    ├── SETUP.md                       ← Detailed setup guide
    ├── POSTMAN_COLLECTION.json        ← API test collection
    │
    ├── config/
    │   ├── db.js                      ← SQL Server connection
    │   └── schema.sql                 ← Run this first in SQL Server
    │
    ├── controllers/
    │   ├── authController.js
    │   ├── productionController.js
    │   ├── dashboardController.js
    │   └── exportController.js
    │
    ├── middleware/
    │   ├── auth.js                    ← JWT verification
    │   ├── roles.js                   ← Role-based access
    │   ├── errorHandler.js
    │   ├── requestLogger.js
    │   └── validate.js
    │
    ├── routes/
    │   ├── auth.js
    │   ├── production.js
    │   ├── dashboard.js
    │   ├── audit.js
    │   └── export.js
    │
    ├── services/
    │   ├── auditService.js            ← Append-only audit trail
    │   ├── kpiService.js              ← OEE, efficiency, defect rate
    │   └── validationEngine.js        ← Logical validation + exceptions
    │
    └── utils/
        ├── logger.js
        ├── response.js
        ├── seedAdmin.js               ← Run once to create admin user
        └── frontendIntegration.js     ← fetch() examples for HTML pages
```

---

## Quick Start

### 1. Setup the database
Open SQL Server Management Studio and run:
```
backend/config/schema.sql
```

### 2. Configure environment
```bash
cd backend
cp .env.example .env
# Edit .env with your SQL Server IP, password, and JWT secret
```

### 3. Install and run
```bash
cd backend
npm install
node utils/seedAdmin.js    # creates admin user (run once)
npm run dev                # starts API on http://localhost:5000
```

### 4. Open the frontend
Open `JOSWE_Production_Line-UI-Front.html` in your browser.
The HTML pages call the backend at `http://localhost:5000/api`.

---

## Default Login
| Field | Value |
|-------|-------|
| Username | admin |
| Password | Admin@2025 |
| Role | Analyst |

⚠️ Change the password after first login.

---

## API Base URL
```
http://localhost:5000/api
```

See `backend/SETUP.md` for the full API route table and role permissions.
