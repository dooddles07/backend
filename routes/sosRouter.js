// ============================================
// SOS EMERGENCY ROUTES
// ============================================
// Handles emergency SOS alerts and location tracking

const express = require('express');
const {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS,
  resolveSOS,
  getAllSOSHistory
} = require('../controllers/sosController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ============================================
// PUBLIC ROUTES (No auth for emergencies)
// ============================================
router.post('/send', sendSOS);         // Send SOS alert with location
router.post('/cancel', cancelSOS);     // Cancel active SOS alert

// ============================================
// QUERY ROUTES
// ============================================
router.get('/history/:username', getSOSHistory);    // Get user's SOS history
router.get('/active/:username', getActiveSOS);      // Get user's active SOS
router.get('/all-active', getAllActiveSOS);         // Get all active SOS alerts
router.get('/all-history', getAllSOSHistory);       // Get all resolved/cancelled SOS

// ============================================
// ADMIN ACTIONS
// ============================================
router.patch('/resolve/:sosId', resolveSOS);        // Admin resolves SOS alert

module.exports = router;