require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

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

// Socket.IO Configuration with Authentication
const { verifyToken } = require('./utils/tokenService');

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// 🔒 Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    console.warn(`❌ Socket connection rejected: No token provided`);
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.id;
    socket.username = decoded.username; // 🔒 Store username for room verification
    socket.userRole = decoded.role;
    socket.tokenType = decoded.tokenType;
    console.log(`✅ Socket authenticated: ${decoded.username} (${decoded.tokenType})`);
    next();
  } catch (error) {
    console.error(`❌ Socket authentication failed:`, error.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id} (User: ${socket.userId})`);

  socket.on('join', (roomId) => {
    // 🔒 Handle username-based rooms (format: user-username)
    if (typeof roomId === 'string' && roomId.startsWith('user-')) {
      const requestedUsername = roomId.substring(5); // Remove 'user-' prefix

      // Verify user can only join their own username room
      if (socket.username !== requestedUsername && socket.tokenType !== 'admin') {
        console.error(`❌ Unauthorized: ${socket.username} tried to join room ${roomId}`);
        return;
      }

      socket.join(roomId);
      console.log(`👤 User ${socket.username} joined username room: ${roomId}`);
      return;
    }

    // 🔒 Handle userId-based rooms (MongoDB ObjectId)
    // Convert both to strings for comparison (handles ObjectId vs string mismatch)
    const socketUserIdStr = socket.userId?.toString();
    const roomIdStr = roomId?.toString();

    if (socketUserIdStr !== roomIdStr && socket.tokenType !== 'admin') {
      console.error(`❌ Unauthorized: User ${socketUserIdStr} tried to join room ${roomIdStr}`);
      return;
    }

    socket.join(roomIdStr);
    console.log(`👤 User ${socketUserIdStr} joined their userId room: ${roomIdStr}`);
  });

  socket.on('join-admin', (adminId, callback) => {
    console.log(`📡 Received join-admin request from admin: ${adminId}`);

    // 🔒 SECURITY: Verify user is actually an admin
    if (socket.tokenType !== 'admin') {
      console.error(`❌ Unauthorized: Non-admin tried to join admin room`);
      if (callback && typeof callback === 'function') {
        callback({ success: false, message: 'Unauthorized: Admin access required' });
      }
      return;
    }

    // 🔒 Verify admin can only join their own admin room
    if (socket.userId !== adminId) {
      console.error(`❌ Unauthorized: Admin ${socket.userId} tried to join admin room ${adminId}`);
      if (callback && typeof callback === 'function') {
        callback({ success: false, message: 'Unauthorized: Cannot join another admin\'s room' });
      }
      return;
    }

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

    // List of allowed origins from environment variable
    // 🔒 SECURITY: Configure allowed origins in .env file
    // Format: Comma-separated list (e.g., "http://localhost:3000,http://192.168.1.1:19006")
    const envOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : [];

    const allowedOrigins = [
      ...envOrigins,
      process.env.FRONTEND_URL,  // Backward compatibility
    ].filter(Boolean); // Remove undefined values

    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`   ✅ Allowed: ${origin}`);
      callback(null, true);
    } else {
      // 🔒 SECURITY FIX: Block unauthorized origins
      const errorMsg = `❌ Blocked: Unauthorized origin: ${origin}`;
      console.error(errorMsg);

      // In development, you can set ALLOW_ALL_ORIGINS=true in .env to bypass this
      if (process.env.ALLOW_ALL_ORIGINS === 'true') {
        console.warn(`   ⚠️ ALLOW_ALL_ORIGINS is enabled - allowing ${origin}`);
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
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
      console.log('✅ Super admin already exists');
      return;
    }

    // 🔒 SECURITY: Password must come from environment variable
    if (!process.env.SUPER_ADMIN_PASSWORD) {
      console.error('❌ SUPER_ADMIN_PASSWORD environment variable is required!');
      console.error('   Please add SUPER_ADMIN_PASSWORD to your .env file');
      return;
    }
    const hashedPassword = await hashPassword(process.env.SUPER_ADMIN_PASSWORD);

    const superAdmin = new Admin({
      fullname: process.env.SUPER_ADMIN_FULLNAME || 'Super Admin',
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@resqyou.com',
      username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
      password: hashedPassword,
      role: ADMIN_ROLES.SUPER_ADMIN,
      department: process.env.SUPER_ADMIN_DEPARTMENT || 'Administration',
      contactNumber: process.env.SUPER_ADMIN_CONTACT || '',
      isActive: true
    });

    await superAdmin.save();

    // 🔒 SECURITY: Only show credentials in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('\n⚠️  ========================================');
      console.log('⚠️  SUPER ADMIN CREATED (DEVELOPMENT MODE)');
      console.log('⚠️  ========================================');
      console.log(`Email: ${superAdmin.email}`);
      console.log(`Username: ${superAdmin.username}`);
      console.log('Password: [Set in SUPER_ADMIN_PASSWORD env variable]');
      console.log('⚠️  CRITICAL: Change this password after first login!');
      console.log('⚠️  ========================================\n');
    } else {
      console.log('✅ Super admin created. Check SUPER_ADMIN_PASSWORD env variable.');
    }
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
  }
};

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await createSuperAdminIfNeeded();

    // 🔄 Cron job: Keep server alive by refreshing MongoDB every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        const SOS = require('./models/sosModel');
        const count = await SOS.countDocuments();
        console.log(`🔄 [Cron] Database refresh - Active connection maintained. Total SOS records: ${count}`);
        console.log(`   Timestamp: ${new Date().toISOString()}`);
      } catch (error) {
        console.error('❌ [Cron] Database refresh failed:', error.message);
      }
    });

    console.log('✅ Cron job scheduled: Database refresh every 15 minutes');
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
