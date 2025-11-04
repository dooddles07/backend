// ============================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ============================================
// Protects admin routes and enforces role-based access control

const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel');

const JWT_SECRET = process.env.JWT_SECRET || 'c12a660c42a652ef378eae5d504952fdd0436be193e159d82bf1e26bd5eca779';

/**
 * Middleware to protect admin routes - requires valid admin JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const protectAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check if authorization header exists
    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify token is for admin
    if (decoded.tokenType !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    // Find admin and attach to request (exclude password)
    req.admin = await Admin.findById(decoded.id).select('-password');

    if (!req.admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    // Check if admin account is active
    if (!req.admin.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact super admin.' });
    }

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Not authorized' });
  }
};

/**
 * Middleware to restrict access to super admins only
 * Must be used after protectAdmin middleware
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super admin privileges required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Authorization error' });
  }
};

/**
 * Middleware to allow access to both admins and super admins
 * Must be used after protectAdmin middleware
 */
const isAdminOrSuperAdmin = async (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!['admin', 'super_admin'].includes(req.admin.role)) {
      return res.status(403).json({ message: 'Admin privileges required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Authorization error' });
  }
};

module.exports = {
  protectAdmin,
  isSuperAdmin,
  isAdminOrSuperAdmin
};