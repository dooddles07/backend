require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const { RATE_LIMITING, UPLOAD, ADMIN_ROLES } = require('./config/constants');
const { hashPassword } = require('./utils/passwordService');

const authRouter = require('./routes/authRouter');
const sosRouter = require('./routes/sosRouter');
const messageRouter = require('./routes/messageRouter');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 10000;

// Trust proxy - Required for deployment behind reverse proxies (Render, Heroku, etc.)
// This allows express-rate-limit to correctly identify client IPs
app.set('trust proxy', 1);

// Socket.IO Configuration
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`👤 User ${userId} joined room`);
  });

  socket.on('join-admin', (adminId, callback) => {
    console.log(`📡 Received join-admin request from admin: ${adminId}`);
    console.log(`   Socket ID: ${socket.id}`);
    console.log(`   Callback type: ${typeof callback}`);

    socket.join('admin-room');
    socket.join(adminId);
    console.log(`✅ Admin ${adminId} successfully joined admin-room`);
    console.log(`   Admin is now in rooms:`, Array.from(socket.rooms));

    // Send acknowledgment back to client
    if (callback && typeof callback === 'function') {
      const response = { success: true, message: 'Joined admin room successfully' };
      console.log(`📤 Sending callback response:`, response);
      callback(response);
      console.log(`✅ Callback sent`);
    } else {
      console.warn(`⚠️ No callback provided or callback is not a function`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// CORS Configuration - MUST be applied BEFORE rate limiting to ensure headers are always sent
const corsOptions = {
  origin: function (origin, callback) {
    console.log(`📡 Incoming request from origin: ${origin || 'No Origin (mobile/Postman)'}`);

    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) {
      console.log('   ✅ Allowed: No origin (mobile/native app)');
      return callback(null, true);
    }

    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8082',     // Web app (Expo)
      'http://localhost:19006',    // Web app (alternative port)
      'http://localhost:3000',     // Alternative dev port
      'http://127.0.0.1:8082',     // Localhost alternative
      'http://192.168.100.6:8082', // Local network web access
      'http://192.168.100.6:19006', // Local network alternative
      process.env.FRONTEND_URL,    // Production frontend
    ].filter(Boolean); // Remove undefined values

    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`   ✅ Allowed: ${origin}`);
      callback(null, true);
    } else {
      // For development, allow all origins and just log a warning
      console.log(`   ⚠️ Origin not in whitelist but allowing for development: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Middleware Configuration
app.use(express.json({ limit: UPLOAD.JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: UPLOAD.JSON_LIMIT }));

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

// Rate Limiting Configuration
const limiter = rateLimit({
  windowMs: RATE_LIMITING.WINDOW_MS,
  max: RATE_LIMITING.MAX_REQUESTS,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for frequently accessed endpoints
    const skipPaths = [
      '/sos/all-active',
      '/sos/all-history',
      '/messages/conversations',
      '/messages/conversation' // Skip all conversation endpoints including read/fetch
    ];
    return skipPaths.some(path => req.path.includes(path));
  },
  // Ensure CORS headers are sent even when rate limited
  skipFailedRequests: false,
  skipSuccessfulRequests: false
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMITING.WINDOW_MS,
  max: RATE_LIMITING.AUTH_MAX_REQUESTS,
  message: 'Too many authentication attempts, please try again later.',
  skip: (req) => req.path === '/verify' // Skip rate limiting for token verification
});

app.use('/api/', limiter);

// Database Configuration
const createSuperAdminIfNeeded = async () => {
  try {
    const Admin = require('./models/adminModel');

    const existingSuperAdmin = await Admin.findOne({ role: ADMIN_ROLES.SUPER_ADMIN });
    if (existingSuperAdmin) {
      console.log('Super admin already exists');
      return;
    }

    const hashedPassword = await hashPassword('Admin@123');
    const superAdmin = new Admin({
      fullname: 'Super Admin',
      email: 'admin@resqyou.com',
      username: 'superadmin',
      password: hashedPassword,
      role: ADMIN_ROLES.SUPER_ADMIN,
      department: 'Administration',
      contactNumber: '+1234567890',
      isActive: true
    });

    await superAdmin.save();
    console.log('\nSuper Admin Created:');
    console.log('Email: admin@resqyou.com | Username: superadmin | Password: Admin@123');
    console.log('IMPORTANT: Change this password after first login!\n');
  } catch (error) {
    console.error('Error creating super admin:', error.message);
  }
};

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await createSuperAdminIfNeeded();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// API Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/sos', sosRouter);
app.use('/api/messages', messageRouter);

try {
  const adminRouter = require('./routes/adminRouter');
  app.use('/api/admin', authLimiter, adminRouter);
  console.log('Admin routes loaded');
} catch (error) {
  console.log('Admin routes not available');
}

// Health Check & Error Handlers
app.get('/', (req, res) => {
  res.json({
    message: 'ResQYou API is running',
    status: 'OK',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      sos: '/api/sos',
      messages: '/api/messages'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`\nResQYou Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`WebSocket: http://localhost:${PORT}\n`);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('Server closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

module.exports = app;
