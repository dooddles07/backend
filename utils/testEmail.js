const { sendPasswordResetEmail } = require('./emailService');

/**
 * Test email sending functionality
 * This script helps verify email configuration is working correctly
 */
const testEmailConfiguration = async () => {
  try {
    console.log('\n========================================');
    console.log('Testing Email Configuration');
    console.log('========================================\n');

    const testEmail = process.env.EMAIL_USER || 'test@example.com';
    const testName = 'Test User';
    const testCode = '123456';

    console.log(`Sending test email to: ${testEmail}`);
    console.log(`Using SMTP service: gmail`);
    console.log(`From address: ${testEmail}\n`);

    const result = await sendPasswordResetEmail(testEmail, testName, testCode, 'user');

    console.log('\n========================================');
    console.log('✅ Email Test SUCCESSFUL!');
    console.log('========================================');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
    console.log('\nYour email configuration is working correctly!');
    console.log('Check your inbox at:', testEmail);
    console.log('\n');

    return true;
  } catch (error) {
    console.log('\n========================================');
    console.log('❌ Email Test FAILED!');
    console.log('========================================');
    console.log('Error:', error.message);
    console.log('\n');

    console.log('Common fixes:');
    console.log('1. Verify EMAIL_USER and EMAIL_PASSWORD in .env file');
    console.log('2. For Gmail, use an App Password (not your regular password)');
    console.log('   - Go to: https://myaccount.google.com/apppasswords');
    console.log('   - Generate a new App Password');
    console.log('   - Update EMAIL_PASSWORD in .env with the generated password');
    console.log('3. Enable 2-Step Verification if not already enabled');
    console.log('4. Check your network connection');
    console.log('\n');

    return false;
  }
};

// Run test if called directly
if (require.main === module) {
  require('dotenv').config();
  testEmailConfiguration()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testEmailConfiguration };
