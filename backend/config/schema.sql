USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BPAP_DB')
BEGIN
    CREATE DATABASE BPAP_DB;
END
GO

USE BPAP_DB;
GO

-- ================================================================
-- TABLE: roles
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
BEGIN
    CREATE TABLE roles (
        role_id   INT PRIMARY KEY IDENTITY(1,1),
        role_name VARCHAR(50) NOT NULL UNIQUE,  -- Operator, Analyst, Manager, Executive
        created_at DATETIME2 DEFAULT GETDATE()
    );

    -- Seed roles
    INSERT INTO roles (role_name) VALUES
        ('Operator'),
        ('Analyst'),
        ('Manager'),
        ('Executive');
END
GO

-- ================================================================
-- TABLE: users
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
BEGIN
    CREATE TABLE users (
        user_id       INT PRIMARY KEY IDENTITY(1,1),
        username      VARCHAR(100) NOT NULL UNIQUE,
        email         VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(150) NOT NULL,
        role_id       INT NOT NULL,
        room_assigned VARCHAR(10) NULL,          -- B1, B3, B4, B5, B6, B7 (for operators)
        is_active     BIT DEFAULT 1,
        last_login    DATETIME2 NULL,
        created_at    DATETIME2 DEFAULT GETDATE(),
        updated_at    DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES roles(role_id),
        CONSTRAINT CK_room CHECK (room_assigned IN ('B1','B3','B4','B5','B6','B7') OR room_assigned IS NULL)
    );

    -- Create index on username for fast login lookup
    CREATE INDEX IX_users_username ON users(username);
    CREATE INDEX IX_users_role ON users(role_id);
END
GO

-- ================================================================
-- TABLE: refresh_tokens
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='refresh_tokens' AND xtype='U')
BEGIN
    CREATE TABLE refresh_tokens (
        token_id    INT PRIMARY KEY IDENTITY(1,1),
        user_id     INT NOT NULL,
        token       VARCHAR(500) NOT NULL UNIQUE,
        expires_at  DATETIME2 NOT NULL,
        is_revoked  BIT DEFAULT 0,
        created_at  DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_refresh_tokens_users FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE INDEX IX_refresh_tokens_token ON refresh_tokens(token);
END
GO

-- ================================================================
-- TABLE: downtime_causes
-- (lookup table for valid downtime cause values)
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='downtime_causes' AND xtype='U')
BEGIN
    CREATE TABLE downtime_causes (
        cause_id    INT PRIMARY KEY IDENTITY(1,1),
        cause_name  VARCHAR(100) NOT NULL UNIQUE,
        is_active   BIT DEFAULT 1,
        created_at  DATETIME2 DEFAULT GETDATE()
    );

    -- Seed causes from frontend UI
    INSERT INTO downtime_causes (cause_name) VALUES
        ('Machine technical failure'),
        ('Raw material delay'),
        ('Shift change'),
        ('Recalibration'),
        ('Waiting for Package'),
        ('Waiting Q.A Department'),
        ('Stop Packaging'),
        ('Heater Calibration'),
        ('Camera Calibration'),
        ('Other'),
        ('Unspecified');
END
GO

-- ================================================================
-- TABLE: production_records
-- Core data entry table
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_records' AND xtype='U')
BEGIN
    CREATE TABLE production_records (
        record_id           INT PRIMARY KEY IDENTITY(1,1),

        -- Session / Identification
        room                VARCHAR(10) NOT NULL,
        machine             VARCHAR(50) NOT NULL,
        shift_date          DATE NOT NULL,
        shift_number        VARCHAR(10) NOT NULL,     -- Day, Night, Day-Off
        day_of_week         VARCHAR(10) NULL,          -- Sun..Sat
        market_type         VARCHAR(50) NULL,          -- Local, Export (Europe), etc.

        -- Production Quantities
        planned_quantity    INT NOT NULL,
        actual_quantity     INT NOT NULL,
        rejected_quantity   INT NOT NULL DEFAULT 0,
        good_quantity       AS (actual_quantity - rejected_quantity) PERSISTED,  -- computed

        -- Downtime
        downtime_minutes    INT NOT NULL DEFAULT 0,
        scheduled_minutes   INT NOT NULL DEFAULT 480, -- default 8hr shift
        productive_minutes  AS (scheduled_minutes - downtime_minutes) PERSISTED,
        downtime_cause_id   INT NULL,
        downtime_notes      NVARCHAR(500) NULL,

        -- Process / Activity
        process_type        VARCHAR(100) NULL,         -- Blistering, Cleaning, etc.
        activity_type       VARCHAR(100) NULL,
        feeder_active       BIT NULL,

        -- Operator Info
        operator_name       VARCHAR(150) NOT NULL,
        operator_id         INT NOT NULL,              -- FK to users

        -- KPI snapshot (calculated at insert time)
        production_efficiency   DECIMAL(10,4) NULL,
        defect_rate             DECIMAL(10,4) NULL,
        downtime_percentage     DECIMAL(10,4) NULL,
        oee                     DECIMAL(10,4) NULL,

        -- Record metadata
        data_status         VARCHAR(20) DEFAULT 'Valid',  -- Valid, Flagged, Excluded
        is_deleted          BIT DEFAULT 0,
        created_at          DATETIME2 DEFAULT GETDATE(),
        updated_at          DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_prod_room    CHECK (room IN ('B1','B3','B4','B5','B6','B7')),
        CONSTRAINT FK_prod_shift   CHECK (shift_number IN ('Day','Night','Day-Off')),
        CONSTRAINT FK_prod_status  CHECK (data_status IN ('Valid','Flagged','Excluded')),
        CONSTRAINT FK_prod_user    FOREIGN KEY (operator_id) REFERENCES users(user_id),
        CONSTRAINT FK_prod_cause   FOREIGN KEY (downtime_cause_id) REFERENCES downtime_causes(cause_id),
        CONSTRAINT CK_quantities   CHECK (rejected_quantity <= actual_quantity),
        CONSTRAINT CK_downtime     CHECK (downtime_minutes >= 0 AND downtime_minutes <= scheduled_minutes),
        CONSTRAINT CK_planned      CHECK (planned_quantity > 0),
        CONSTRAINT CK_actual       CHECK (actual_quantity >= 0)
    );

    CREATE INDEX IX_prod_room_date ON production_records(room, shift_date);
    CREATE INDEX IX_prod_shift_date ON production_records(shift_date);
    CREATE INDEX IX_prod_operator ON production_records(operator_id);
    CREATE INDEX IX_prod_status ON production_records(data_status);
END
GO

-- ================================================================
-- TABLE: kpi_results
-- Stores aggregated daily/monthly KPI snapshots
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='kpi_results' AND xtype='U')
BEGIN
    CREATE TABLE kpi_results (
        kpi_id                  INT PRIMARY KEY IDENTITY(1,1),
        period_type             VARCHAR(10) NOT NULL,    -- daily, monthly
        period_date             DATE NOT NULL,
        room                    VARCHAR(10) NULL,         -- NULL = all rooms
        shift_number            VARCHAR(10) NULL,

        total_planned           INT NULL,
        total_actual            INT NULL,
        total_rejected          INT NULL,
        total_good              INT NULL,
        total_downtime_minutes  INT NULL,
        record_count            INT NULL,

        avg_efficiency          DECIMAL(10,4) NULL,
        avg_defect_rate         DECIMAL(10,4) NULL,
        avg_downtime_pct        DECIMAL(10,4) NULL,
        avg_oee                 DECIMAL(10,4) NULL,

        calculated_at           DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT CK_kpi_period  CHECK (period_type IN ('daily','monthly')),
        CONSTRAINT CK_kpi_room    CHECK (room IN ('B1','B3','B4','B5','B6','B7') OR room IS NULL)
    );

    CREATE INDEX IX_kpi_period ON kpi_results(period_type, period_date);
    CREATE INDEX IX_kpi_room ON kpi_results(room, period_date);
END
GO

-- ================================================================
-- TABLE: exceptions_log
-- Validation violations detected at entry or re-validation time
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exceptions_log' AND xtype='U')
BEGIN
    CREATE TABLE exceptions_log (
        exception_id    INT PRIMARY KEY IDENTITY(1,1),
        record_id       INT NULL,                        -- FK to production_records (if linked)
        exception_type  VARCHAR(50) NOT NULL,            -- missing_value, range_violation, etc.
        field_name      VARCHAR(100) NULL,
        description     NVARCHAR(500) NOT NULL,
        severity        VARCHAR(10) DEFAULT 'Warning',   -- Error, Warning, Info
        is_resolved     BIT DEFAULT 0,
        resolved_by     INT NULL,
        resolved_at     DATETIME2 NULL,
        created_at      DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_exc_record   FOREIGN KEY (record_id) REFERENCES production_records(record_id),
        CONSTRAINT CK_exc_type     CHECK (exception_type IN (
            'missing_value','invalid_reference','logical_inconsistency',
            'range_violation','format_error','duplicate'
        )),
        CONSTRAINT CK_exc_severity CHECK (severity IN ('Error','Warning','Info'))
    );

    CREATE INDEX IX_exc_record ON exceptions_log(record_id);
    CREATE INDEX IX_exc_type ON exceptions_log(exception_type);
END
GO

-- ================================================================
-- TABLE: audit_logs
-- Append-only — no updates or deletes allowed on this table
-- ================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_logs' AND xtype='U')
BEGIN
    CREATE TABLE audit_logs (
        audit_id        INT PRIMARY KEY IDENTITY(1,1),
        user_id         INT NOT NULL,
        action          VARCHAR(20) NOT NULL,     -- INSERT, UPDATE, DELETE
        table_name      VARCHAR(100) NOT NULL,
        record_id       INT NULL,
        field_name      VARCHAR(100) NULL,
        old_value       NVARCHAR(MAX) NULL,
        new_value       NVARCHAR(MAX) NULL,
        ip_address      VARCHAR(50) NULL,
        user_agent      VARCHAR(300) NULL,
        timestamp       DATETIME2 DEFAULT GETDATE() NOT NULL,

        CONSTRAINT FK_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id),
        CONSTRAINT CK_audit_action CHECK (action IN ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT'))
    );

    CREATE INDEX IX_audit_user ON audit_logs(user_id);
    CREATE INDEX IX_audit_table ON audit_logs(table_name, record_id);
    CREATE INDEX IX_audit_time ON audit_logs(timestamp);
END
GO

-- ================================================================
-- Seed: Default admin user (password: Admin@2025)
-- Run bcrypt hash generation separately and replace below
-- ================================================================
-- INSERT INTO users (username, email, password_hash, full_name, role_id)
-- VALUES ('admin', 'admin@joswe.com', '<bcrypt_hash>', 'System Admin', 2);
-- NOTE: Use the /api/auth/seed endpoint (dev only) or run setup script

PRINT 'BPAP Schema created successfully.';
GO
