const express = require('express');
const {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS,
  resolveSOS,
  getAllSOSHistory,
  getSOSStats
} = require('../controllers/sosController');
const { sosValidation } = require('../middleware/validation');
const { protect } = require('../middleware/authMiddleware');
const { protectAdmin } = require('../middleware/adminMiddlware');

const router = express.Router();

// 🔒 User Routes (Protected - Requires Authentication)
router.post('/send', protect, sosValidation.send, sendSOS);
router.post('/cancel', protect, sosValidation.cancel, cancelSOS);
router.get('/history/:username', protect, getSOSHistory);
router.get('/active/:username', protect, getActiveSOS);

// 🔒 Admin Routes (Protected - Requires Admin Authentication)
router.get('/stats', protectAdmin, getSOSStats); // Must be before /active/:username to avoid conflicts
router.get('/all-active', protectAdmin, getAllActiveSOS);
router.get('/all-history', protectAdmin, getAllSOSHistory);
router.patch('/resolve/:sosId', protectAdmin, sosValidation.resolve, resolveSOS);

module.exports = router;
