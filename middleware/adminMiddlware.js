const Admin = require('../models/adminModel');
const { ADMIN_ROLES } = require('../config/constants');
const { verifyToken } = require('../utils/tokenService');
const { sendUnauthorized, sendForbidden, sendServerError } = require('../utils/responseHelper');

const protectAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return sendUnauthorized(res, 'Not authorized, no token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (decoded.tokenType !== 'admin') {
      return sendForbidden(res, 'Access denied. Admin privileges required.');
    }

    req.admin = await Admin.findById(decoded.id).select('-password');

    if (!req.admin) {
      return sendUnauthorized(res, 'Admin not found');
    }

    if (!req.admin.isActive) {
      return sendForbidden(res, 'Account is deactivated. Contact super admin.');
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

const isSuperAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return sendUnauthorized(res, 'Not authenticated');
    }

    if (req.admin.role !== ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Super admin privileges required');
    }

    next();
  } catch (error) {
    return sendServerError(res, 'Authorization error');
  }
};

const isAdminOrSuperAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return sendUnauthorized(res, 'Not authenticated');
    }

    if (![ADMIN_ROLES.ADMIN, ADMIN_ROLES.SUPER_ADMIN].includes(req.admin.role)) {
      return sendForbidden(res, 'Admin privileges required');
    }

    next();
  } catch (error) {
    return sendServerError(res, 'Authorization error');
  }
};

module.exports = {
  protectAdmin,
  isSuperAdmin,
  isAdminOrSuperAdmin
};
