const Admin = require('../models/adminModel');
const User = require('../models/userModel');
const SOS = require('../models/sosModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'c12a660c42a652ef378eae5d504952fdd0436be193e159d82bf1e26bd5eca779';

// Email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Register Admin (Only super_admin can create new admins)
const registerAdmin = async (req, res) => {
  try {
    const { fullname, email, username, password, role, department, contactNumber } = req.body;

    // Validate required fields
    if (!fullname || !email || !username || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if requester is super_admin (if authentication exists)
    // Allow public signup if no authentication, otherwise require super_admin
    if (req.admin && req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can create new admin accounts' });
    }

    // For public signup (no req.admin), default to 'admin' role, not 'super_admin'
    if (!req.admin && role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot self-register as super admin' });
    }

    // Check for existing admin
    const existingAdmin = await Admin.findOne({ 
      $or: [{ email: email.toLowerCase() }, { username }] 
    });
    
    if (existingAdmin) {
      return res.status(400).json({ 
        message: existingAdmin.email === email.toLowerCase() 
          ? 'Email already exists' 
          : 'Username already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new admin
    const newAdmin = new Admin({
      fullname,
      email: email.toLowerCase(),
      username,
      password: hashedPassword,
      role: role || 'admin',
      department,
      contactNumber,
      isActive: true
    });

    await newAdmin.save();
    
    res.status(201).json({ 
      message: 'Admin registered successfully',
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
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Login Admin
const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    // Find admin
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(404).json({ message: 'Invalid credentials' });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact super admin.' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = jwt.sign(
      {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        tokenType: 'admin'  // Required for dual authentication middleware
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({ 
      message: 'Login successful', 
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
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get Admin Profile
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password -resetPasswordToken -resetPasswordExpires');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
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
    res.status(500).json({ message: 'Error fetching profile' });
  }
};

// Update Admin Profile
const updateAdminProfile = async (req, res) => {
  try {
    const { fullname, email, contactNumber, department } = req.body;
    const adminId = req.admin.id;

    if (!fullname || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Check if email is already taken by another admin
    if (email.toLowerCase() !== req.admin.email.toLowerCase()) {
      const emailExists = await Admin.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: adminId }
      });
      
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
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
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
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
    res.status(500).json({ message: 'Error updating profile' });
  }
};

// Change Admin Password
const changeAdminPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide both old and new password' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
};

// Get All Users (For Admin Dashboard)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Users retrieved successfully',
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// Get All Admins (Super Admin Only)
const getAllAdmins = async (req, res) => {
  try {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can view all admins' });
    }

    const admins = await Admin.find()
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Admins retrieved successfully',
      count: admins.length,
      admins
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({ message: 'Error fetching admins' });
  }
};

// Toggle Admin Active Status (Super Admin Only)
const toggleAdminStatus = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can manage admin status' });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Prevent deactivating yourself
    if (admin._id.toString() === req.admin.id) {
      return res.status(400).json({ message: 'Cannot deactivate your own account' });
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    res.status(200).json({
      message: `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully`,
      admin: {
        id: admin._id,
        username: admin.username,
        isActive: admin.isActive
      }
    });
  } catch (error) {
    console.error('Toggle admin status error:', error);
    res.status(500).json({ message: 'Error updating admin status' });
  }
};

// Get Dashboard Statistics
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await Admin.countDocuments();
    const activeSOS = await SOS.countDocuments({ status: 'active' });
    const resolvedSOS = await SOS.countDocuments({ status: 'resolved' });
    const cancelledSOS = await SOS.countDocuments({ status: 'cancelled' });
    const totalSOS = await SOS.countDocuments();

    // Get recent SOS alerts (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSOS = await SOS.countDocuments({ 
      timestamp: { $gte: last24Hours } 
    });

    // Get SOS by status
    const sosByStatus = await SOS.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      message: 'Dashboard statistics retrieved successfully',
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
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
};

// Logout Admin
const logoutAdmin = async (req, res) => {
  try {
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Forgot Password (Admin)
const forgotAdminPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    
    if (!admin) {
      return res.status(200).json({ 
        message: 'If an account with that email exists, a reset code has been sent' 
      });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedResetCode = crypto.createHash('sha256').update(resetCode).digest('hex');

    admin.resetPasswordToken = hashedResetCode;
    admin.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
    await admin.save();

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"ResQYou Admin Reset" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: 'Admin Password Reset Code - ResQYou',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 10px;">
          <div style="background-color: #DC2626; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">ResQYou Admin</h1>
          </div>
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Admin Password Reset</h2>
            <p style="color: #666; font-size: 16px;">Hello <strong>${admin.fullname}</strong>,</p>
            <p style="color: #666; font-size: 16px;">You requested to reset your admin password. Use the code below:</p>
            
            <div style="background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 25px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="color: white; font-size: 14px; margin: 0 0 10px 0;">Your Reset Code</p>
              <h1 style="color: white; letter-spacing: 8px; margin: 0; font-size: 36px; font-weight: bold;">${resetCode}</h1>
            </div>
            
            <div style="background-color: #FFF9E6; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <p style="color: #F57C00; margin: 0; font-size: 14px;">
                ⏰ <strong>Important:</strong> This code will expire in <strong>15 minutes</strong>
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">If you didn't request this password reset, please contact the super admin immediately.</p>
          </div>
        </div>
      `
    });

    res.status(200).json({ 
      message: 'Password reset code has been sent to your email'
    });
    
  } catch (error) {
    console.error('Admin forgot password error:', error);
    res.status(500).json({ 
      message: 'Error sending reset email. Please try again later.'
    });
  }
};

// Reset Admin Password
const resetAdminPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (resetCode.length !== 6) {
      return res.status(400).json({ message: 'Reset code must be 6 digits' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedResetCode = crypto.createHash('sha256').update(resetCode.trim()).digest('hex');

    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: hashedResetCode,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!admin) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset code. Please request a new one.' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    admin.password = hashedPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    res.status(200).json({ 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });
    
  } catch (error) {
    console.error('Reset admin password error:', error);
    res.status(500).json({
      message: 'Error resetting password. Please try again.'
    });
  }
};

// Delete Admin Account
const deleteAdminAccount = async (req, res) => {
  try {
    const adminId = req.admin.id;

    // Find the admin
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: 'Admin account not found' });
    }

    // Prevent deletion of super_admin
    if (admin.role === 'super_admin') {
      return res.status(403).json({
        message: 'Super admin accounts cannot be deleted. Please contact system administrator.'
      });
    }

    // Delete the admin account
    await Admin.findByIdAndDelete(adminId);

    res.status(200).json({
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete admin account error:', error);
    res.status(500).json({
      message: 'Error deleting account. Please try again.',
      error: error.message
    });
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