const { body, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const authValidation = {
  register: [
    body('fullname')
      .trim()
      .notEmpty().withMessage('Full name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),

    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),

    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),

    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),

    body('contactNumber')
      .optional()
      .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/).withMessage('Invalid phone number format'),

    validate
  ],

  login: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required'),

    body('password')
      .notEmpty().withMessage('Password is required'),

    validate
  ],

  forgotPassword: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),

    validate
  ],

  resetPassword: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),

    body('resetCode')
      .trim()
      .notEmpty().withMessage('Reset code is required')
      .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
      .matches(/^\d{6}$/).withMessage('Reset code must contain only numbers'),

    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

    validate
  ]
};

const sosValidation = {
  send: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required'),

    body('latitude')
      .notEmpty().withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),

    body('longitude')
      .notEmpty().withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),

    body('address')
      .optional()
      .trim(),

    validate
  ],

  cancel: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required'),

    validate
  ],

  resolve: [
    param('sosId')
      .notEmpty().withMessage('SOS ID is required')
      .isMongoId().withMessage('Invalid SOS ID format'),

    validate
  ]
};

const messageValidation = {
  send: [
    body('conversationId')
      .optional()
      .isMongoId().withMessage('Invalid conversation ID format'),

    body('senderType')
      .notEmpty().withMessage('Sender type is required')
      .isIn(['user', 'admin']).withMessage('Sender type must be user or admin'),

    body('senderId')
      .notEmpty().withMessage('Sender ID is required')
      .isMongoId().withMessage('Invalid sender ID format'),

    body('messageType')
      .notEmpty().withMessage('Message type is required')
      .isIn(['text', 'image', 'video', 'audio']).withMessage('Invalid message type'),

    body('text')
      .if(body('messageType').equals('text'))
      .notEmpty().withMessage('Text is required for text messages')
      .isLength({ max: 5000 }).withMessage('Message too long (max 5000 characters)'),

    body('userId')
      .notEmpty().withMessage('User ID is required')
      .isMongoId().withMessage('Invalid user ID format'),

    validate
  ]
};

module.exports = {
  validate,
  authValidation,
  sosValidation,
  messageValidation
};
