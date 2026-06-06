-- ================================================================
-- BPAP Auth Tables Setup for NEW_Production database
-- Run this ONCE in SQL Server Management Studio (SSMS)
-- These tables sit alongside the existing production tables
-- ================================================================

USE NEW_Production;
GO

-- ── roles ────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
BEGIN
    CREATE TABLE roles (
        role_id   INT PRIMARY KEY IDENTITY(1,1),
        role_name VARCHAR(50) NOT NULL UNIQUE
    );
    INSERT INTO roles (role_name) VALUES
        ('Operator'), ('Analyst'), ('Manager'), ('Executive');
    PRINT 'Created: roles';
END
GO

-- ── users ────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
BEGIN
    CREATE TABLE users (
        user_id       INT PRIMARY KEY IDENTITY(1,1),
        username      VARCHAR(100) NOT NULL UNIQUE,
        email         VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(150) NOT NULL,
        role_id       INT NOT NULL,
        room_assigned VARCHAR(10)  NULL,
        is_active     BIT DEFAULT 1,
        last_login    DATETIME2    NULL,
        created_at    DATETIME2    DEFAULT GETDATE(),
        updated_at    DATETIME2    DEFAULT GETDATE(),
        CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES roles(role_id)
    );
    CREATE INDEX IX_users_username ON users(username);
    PRINT 'Created: users';
END
GO

-- ── refresh_tokens ───────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='refresh_tokens' AND xtype='U')
BEGIN
    CREATE TABLE refresh_tokens (
        token_id   INT PRIMARY KEY IDENTITY(1,1),
        user_id    INT NOT NULL,
        token      VARCHAR(500) NOT NULL UNIQUE,
        expires_at DATETIME2 NOT NULL,
        is_revoked BIT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_refresh_tokens_users FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
    PRINT 'Created: refresh_tokens';
END
GO

-- ── audit_log ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_log' AND xtype='U')
BEGIN
    CREATE TABLE audit_log (
        audit_id   INT PRIMARY KEY IDENTITY(1,1),
        user_id    INT NOT NULL,
        action     VARCHAR(20) NOT NULL,
        table_name VARCHAR(100) NULL,
        record_id  INT NULL,
        description NVARCHAR(MAX) NULL,
        ip_address VARCHAR(50) NULL,
        timestamp  DATETIME2 DEFAULT GETDATE() NOT NULL,
        CONSTRAINT FK_audit_users FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
    CREATE INDEX IX_audit_log_time ON audit_log(timestamp);
    PRINT 'Created: audit_log';
END
GO

PRINT '== Schema setup complete. Run seedAdmin.js next. ==';
GO
