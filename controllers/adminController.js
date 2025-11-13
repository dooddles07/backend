const Admin = require('../models/adminModel');
const User = require('../models/userModel');
const SOS = require('../models/sosModel');
const { AUTHENTICATION, ADMIN_ROLES, SOS: SOS_CONSTANTS, TIME } = require('../config/constants');
const { isValidEmail, isValidResetCode } = require('../utils/validation');
const { hashPassword, comparePassword, generateResetCode, hashResetCode } = require('../utils/passwordService');
const { sendPasswordResetEmail } = require('../utils/emailService');
const { createAdminToken } = require('../utils/tokenService');
const {
  sendCreated,
  sendOk,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendServerError
} = require('../utils/responseHelper');

const registerAdmin = async (req, res) => {
  try {
    const { fullname, email, username, password, role, department, contactNumber } = req.body;

    if (!fullname || !email || !username || !password) {
      return sendBadRequest(res, 'Please provide all required fields');
    }

    if (req.admin && req.admin.role !== ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Only super admins can create new admin accounts');
    }

    if (!req.admin && role === ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Cannot self-register as super admin');
    }

    const existingAdmin = await Admin.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingAdmin) {
      const message = existingAdmin.email === email.toLowerCase()
        ? 'Email already exists'
        : 'Username already exists';
      return sendBadRequest(res, message);
    }

    const hashedPassword = await hashPassword(password);
    const newAdmin = new Admin({
      fullname,
      email: email.toLowerCase(),
      username,
      password: hashedPassword,
      role: role || ADMIN_ROLES.ADMIN,
      department,
      contactNumber,
      isActive: true
    });

    await newAdmin.save();

    return sendCreated(res, 'Admin registered successfully', {
      admin: {
        id: newAdmin._id,
        fullname: newAdmin.fullname,
        email: newAdmin.email,
        username: newAdmin.username,
        role: newAdmin.role,
        department: newAdmin.department
      }
    });
  } catch (error) {
    console.error('Admin Register error:', error);
    return sendServerError(res);
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendBadRequest(res, 'Please provide username and password');
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return sendUnauthorized(res, 'Invalid credentials');
    }

    if (!admin.isActive) {
      return sendForbidden(res, 'Account is deactivated. Contact super admin.');
    }

    const isPasswordValid = await comparePassword(password, admin.password);
    if (!isPasswordValid) {
      return sendUnauthorized(res, 'Invalid credentials');
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = createAdminToken(admin._id, admin.username, admin.role);

    return sendOk(res, 'Login successful', {
      token,
      admin: {
        id: admin._id,
        fullname: admin.fullname,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        department: admin.department,
        lastLogin: admin.lastLogin
      }
    });
  } catch (error) {
    console.error('Admin Login error:', error);
    return sendServerError(res);
  }
};

const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!admin) {
      return sendNotFound(res, 'Admin not found');
    }

    return sendOk(res, 'Profile retrieved successfully', {
      admin: {
        id: admin._id,
        fullname: admin.fullname,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        department: admin.department,
        contactNumber: admin.contactNumber || '',
        avatar: admin.avatar || '',
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    return sendServerError(res, 'Error fetching profile');
  }
};

const updateAdminProfile = async (req, res) => {
  try {
    const { fullname, email, contactNumber, department } = req.body;
    const adminId = req.admin.id;

    if (!fullname || !email) {
      return sendBadRequest(res, 'Full name and email are required');
    }

    if (!isValidEmail(email)) {
      return sendBadRequest(res, 'Please provide a valid email address');
    }

    if (email.toLowerCase() !== req.admin.email.toLowerCase()) {
      const emailExists = await Admin.findOne({
        email: email.toLowerCase(),
        _id: { $ne: adminId }
      });

      if (emailExists) {
        return sendBadRequest(res, 'Email already in use');
      }
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      {
        fullname: fullname.trim(),
        email: email.toLowerCase().trim(),
        contactNumber: contactNumber || '',
        department: department || ''
      },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedAdmin) {
      return sendNotFound(res, 'Admin not found');
    }

    return sendOk(res, 'Profile updated successfully', {
      admin: {
        id: updatedAdmin._id,
        fullname: updatedAdmin.fullname,
        email: updatedAdmin.email,
        username: updatedAdmin.username,
        role: updatedAdmin.role,
        department: updatedAdmin.department,
        contactNumber: updatedAdmin.contactNumber || '',
        avatar: updatedAdmin.avatar || ''
      }
    });
  } catch (error) {
    console.error('Update admin profile error:', error);
    return sendServerError(res, 'Error updating profile');
  }
};

const changeAdminPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    if (!oldPassword || !newPassword) {
      return sendBadRequest(res, 'Please provide both old and new password');
    }

    if (newPassword.length < AUTHENTICATION.MIN_PASSWORD_LENGTH) {
      return sendBadRequest(res, `New password must be at least ${AUTHENTICATION.MIN_PASSWORD_LENGTH} characters`);
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return sendNotFound(res, 'Admin not found');
    }

    const isPasswordValid = await comparePassword(oldPassword, admin.password);
    if (!isPasswordValid) {
      return sendUnauthorized(res, 'Current password is incorrect');
    }

    const hashedPassword = await hashPassword(newPassword);
    admin.password = hashedPassword;
    await admin.save();

    return sendOk(res, 'Password changed successfully');
  } catch (error) {
    console.error('Change admin password error:', error);
    return sendServerError(res, 'Error changing password');
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    return sendOk(res, 'Users retrieved successfully', {
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    return sendServerError(res, 'Error fetching users');
  }
};

const getAllAdmins = async (req, res) => {
  try {
    if (req.admin.role !== ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Only super admins can view all admins');
    }

    const admins = await Admin.find()
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    return sendOk(res, 'Admins retrieved successfully', {
      count: admins.length,
      admins
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    return sendServerError(res, 'Error fetching admins');
  }
};

const toggleAdminStatus = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (req.admin.role !== ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Only super admins can manage admin status');
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return sendNotFound(res, 'Admin not found');
    }

    if (admin._id.toString() === req.admin.id) {
      return sendBadRequest(res, 'Cannot deactivate your own account');
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    return sendOk(res, `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully`, {
      admin: {
        id: admin._id,
        username: admin.username,
        isActive: admin.isActive
      }
    });
  } catch (error) {
    console.error('Toggle admin status error:', error);
    return sendServerError(res, 'Error updating admin status');
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await Admin.countDocuments();
    const activeSOS = await SOS.countDocuments({ status: SOS_CONSTANTS.STATUS.ACTIVE });
    const resolvedSOS = await SOS.countDocuments({ status: SOS_CONSTANTS.STATUS.RESOLVED });
    const cancelledSOS = await SOS.countDocuments({ status: SOS_CONSTANTS.STATUS.CANCELLED });
    const totalSOS = await SOS.countDocuments();

    const last24Hours = new Date(Date.now() - TIME.MILLISECONDS_IN_24_HOURS);
    const recentSOS = await SOS.countDocuments({
      timestamp: { $gte: last24Hours }
    });

    const sosByStatus = await SOS.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    return sendOk(res, 'Dashboard statistics retrieved successfully', {
      stats: {
        users: {
          total: totalUsers
        },
        admins: {
          total: totalAdmins
        },
        sos: {
          total: totalSOS,
          active: activeSOS,
          resolved: resolvedSOS,
          cancelled: cancelledSOS,
          last24Hours: recentSOS
        },
        sosByStatus
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return sendServerError(res, 'Error fetching dashboard statistics');
  }
};

const logoutAdmin = async (req, res) => {
  try {
    return sendOk(res, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    return sendServerError(res);
  }
};

const forgotAdminPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendBadRequest(res, 'Please provide an email address');
    }

    if (!isValidEmail(email)) {
      return sendBadRequest(res, 'Please provide a valid email address');
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    if (!admin) {
      // Security: Don't reveal if email exists in database
      return sendOk(res, 'If an account with that email exists, a reset code has been sent');
    }

    const resetCode = generateResetCode();
    const hashedResetCode = hashResetCode(resetCode);

    admin.resetPasswordToken = hashedResetCode;
    admin.resetPasswordExpires = Date.now() + AUTHENTICATION.RESET_CODE_EXPIRY_MS;
    await admin.save();

    console.log(`[ADMIN FORGOT PASSWORD] Reset code generated for admin: ${admin.email}`);

    try {
      await sendPasswordResetEmail(admin.email, admin.fullname, resetCode, 'admin');
      console.log(`[ADMIN FORGOT PASSWORD] Reset email sent successfully to: ${admin.email}`);
      return sendOk(res, 'Password reset code has been sent to your email');
    } catch (emailError) {
      console.error('[ADMIN FORGOT PASSWORD] Email sending failed:', emailError.message);

      // Rollback: Clear the reset token since email failed to send
      admin.resetPasswordToken = undefined;
      admin.resetPasswordExpires = undefined;
      await admin.save();

      console.log(`[ADMIN FORGOT PASSWORD] Reset token cleared due to email failure for: ${admin.email}`);

      // Provide specific error message to help with debugging
      return sendServerError(res, emailError.message || 'Failed to send reset email. Please try again later.');
    }
  } catch (error) {
    console.error('[ADMIN FORGOT PASSWORD] Unexpected error:', error);
    return sendServerError(res, 'An unexpected error occurred. Please try again later.');
  }
};

const resetAdminPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    console.log(`[ADMIN RESET PASSWORD] Attempt for email: ${email}`);

    if (!email || !resetCode || !newPassword) {
      console.log('[ADMIN RESET PASSWORD] Missing required fields');
      return sendBadRequest(res, 'Please provide all required fields');
    }

    if (!isValidResetCode(resetCode, AUTHENTICATION.RESET_CODE_LENGTH)) {
      console.log(`[ADMIN RESET PASSWORD] Invalid reset code format: ${resetCode}`);
      return sendBadRequest(res, 'Reset code must be 6 digits');
    }

    if (newPassword.length < AUTHENTICATION.MIN_PASSWORD_LENGTH) {
      console.log('[ADMIN RESET PASSWORD] Password too short');
      return sendBadRequest(res, `Password must be at least ${AUTHENTICATION.MIN_PASSWORD_LENGTH} characters`);
    }

    const hashedResetCode = hashResetCode(resetCode.trim());
    console.log(`[ADMIN RESET PASSWORD] Looking for admin with email: ${email.toLowerCase().trim()}`);

    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: hashedResetCode,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!admin) {
      console.log('[ADMIN RESET PASSWORD] Admin not found or code expired/invalid');
      return sendBadRequest(res, 'Invalid or expired reset code. Please request a new one.');
    }

    console.log(`[ADMIN RESET PASSWORD] Valid code found, resetting password for: ${admin.email}`);

    const hashedPassword = await hashPassword(newPassword);
    admin.password = hashedPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    console.log(`[ADMIN RESET PASSWORD] Password reset successful for: ${admin.email}`);

    return sendOk(res, 'Password has been reset successfully. You can now login with your new password.');
  } catch (error) {
    console.error('[ADMIN RESET PASSWORD] Unexpected error:', error);
    return sendServerError(res, 'Error resetting password. Please try again.');
  }
};

const deleteAdminAccount = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return sendNotFound(res, 'Admin account not found');
    }

    if (admin.role === ADMIN_ROLES.SUPER_ADMIN) {
      return sendForbidden(res, 'Super admin accounts cannot be deleted. Please contact system administrator.');
    }

    await Admin.findByIdAndDelete(adminId);

    return sendOk(res, 'Account deleted successfully');
  } catch (error) {
    console.error('Delete admin account error:', error);
    return sendServerError(res, 'Error deleting account. Please try again.');
  }
};

module.exports = {
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
};
