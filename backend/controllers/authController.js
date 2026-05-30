/**
 * BPAP - Authentication Controller
 * Handles login, logout, refresh tokens, and user management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { executeQuery, sql } = require('../config/db');
const { logAudit } = require('../services/auditService');
const { success, created, error } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Generate access + refresh tokens
 */
const generateTokens = (user) => {
  const payload = {
    user_id:  user.user_id,
    username: user.username,
    role:     user.role_name,
    room:     user.room_assigned,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  const refreshToken = jwt.sign(
    { user_id: user.user_id, jti: uuidv4() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// ── POST /api/auth/login ───────────────────────────────────
const login = async (req, res) => {
  const { username, password } = req.body;

  // Find user by username
  const result = await executeQuery(
    `SELECT u.*, r.role_name
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.username = @username AND u.is_active = 1`,
    { username: { type: sql.VarChar(100), value: username } }
  );

  if (!result.recordset.length) {
    return error(res, 'Invalid username or password.', 401);
  }

  const user = result.recordset[0];

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return error(res, 'Invalid username or password.', 401);
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Save refresh token to DB
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await executeQuery(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES (@userId, @token, @expiresAt)`,
    {
      userId:    { type: sql.Int,          value: user.user_id },
      token:     { type: sql.VarChar(500), value: refreshToken },
      expiresAt: { type: sql.DateTime2,    value: expiresAt },
    }
  );

  // Update last login
  await executeQuery(
    `UPDATE users SET last_login = GETDATE() WHERE user_id = @userId`,
    { userId: { type: sql.Int, value: user.user_id } }
  );

  // Audit log
  await logAudit({
    userId:    user.user_id,
    action:    'LOGIN',
    tableName: 'users',
    recordId:  user.user_id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return success(res, {
    accessToken,
    refreshToken,
    user: {
      user_id:      user.user_id,
      username:     user.username,
      full_name:    user.full_name,
      role:         user.role_name,
      room_assigned: user.room_assigned,
    },
  }, 'Login successful');
};

// ── POST /api/auth/refresh ─────────────────────────────────
const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return error(res, 'Refresh token required.', 400);

  // Verify token signature
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return error(res, 'Invalid or expired refresh token.', 401);
  }

  // Check it exists in DB and is not revoked
  const result = await executeQuery(
    `SELECT * FROM refresh_tokens
     WHERE token = @token AND is_revoked = 0 AND expires_at > GETDATE()`,
    { token: { type: sql.VarChar(500), value: token } }
  );

  if (!result.recordset.length) {
    return error(res, 'Refresh token revoked or expired.', 401);
  }

  // Get user
  const userResult = await executeQuery(
    `SELECT u.*, r.role_name FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = @userId AND u.is_active = 1`,
    { userId: { type: sql.Int, value: decoded.user_id } }
  );

  if (!userResult.recordset.length) {
    return error(res, 'User not found.', 404);
  }

  const user = userResult.recordset[0];
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

  // Revoke old, insert new refresh token
  await executeQuery(
    `UPDATE refresh_tokens SET is_revoked = 1 WHERE token = @token`,
    { token: { type: sql.VarChar(500), value: token } }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await executeQuery(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (@userId, @token, @expiresAt)`,
    {
      userId:    { type: sql.Int,          value: user.user_id },
      token:     { type: sql.VarChar(500), value: newRefreshToken },
      expiresAt: { type: sql.DateTime2,    value: expiresAt },
    }
  );

  return success(res, { accessToken, refreshToken: newRefreshToken }, 'Token refreshed');
};

// ── POST /api/auth/logout ─────────────────────────────────
const logout = async (req, res) => {
  const { refreshToken: token } = req.body;

  if (token) {
    await executeQuery(
      `UPDATE refresh_tokens SET is_revoked = 1 WHERE token = @token`,
      { token: { type: sql.VarChar(500), value: token } }
    );
  }

  await logAudit({
    userId:    req.user.user_id,
    action:    'LOGOUT',
    tableName: 'users',
    recordId:  req.user.user_id,
    ipAddress: req.ip,
  });

  return success(res, null, 'Logged out successfully');
};

// ── POST /api/auth/register (Analyst/Manager only) ────────
const register = async (req, res) => {
  const { username, email, password, full_name, role_id, room_assigned } = req.body;

  // Check duplicate
  const existing = await executeQuery(
    `SELECT user_id FROM users WHERE username = @username OR email = @email`,
    {
      username: { type: sql.VarChar(100), value: username },
      email:    { type: sql.VarChar(150), value: email },
    }
  );
  if (existing.recordset.length) {
    return error(res, 'Username or email already exists.', 409);
  }

  const password_hash = await bcrypt.hash(password, 12);

  const result = await executeQuery(
    `INSERT INTO users (username, email, password_hash, full_name, role_id, room_assigned)
     OUTPUT INSERTED.user_id
     VALUES (@username, @email, @hash, @fullName, @roleId, @room)`,
    {
      username: { type: sql.VarChar(100), value: username },
      email:    { type: sql.VarChar(150), value: email },
      hash:     { type: sql.VarChar(255), value: password_hash },
      fullName: { type: sql.VarChar(150), value: full_name },
      roleId:   { type: sql.Int,          value: role_id },
      room:     { type: sql.VarChar(10),  value: room_assigned || null },
    }
  );

  const newUserId = result.recordset[0].user_id;

  await logAudit({
    userId:    req.user.user_id,
    action:    'INSERT',
    tableName: 'users',
    recordId:  newUserId,
    newValue:  JSON.stringify({ username, email, role_id }),
    ipAddress: req.ip,
  });

  return created(res, { user_id: newUserId }, 'User created successfully');
};

// ── GET /api/auth/me ──────────────────────────────────────
const getMe = async (req, res) => {
  const result = await executeQuery(
    `SELECT u.user_id, u.username, u.email, u.full_name, u.room_assigned,
            u.last_login, u.created_at, r.role_name
     FROM users u JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = @userId`,
    { userId: { type: sql.Int, value: req.user.user_id } }
  );

  if (!result.recordset.length) return error(res, 'User not found.', 404);
  return success(res, result.recordset[0]);
};

module.exports = { login, logout, refreshToken, register, getMe };
