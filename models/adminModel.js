const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    unique: true,
    required: true,
    lowercase: true,
    trim: true
  },
  username: { 
    type: String, 
    unique: true,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'responder'],
    default: 'admin'
  },
  contactNumber: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, {
  timestamps: true
});

adminSchema.index({ role: 1 });

module.exports = mongoose.model('Admin', adminSchema);