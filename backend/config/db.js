const sql = require('mssql');
const logger = require('../utils/logger');

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME ,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false', // default true for local SQL Server
    enableArithAbort: true,
  },
  pool: {
    max: 10,      
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

let pool = null;


const getPool = async () => {
  if (pool && pool.connected) return pool;

  try {
    pool = await sql.connect(dbConfig);
    logger.info('✅ Connected to SQL Server successfully');
    return pool;
  } catch (err) {
    logger.error('❌ SQL Server connection failed:', err.message);
    console.error(err);
    throw err;
  }
};

const executeQuery = async (query, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  // Bind parameters to prevent SQL injection
  for (const [key, { type, value }] of Object.entries(params)) {
    request.input(key, type, value);
  }

  return request.query(query);
};


const executeProcedure = async (procName, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  for (const [key, { type, value }] of Object.entries(params)) {
    request.input(key, type, value);
  }

  return request.execute(procName);
};

const closePool = async () => {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('SQL Server connection pool closed');
  }
};

module.exports = { sql, getPool, executeQuery, executeProcedure, closePool };
