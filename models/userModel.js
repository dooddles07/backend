const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
  contactNumber: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);