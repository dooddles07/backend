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

const router = express.Router();

// Public Routes
router.post('/register', authValidation.register, registerUser);
router.post('/login', authValidation.login, loginUser);
router.post('/forgot-password', authValidation.forgotPassword, forgotPassword);
router.post('/reset-password', authValidation.resetPassword, resetPassword);

// Protected Routes
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
