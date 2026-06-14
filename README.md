# 🏭 BPAP — Blistering Production Analytics Platform

> A full-stack production data management system developed in cooperation with **JOSWE Pharmaceutical Company**.  
> Yarmouk University · Faculty of Information Technology and Computer Science · 2025/2026

---

## 👥 Team

| Name | ID |
|------|----|
| Laila Al-Omari | 2022903105 |
| Salsabeel Quraan | 2022903114 |
| Rowaa Hatamleh | 2022903100 |
| Noor Shakhatreh | 2022903084 |

**Supervisor:** Dr. Alaadean Al-Hmoud

---

## 📌 Overview

JOSWE's Blistering Production Department manages tablet and capsule packaging across six rooms (B1, B3, B4, B5, B6, B7). Production tracking was previously done manually via Excel, leading to formula errors, inconsistent formats, and unreliable KPIs.

**BPAP** solves this by:
- Replacing error-prone Excel entry with a controlled web-based interface
- Running a structured ETL pipeline into a centralized SQL Server database
- Automatically syncing submitted data to `dbo.Daily_Time_Sheet_Master` for Power BI reporting
- Delivering real-time KPI dashboards for management decision-making

---

## 🏗️ System Architecture

```
[HTML Data Entry UI]
        ↓
[Node.js / Express API]
        ↓
[ETL Pipeline (SQL Stored Procedures)]
        ↓
[Microsoft SQL Server — NEW_Production]
        ↓        ↓
[blistering.Fact_Production]   [dbo.Daily_Time_Sheet_Master]
                                        ↓
                              [Power BI / Excel KPI Dashboard]
```

---

## ✨ Key Features

- **Controlled Data Entry** — Web UI with strict validation (dropdowns, required fields, type checks)
- **ETL Pipeline** — Automated data cleaning, transformation, and loading via SQL stored procedures
- **Power BI Sync** — Every submission automatically updates `Daily_Time_Sheet_Master` for live dashboard refresh
- **Audit Trail** — Every submission is timestamped and logged (ALCOA+ compliant)
- **KPI Calculations** — OEE, Yield %, Defect Rate, Downtime % — auto-calculated
- **Delay Tracking** — Linked to `Dim_DelayType` with code, group, and category
- **Time Exceptions** — Overtime, Night Shift differential, and Overlap tracking
- **Role-Based Access** — Operator / Analyst / Manager / Executive roles

---

## 🗂️ Project Structure

```
JOSWE/
├── backend/
│   ├── config/          # Database connection
│   ├── controllers/     # API logic (production, dashboard, audit)
│   ├── middleware/       # Auth, roles, validation, error handling
│   ├── routes/          # Express routes
│   ├── services/        # Audit service
│   ├── sql/             # SQL stored procedures
│   │   └── usp_Load_Blistering.sql
│   ├── utils/           # Logger, response helpers
│   └── server.js        # Entry point
├── JOSWE_Production_Line-UI-Front.html   # Main frontend
├── Dashboard.html
├── Activity Log.html
├── Delay & Notes.html
├── Summary.html
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Tailwind CSS, Vanilla JS |
| Backend | Node.js, Express.js |
| Database | Microsoft SQL Server |
| ETL | T-SQL Stored Procedures |
| Auth | JWT (role-based) |
| BI | Power BI / Excel Dashboards |

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- Microsoft SQL Server (with `NEW_Production` database)
- npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/laiilla01/BPAP.git
cd BPAP

# 2. Install dependencies
cd backend
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your DB credentials and settings

# 4. Start the server
node server.js
```

### Environment Variables (`.env`)

```env
PORT=5000
DB_SERVER=localhost
DB_NAME=NEW_Production
DB_USER=sa
DB_PASSWORD=your_password
JWT_SECRET=your_secret
ALLOWED_ORIGINS=http://localhost:5500
```

### Running the Frontend

Open `JOSWE_Production_Line-UI-Front.html` in your browser (use Live Server or any local server on port 5500).

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/production` | Submit new batch record |
| `GET` | `/api/production` | List production records |
| `GET` | `/api/production/:id` | Get record by ID |
| `PUT` | `/api/production/:id` | Update record |
| `DELETE` | `/api/production/:id` | Soft-delete record |
| `GET` | `/api/production/products` | Get product list |
| `GET` | `/api/production/delays` | Get delay types |
| `GET` | `/api/production/machines` | Get machine list |
| `GET` | `/api/production/markets` | Get market list |
| `GET` | `/api/dashboard/summary` | Dashboard KPI summary |
| `GET` | `/health` | Server health check |

---

## 🗄️ Database — ETL Flow

```
etl.Stg_BlisteringTimeSheet      ← Raw staging (from UI submission)
        ↓
etl.usp_Validate_Blistering      ← Validation: flags errors, marks clean rows
        ↓
etl.usp_Load_Blistering          ← Loads clean data to:
        ↓                  ↓
blistering.Fact_Production    dbo.Daily_Time_Sheet_Master
(Star schema fact table)      (Power BI reporting table — live sync)
        ↓
shared.Bridge_ProductionEmployee  ← Employee assignments per shift
        ↓
shared.Production_Summary         ← Reporting view for dashboards
```

---

## 📊 KPIs Tracked

- **Production Efficiency** = Actual Output ÷ Planned Output
- **Defect Rate** = Rejected Units ÷ Total Units
- **OEE** = Availability × Performance × Quality
- **Downtime %** = Downtime Minutes ÷ Scheduled Time
- **Yield %** = Actual Qty ÷ Planned Qty × 100

---

## 📄 License

This project was developed as a graduation project at Yarmouk University in cooperation with JOSWE Pharmaceutical Company. All rights reserved © 2026.
