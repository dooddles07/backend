const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { protectAdmin } = require('../middleware/adminMiddlware');
const {
  getOrCreateConversation,
  getUserConversations,
  getAdminConversations,
  sendMessage,
  getConversationMessages,
  markMessagesAsRead,
  archiveConversation,
} = require('../controllers/messageController');

const router = express.Router();

// Dual Authentication Middleware
const protectUserOrAdmin = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.tokenType === 'user') {
      const User = require('../models/userModel');
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = user;
      req.userType = 'user';
      next();
    } else if (decoded.tokenType === 'admin') {
      const Admin = require('../models/adminModel');
      const admin = await Admin.findById(decoded.id).select('-password');

      if (!admin) {
        return res.status(401).json({ message: 'Admin not found' });
      }

      if (!admin.isActive) {
        return res.status(401).json({ message: 'Admin account is inactive' });
      }

      req.admin = admin;
      req.userType = 'admin';
      next();
    } else {
      return res.status(401).json({ message: 'Invalid token type' });
    }
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token verification failed' });
  }
};

// Conversation Routes
router.post('/conversation', protectUserOrAdmin, getOrCreateConversation);
router.get('/conversations/user', protect, getUserConversations);
router.get('/conversations/admin', protectAdmin, getAdminConversations);
router.put('/conversation/:id/archive', protectAdmin, archiveConversation);

// Message Routes
router.post('/send', protectUserOrAdmin, sendMessage);
router.get('/conversation/:id', protectUserOrAdmin, getConversationMessages);
router.put('/conversation/:id/read', protectUserOrAdmin, markMessagesAsRead);

module.exports = router;
