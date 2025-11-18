const express = require('express');
const {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  changePassword,
  deleteAccount,
  uploadAvatar
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authValidation } = require('../middleware/validation');
const { testEmailConfiguration } = require('../utils/testEmail');
const { verifyToken } = require('../utils/tokenService');
const User = require('../models/userModel');
const Admin = require('../models/adminModel');

const router = express.Router();

// Public Routes
router.post('/register', authValidation.register, registerUser);
router.post('/login', authValidation.login, loginUser);
router.post('/forgot-password', authValidation.forgotPassword, forgotPassword);
router.post('/reset-password', authValidation.resetPassword, resetPassword);

// Token verification endpoint (handles both user and admin tokens)
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, no token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Check if it's an admin token
    if (decoded.tokenType === 'admin') {
      const admin = await Admin.findById(decoded.id).select('-password');

      if (!admin) {
        return res.status(401).json({
          status: 'error',
          message: 'Admin not found'
        });
      }

      if (!admin.isActive) {
        return res.status(403).json({
          status: 'error',
          message: 'Account is deactivated'
        });
      }

      return res.json({
        status: 'success',
        message: 'Token is valid',
        tokenType: 'admin',
        user: {
          id: admin._id,
          username: admin.username,
          email: admin.email,
          role: admin.role
        }
      });
    }
    // Otherwise it's a user token
    else {
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'User not found'
        });
      }

      return res.json({
        status: 'success',
        message: 'Token is valid',
        tokenType: 'user',
        user: {
          id: user._id,
          username: user.username,
          email: user.email
        }
      });
    }
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired'
      });
    }
    return res.status(401).json({
      status: 'error',
      message: 'Not authorized'
    });
  }
});
router.post('/logout', protect, logoutUser);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.put('/change-password', protect, changePassword);
router.delete('/delete', protect, deleteAccount);
router.post('/upload-avatar', protect, uploadAvatar);

// Development/Testing Routes (only enabled in development mode)
if (process.env.NODE_ENV === 'development') {
  router.get('/test-email', async (req, res) => {
    try {
      const success = await testEmailConfiguration();
      if (success) {
        res.json({
          status: 'success',
          message: 'Email test passed! Check the server console for details.',
          checkInbox: process.env.EMAIL_USER
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Email test failed. Check the server console for details.'
        });
      }
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
        details: 'Check the server console for more information'
      });
    }
  });
}

module.exports = router;
