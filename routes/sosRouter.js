const express = require('express');
const {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS
} = require('../controllers/sosController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (no auth required for emergency situations)
router.post('/send', sendSOS);
router.post('/cancel', cancelSOS);

// Protected routes (optional - can add authentication later)
router.get('/history/:username', getSOSHistory);
router.get('/active/:username', getActiveSOS);
router.get('/all-active', getAllActiveSOS);

module.exports = router;