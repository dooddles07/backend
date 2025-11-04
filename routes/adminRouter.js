// ============================================
// ADMIN AUTHENTICATION & MANAGEMENT ROUTES
// ============================================
// Handles admin/web user authentication and management

const express = require('express');
const {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  deleteAdminAccount,
  getAllUsers,
  getAllAdmins,
  toggleAdminStatus,
  getDashboardStats,
  forgotAdminPassword,
  resetAdminPassword
} = require('../controllers/adminController');
const { protectAdmin, isSuperAdmin } = require('../middleware/adminMiddlware');

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================
router.post('/login', loginAdmin);                   // Admin login
router.post('/register', registerAdmin);             // Public admin signup
router.post('/forgot-password', forgotAdminPassword); // Request password reset
router.post('/reset-password', resetAdminPassword);  // Reset password with token

// ============================================
// PROTECTED ROUTES (Any Authenticated Admin)
// ============================================
router.post('/logout', protectAdmin, logoutAdmin);                 // Admin logout
router.get('/profile', protectAdmin, getAdminProfile);             // Get admin profile
router.put('/profile', protectAdmin, updateAdminProfile);          // Update admin profile
router.delete('/profile', protectAdmin, deleteAdminAccount);       // Delete admin account
router.put('/change-password', protectAdmin, changeAdminPassword); // Change password
router.get('/dashboard/stats', protectAdmin, getDashboardStats);   // Get dashboard statistics
router.get('/users', protectAdmin, getAllUsers);                   // Get all mobile users

// ============================================
// SUPER ADMIN ONLY ROUTES
// ============================================
router.get('/all', protectAdmin, isSuperAdmin, getAllAdmins);                        // Get all admins
router.patch('/toggle-status/:adminId', protectAdmin, isSuperAdmin, toggleAdminStatus); // Toggle admin status

module.exports = router;