const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_NUMBER_REGEX = /[0-9]/;

const isValidEmail = (email) => {
  return EMAIL_REGEX.test(email);
};

const isValidResetCode = (resetCode, expectedLength) => {
  if (!resetCode || resetCode.length !== expectedLength) {
    return false;
  }
  // Check that it contains only digits
  return /^\d+$/.test(resetCode);
};

const hasUppercase = (password) => {
  return PASSWORD_UPPERCASE_REGEX.test(password);
};

const hasNumber = (password) => {
  return PASSWORD_NUMBER_REGEX.test(password);
};

const isStrongPassword = (password, minLength = 6) => {
  return password.length >= minLength && hasUppercase(password) && hasNumber(password);
};

module.exports = {
  isValidEmail,
  isValidResetCode,
  hasUppercase,
  hasNumber,
  isStrongPassword
};
