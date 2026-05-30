/**
 * BPAP - Seed Admin User
 * Run once: node utils/seedAdmin.js
 * Creates the default admin (Analyst role) with password: Admin@2025
 */

require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { executeQuery, sql, closePool } = require('../config/db');

const seed = async () => {
  const password = 'Admin@2025';
  const hash = await bcrypt.hash(password, 12);

  // Check if admin already exists
  const existing = await executeQuery(
    `SELECT user_id FROM users WHERE username = 'admin'`
  );

  if (existing.recordset.length) {
    console.log('✅ Admin user already exists. Skipping.');
    await closePool();
    return;
  }

  await executeQuery(
    `INSERT INTO users (username, email, password_hash, full_name, role_id)
     VALUES (@username, @email, @hash, @name, @roleId)`,
    {
      username: { type: sql.VarChar(100), value: 'admin' },
      email:    { type: sql.VarChar(150), value: 'admin@joswe.com' },
      hash:     { type: sql.VarChar(255), value: hash },
      name:     { type: sql.VarChar(150), value: 'System Admin' },
      roleId:   { type: sql.Int,          value: 2 },  // Analyst role
    }
  );

  console.log('✅ Admin user created:');
  console.log('   Username: admin');
  console.log('   Password: Admin@2025');
  console.log('   Role: Analyst');
  console.log('⚠️  Change this password immediately after first login!');

  await closePool();
};

seed().catch(console.error);
