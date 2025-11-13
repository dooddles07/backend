const User = require('../models/userModel');
const { AUTHENTICATION } = require('../config/constants');
const { isValidEmail, isStrongPassword, isValidResetCode } = require('../utils/validation');
const { hashPassword, comparePassword, generateResetCode, hashResetCode } = require('../utils/passwordService');
const { sendPasswordResetEmail } = require('../utils/emailService');
const { createUserToken } = require('../utils/tokenService');
const {
  sendCreated,
  sendOk,
  sendBadRequest,
  sendUnauthorized,
  sendNotFound,
  sendServerError
} = require('../utils/responseHelper');

const registerUser = async (req, res) => {
  try {
    const { fullname, email, username, password, contactNumber } = req.body;

    if (!fullname || !email || !username || !password) {
      return sendBadRequest(res, 'Please provide all required fields');
    }

    if (!isValidEmail(email)) {
      return sendBadRequest(res, 'Please provide a valid email address');
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      const message = existingUser.email === email.toLowerCase()
        ? 'Email already exists'
        : 'Username already exists';
      return sendBadRequest(res, message);
    }

    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      fullname: fullname.trim(),
      email: email.toLowerCase().trim(),
      username: username.trim(),
      password: hashedPassword,
      contactNumber: contactNumber?.trim() || ''
    });

    await newUser.save();

    return sendCreated(res, 'User registered successfully', {
      user: {
        id: newUser._id,
        fullname: newUser.fullname,
        email: newUser.email,
        username: newUser.username
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return sendServerError(res);
  }
};

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendBadRequest(res, 'Please provide username and password');
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return sendUnauthorized(res, 'Invalid credentials');
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return sendUnauthorized(res, 'Invalid credentials');
    }

    const token = createUserToken(user._id, user.username);

    return sendOk(res, 'Login successful', {
      token,
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        username: user.username,
        avatar: user.avatar || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return sendServerError(res);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendBadRequest(res, 'Please provide an email address');
    }

    if (!isValidEmail(email)) {
      return sendBadRequest(res, 'Please provide a valid email address');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Security: Don't reveal if email exists in database
      return sendOk(res, 'If an account with that email exists, a reset code has been sent');
    }

    const resetCode = generateResetCode();
    const hashedResetCode = hashResetCode(resetCode);

    user.resetPasswordToken = hashedResetCode;
    user.resetPasswordExpires = Date.now() + AUTHENTICATION.RESET_CODE_EXPIRY_MS;
    await user.save();

    console.log(`[FORGOT PASSWORD] Reset code generated for user: ${user.email}`);

    try {
      await sendPasswordResetEmail(user.email, user.fullname, resetCode, 'user');
      console.log(`[FORGOT PASSWORD] Reset email sent successfully to: ${user.email}`);
      return sendOk(res, 'Password reset code has been sent to your email');
    } catch (emailError) {
      console.error('[FORGOT PASSWORD] Email sending failed:', emailError.message);

      // Rollback: Clear the reset token since email failed to send
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      console.log(`[FORGOT PASSWORD] Reset token cleared due to email failure for: ${user.email}`);

      // Provide specific error message to help with debugging
      return sendServerError(res, emailError.message || 'Failed to send reset email. Please try again later.');
    }
  } catch (error) {
    console.error('[FORGOT PASSWORD] Unexpected error:', error);
    return sendServerError(res, 'An unexpected error occurred. Please try again later.');
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    console.log(`[RESET PASSWORD] Attempt for email: ${email}`);

    if (!email || !resetCode || !newPassword) {
      console.log('[RESET PASSWORD] Missing required fields');
      return sendBadRequest(res, 'Please provide all required fields');
    }

    if (!isValidResetCode(resetCode, AUTHENTICATION.RESET_CODE_LENGTH)) {
      console.log(`[RESET PASSWORD] Invalid reset code format: ${resetCode}`);
      return sendBadRequest(res, 'Reset code must be 6 digits');
    }

    if (newPassword.length < AUTHENTICATION.MIN_PASSWORD_LENGTH) {
      console.log('[RESET PASSWORD] Password too short');
      return sendBadRequest(res, `Password must be at least ${AUTHENTICATION.MIN_PASSWORD_LENGTH} characters`);
    }

    const hashedResetCode = hashResetCode(resetCode.trim());
    console.log(`[RESET PASSWORD] Looking for user with email: ${email.toLowerCase().trim()}`);

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: hashedResetCode,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('[RESET PASSWORD] User not found or code expired/invalid');
      return sendBadRequest(res, 'Invalid or expired reset code. Please request a new one.');
    }

    console.log(`[RESET PASSWORD] Valid code found, resetting password for: ${user.email}`);

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log(`[RESET PASSWORD] Password reset successful for: ${user.email}`);

    return sendOk(res, 'Password has been reset successfully. You can now login with your new password.');
  } catch (error) {
    console.error('[RESET PASSWORD] Unexpected error:', error);
    return sendServerError(res, 'Error resetting password. Please try again.');
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    return sendOk(res, 'Profile retrieved successfully', {
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        username: user.username,
        contactNumber: user.contactNumber || '',
        avatar: user.avatar || ''
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return sendServerError(res, 'Error fetching profile');
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { fullname, email, contactNumber } = req.body;
    const userId = req.user.id;

    if (!fullname || !email) {
      return sendBadRequest(res, 'Full name and email are required');
    }

    if (!isValidEmail(email)) {
      return sendBadRequest(res, 'Please provide a valid email address');
    }

    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId }
      });

      if (emailExists) {
        return sendBadRequest(res, 'Email already in use');
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        fullname: fullname.trim(),
        email: email.toLowerCase().trim(),
        contactNumber: contactNumber?.trim() || ''
      },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedUser) {
      return sendNotFound(res, 'User not found');
    }

    return sendOk(res, 'Profile updated successfully', {
      user: {
        id: updatedUser._id,
        fullname: updatedUser.fullname,
        email: updatedUser.email,
        username: updatedUser.username,
        contactNumber: updatedUser.contactNumber || '',
        avatar: updatedUser.avatar || ''
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return sendServerError(res, 'Error updating profile');
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return sendBadRequest(res, 'Please provide both old and new password');
    }

    if (!isStrongPassword(newPassword, AUTHENTICATION.MIN_PASSWORD_LENGTH)) {
      return sendBadRequest(res, 'Password must be at least 6 characters and contain uppercase, lowercase, and number');
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    const isPasswordValid = await comparePassword(oldPassword, user.password);
    if (!isPasswordValid) {
      return sendUnauthorized(res, 'Current password is incorrect');
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    await user.save();

    return sendOk(res, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return sendServerError(res, 'Error changing password');
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return sendNotFound(res, 'User not found');
    }

    return sendOk(res, 'Account deleted successfully');
  } catch (error) {
    console.error('Delete account error:', error);
    return sendServerError(res, 'Error deleting account');
  }
};

const logoutUser = async (req, res) => {
  try {
    return sendOk(res, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    return sendServerError(res);
  }
};

const uploadAvatar = async (req, res) => {
  try {
    const { avatar } = req.body;
    const userId = req.user.id;

    if (!avatar) {
      return sendBadRequest(res, 'No image data provided');
    }

    if (!avatar.startsWith('data:image')) {
      return sendBadRequest(res, 'Invalid image format');
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { avatar },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedUser) {
      return sendNotFound(res, 'User not found');
    }

    return sendOk(res, 'Avatar uploaded successfully', {
      avatar: updatedUser.avatar,
      user: {
        id: updatedUser._id,
        fullname: updatedUser.fullname,
        email: updatedUser.email,
        username: updatedUser.username,
        contactNumber: updatedUser.contactNumber || '',
        avatar: updatedUser.avatar || ''
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    return sendServerError(res, 'Error uploading avatar');
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  changePassword,
  deleteAccount,
  uploadAvatar
};
