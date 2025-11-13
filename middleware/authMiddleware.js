const User = require('../models/userModel');
const { verifyToken } = require('../utils/tokenService');
const { sendUnauthorized } = require('../utils/responseHelper');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return sendUnauthorized(res, 'Not authorized, no token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return sendUnauthorized(res, 'User not found');
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return sendUnauthorized(res, 'Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token expired');
    }
    return sendUnauthorized(res, 'Not authorized');
  }
};

module.exports = { protect };
