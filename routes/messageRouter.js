/**
 * ============================================
 * MESSAGE ROUTES
 * ============================================
 *
 * API endpoints for messaging between users (mobile) and admins (web)
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { protect } = require('../middleware/authMiddleware');
const { protectAdmin } = require('../middleware/adminMiddlware');

// Import controllers
const {
  getOrCreateConversation,
  getUserConversations,
  getAdminConversations,
  assignAdminToConversation,
  sendMessage,
  getConversationMessages,
  markMessagesAsRead,
  archiveConversation,
} = require('../controllers/messageController');

// ============================================
// DUAL AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Middleware that accepts either user or admin authentication
 * Tries user auth first, then admin auth if user auth fails
 */
const protectUserOrAdmin = async (req, res, next) => {
  console.log('\n🔐 === protectUserOrAdmin middleware called ===');
  console.log('Request path:', req.path);
  console.log('Request method:', req.method);

  // First, try to get the token
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('✅ Token found in Authorization header');
    console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
  }

  if (!token) {
    console.log('❌ No token provided in request');
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const jwt = require('jsonwebtoken');
    console.log('🔍 Verifying JWT token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log('✅ Token verified successfully');
    console.log('Decoded token:', {
      id: decoded.id,
      tokenType: decoded.tokenType,
      iat: decoded.iat,
      exp: decoded.exp
    });

    // Check token type and authenticate accordingly
    if (decoded.tokenType === 'user') {
      console.log('👤 Token type: USER');
      // User authentication
      const User = require('../models/userModel');
      console.log('🔍 Looking up user by ID:', decoded.id);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        console.log('❌ User not found in database');
        return res.status(401).json({ message: 'User not found' });
      }

      console.log('✅ User authenticated:', user.fullname, user.email);
      req.user = user;
      req.userType = 'user';
      console.log('=== protectUserOrAdmin completed (USER) ===\n');
      next();
    } else if (decoded.tokenType === 'admin') {
      console.log('👔 Token type: ADMIN');
      // Admin authentication
      const Admin = require('../models/adminModel');
      console.log('🔍 Looking up admin by ID:', decoded.id);
      const admin = await Admin.findById(decoded.id).select('-password');

      if (!admin) {
        console.log('❌ Admin not found in database');
        return res.status(401).json({ message: 'Admin not found' });
      }

      if (!admin.isActive) {
        console.log('❌ Admin account is inactive');
        return res.status(401).json({ message: 'Admin account is inactive' });
      }

      console.log('✅ Admin authenticated:', admin.fullname, admin.email);
      req.admin = admin;
      req.userType = 'admin';
      console.log('=== protectUserOrAdmin completed (ADMIN) ===\n');
      next();
    } else {
      console.log('❌ Invalid token type:', decoded.tokenType);
      return res.status(401).json({ message: 'Invalid token type' });
    }
  } catch (error) {
    console.error('❌ Authentication error:', error.name);
    console.error('Error message:', error.message);
    if (error.name === 'TokenExpiredError') {
      console.error('Token expired at:', error.expiredAt);
    } else if (error.name === 'JsonWebTokenError') {
      console.error('Invalid token');
    }
    return res.status(401).json({ message: 'Not authorized, token verification failed' });
  }
};

// ============================================
// CONVERSATION ROUTES
// ============================================

/**
 * POST /api/messages/conversation
 * Get or create a conversation
 * Used by both users and admins to start a conversation
 */
router.post('/conversation', protectUserOrAdmin, getOrCreateConversation);

/**
 * GET /api/messages/conversations/user
 * Get all conversations for the authenticated user
 * Mobile app users use this to see their chat list
 */
router.get('/conversations/user', protect, getUserConversations);

/**
 * GET /api/messages/conversations/admin
 * Get all conversations for admin view
 * Web dashboard admins use this to see all user chats
 */
router.get('/conversations/admin', protectAdmin, getAdminConversations);

/**
 * PUT /api/messages/conversation/:id/assign
 * Assign the authenticated admin to a conversation
 * Allows admins to take ownership of user conversations
 */
router.put('/conversation/:id/assign', protectAdmin, assignAdminToConversation);

/**
 * PUT /api/messages/conversation/:id/archive
 * Archive a conversation
 * Admins can archive completed conversations
 */
router.put('/conversation/:id/archive', protectAdmin, archiveConversation);

// ============================================
// MESSAGE ROUTES
// ============================================

/**
 * POST /api/messages/send
 * Send a message in a conversation
 * Used by both users and admins
 */
router.post('/send', protectUserOrAdmin, sendMessage);

/**
 * GET /api/messages/conversation/:id
 * Get all messages in a conversation
 * Used by both users and admins
 * Supports pagination via query params: ?limit=50&skip=0
 */
router.get('/conversation/:id', protectUserOrAdmin, getConversationMessages);

/**
 * PUT /api/messages/conversation/:id/read
 * Mark messages as read
 * Used by both users and admins to mark incoming messages as read
 */
router.put('/conversation/:id/read', protectUserOrAdmin, markMessagesAsRead);

module.exports = router;
