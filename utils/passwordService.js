const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AUTHENTICATION } = require('../config/constants');

const hashPassword = async (password) => {
  return await bcrypt.hash(password, AUTHENTICATION.BCRYPT_SALT_ROUNDS);
};

const comparePassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashResetCode = (resetCode) => {
  return crypto.createHash('sha256').update(resetCode).digest('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateResetCode,
  hashResetCode
};
