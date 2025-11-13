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
const { sosValidation } = require('../middleware/validation');

const router = express.Router();

// Public Routes
router.post('/send', sosValidation.send, sendSOS);
router.post('/cancel', sosValidation.cancel, cancelSOS);

// Query Routes
router.get('/history/:username', getSOSHistory);
router.get('/active/:username', getActiveSOS);
router.get('/all-active', getAllActiveSOS);
router.get('/all-history', getAllSOSHistory);

// Admin Actions
router.patch('/resolve/:sosId', sosValidation.resolve, resolveSOS);

module.exports = router;
