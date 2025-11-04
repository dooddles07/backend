require('dotenv').config();

// Dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

// Routes
const authRouter = require('./routes/authRouter');
const sosRouter = require('./routes/sosRouter');
const messageRouter = require('./routes/messageRouter');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// ============================================
// DATABASE CONFIGURATION
// ============================================

// Auto-create super admin on first run
const createSuperAdminIfNeeded = async () => {
  try {
    const Admin = require('./models/adminModel');

    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      console.log('✅ Super admin already exists');
      return;
    }

    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    const superAdmin = new Admin({
      fullname: 'Super Admin',
      email: 'admin@resqyou.com',
      username: 'superadmin',
      password: hashedPassword,
      role: 'super_admin',
      department: 'Administration',
      contactNumber: '+1234567890',
      isActive: true
    });

    await superAdmin.save();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Super Admin Created!');
    console.log('📧 Email: admin@resqyou.com');
    console.log('👤 Username: superadmin');
    console.log('🔑 Password: Admin@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
  }
};

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await createSuperAdminIfNeeded();
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============================================
// API ROUTES
// ============================================
app.use('/api/auth', authRouter);      // Mobile user authentication
app.use('/api/sos', sosRouter);        // SOS emergency routes
app.use('/api/messages', messageRouter); // Messaging between users and admins

// Load admin routes if available
try {
  const adminRouter = require('./routes/adminRouter');
  app.use('/api/admin', adminRouter);  // Admin/Web authentication
  console.log('✅ Admin routes loaded');
} catch (error) {
  console.log('⚠️  Admin routes not loaded');
}

// ============================================
// HEALTH CHECK & ERROR HANDLERS
// ============================================

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ResQYou API is running',
    status: 'OK',
    version: '1.0.0',
    endpoints: {
      mobile: '/api/auth',
      admin: '/api/admin',
      sos: '/api/sos',
      messages: '/api/messages'
    }
  });
});

// 404 handler - catches undefined routes
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.stack : 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 ResQYou Server Started Successfully');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Mobile API: http://localhost:${PORT}/api/auth`);
  console.log(`💻 Admin API: http://localhost:${PORT}/api/admin`);
  console.log(`🆘 SOS API: http://localhost:${PORT}/api/sos`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;