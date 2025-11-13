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

// Public Routes
router.post('/login', loginAdmin);
router.post('/register', registerAdmin);
router.post('/forgot-password', forgotAdminPassword);
router.post('/reset-password', resetAdminPassword);

// Protected Routes
router.post('/logout', protectAdmin, logoutAdmin);
router.get('/profile', protectAdmin, getAdminProfile);
router.put('/profile', protectAdmin, updateAdminProfile);
router.delete('/profile', protectAdmin, deleteAdminAccount);
router.put('/change-password', protectAdmin, changeAdminPassword);
router.get('/dashboard/stats', protectAdmin, getDashboardStats);
router.get('/users', protectAdmin, getAllUsers);

// Super Admin Only Routes
router.get('/all', protectAdmin, isSuperAdmin, getAllAdmins);
router.patch('/toggle-status/:adminId', protectAdmin, isSuperAdmin, toggleAdminStatus);

module.exports = router;
