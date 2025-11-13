const jwt = require('jsonwebtoken');
const { AUTHENTICATION } = require('../config/constants');

const generateToken = (payload, expiresIn = AUTHENTICATION.TOKEN_EXPIRY) => {
  return jwt.sign(payload, AUTHENTICATION.JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
  return jwt.verify(token, AUTHENTICATION.JWT_SECRET);
};

const createUserToken = (userId, username) => {
  return generateToken({
    id: userId,
    username,
    tokenType: 'user'
  });
};

const createAdminToken = (adminId, username, role) => {
  return generateToken({
    id: adminId,
    username,
    role,
    tokenType: 'admin'
  });
};

module.exports = {
  generateToken,
  verifyToken,
  createUserToken,
  createAdminToken
};
