// ============================================
// USER AUTHENTICATION ROUTES
// ============================================
// Handles mobile user registration, login, and profile management

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

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================
router.post('/register', registerUser);              // User registration
router.post('/login', loginUser);                    // User login
router.post('/forgot-password', forgotPassword);     // Request password reset
router.post('/reset-password', resetPassword);       // Reset password with token

// ============================================
// PROTECTED ROUTES (Require Authentication)
// ============================================
router.post('/logout', protect, logoutUser);                 // User logout
router.get('/profile', protect, getUserProfile);             // Get user profile
router.put('/profile', protect, updateUserProfile);          // Update user profile
router.put('/change-password', protect, changePassword);     // Change password
router.delete('/delete', protect, deleteAccount);            // Delete account
router.post('/upload-avatar', protect, uploadAvatar);        // Upload profile picture

module.exports = router;