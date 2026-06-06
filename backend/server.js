/**
 * ================================================================
 * BPAP - Blistering Production Analytics Platform
 * Backend Server Entry Point
 * JOSWE Pharmaceutical Company
 * ================================================================
 */

require('dotenv').config();
require('express-async-errors'); // Catch async errors without try/catch

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const { getPool, closePool } = require('./config/db');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// ── Route Imports ─────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const productionRoutes = require('./routes/production');
const dashboardRoutes  = require('./routes/dashboard');
const auditRoutes      = require('./routes/audit');
const exportRoutes     = require('./routes/export');

const app = express();

// ── Security Middleware ───────────────────────────────────
app.use(helmet());  // Sets secure HTTP headers

// CORS — allow configured origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (e.g. Postman, mobile apps in dev)
    // Also allow 'null' string origin sent by file:// protocol in browsers
    if (!origin || origin === 'null' || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — global
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// Stricter limiter for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logging ───────────────────────────────────────
app.use(requestLogger);

// ── Static uploads folder ─────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'BPAP API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/audit',      auditRoutes);
app.use('/api/export',     exportRoutes);

// ── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    await getPool();

    app.listen(PORT, () => {
      console.log(`🚀 BPAP Server running on port ${PORT}`);
      console.log(`📋 Health Check: http://localhost:${PORT}/health`);
    });

  } catch (err) {
    console.error('==============================');
    console.error('SERVER STARTUP ERROR');
    console.error('==============================');
    console.error(err);
    console.error('==============================');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down gracefully');
  await closePool();
  process.exit(0);
});

startServer();
