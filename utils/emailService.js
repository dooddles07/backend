const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key
const initializeSendGrid = () => {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

  if (!SENDGRID_API_KEY) {
    throw new Error('SendGrid API key is missing. Please check SENDGRID_API_KEY in .env file');
  }

  sgMail.setApiKey(SENDGRID_API_KEY);
};

const createPasswordResetEmailTemplate = (fullname, resetCode, brandColor = '#8c01c0', gradientEnd = '#6a0190') => {
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 10px;">
      <div style="background-color: ${brandColor}; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">ResQYou</h1>
      </div>
      <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #666; font-size: 16px;">Hello <strong>${fullname}</strong>,</p>
        <p style="color: #666; font-size: 16px;">You requested to reset your password. Use the code below:</p>

        <div style="background: linear-gradient(135deg, ${brandColor} 0%, ${gradientEnd} 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 25px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <p style="color: white; font-size: 14px; margin: 0 0 10px 0;">Your Reset Code</p>
          <h1 style="color: white; letter-spacing: 8px; margin: 0; font-size: 36px; font-weight: bold;">${resetCode}</h1>
        </div>

        <div style="background-color: #FFF9E6; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="color: #F57C00; margin: 0; font-size: 14px;">
            ⏰ <strong>Important:</strong> This code will expire in <strong>15 minutes</strong>
          </p>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 20px;">If you didn't request this password reset, please ignore this email.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">

        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from ResQYou. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
};

// Send password reset email using SendGrid API
const sendPasswordResetEmailWithRetry = async (userEmail, fullname, resetCode, userType = 'user', retryCount = 0, maxRetries = 3) => {
  try {
    // Log API key status for debugging
    const hasApiKey = !!process.env.SENDGRID_API_KEY;
    console.log(`[EMAIL SERVICE] API Key Status: ${hasApiKey ? 'PRESENT' : 'MISSING'}`);
    console.log(`[EMAIL SERVICE] Attempting to send password reset email to: ${userEmail}${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}`);

    // Initialize SendGrid (will throw if API key missing)
    initializeSendGrid();

    const brandColor = userType === 'admin' ? '#DC2626' : '#8c01c0';
    const gradientEnd = userType === 'admin' ? '#991B1B' : '#6a0190';
    const subject = userType === 'admin'
      ? 'Admin Password Reset Code - ResQYou'
      : 'Password Reset Code - ResQYou';
    const fromName = userType === 'admin'
      ? 'ResQYou Admin Reset'
      : 'ResQYou Password Reset';

    const emailTemplate = createPasswordResetEmailTemplate(fullname, resetCode, brandColor, gradientEnd);

    // SendGrid email object
    const msg = {
      to: userEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@resqyou.com',
        name: fromName
      },
      subject,
      html: emailTemplate,
      replyTo: 'support@resqyou.com'
    };

    // Send via SendGrid API (HTTP request, not SMTP)
    const result = await sgMail.send(msg);

    console.log('[EMAIL SERVICE] Email sent successfully via SendGrid');
    console.log(`[EMAIL SERVICE] Status Code: ${result[0]?.statusCode || 202}`);

    return {
      success: true,
      messageId: result[0]?.headers?.['x-message-id'] || 'unknown',
      response: result[0]?.statusCode || 202
    };
  } catch (error) {
    console.error(`[EMAIL SERVICE] Failed to send password reset email:`, error.message);

    // Check for specific error types
    if (error.message.includes('Invalid email')) {
      console.error('[EMAIL SERVICE] Invalid email address format');
      throw new Error('Invalid email address format.');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('[EMAIL SERVICE] SendGrid API key is invalid or missing');
      throw new Error('Email service configuration error. Please contact support.');
    } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      console.error('[EMAIL SERVICE] SendGrid rate limit exceeded');
      throw new Error('Too many email attempts. Please try again later.');
    }

    // Retry logic for transient failures (timeout, network errors)
    if ((error.message.includes('timeout') ||
         error.message.includes('Connection') ||
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('EHOSTUNREACH') ||
         error.code === 'ECONNABORTED')
        && retryCount < maxRetries) {

      const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.log(`[EMAIL SERVICE] Retrying in ${waitTime}ms due to transient error...`);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, waitTime));

      return sendPasswordResetEmailWithRetry(userEmail, fullname, resetCode, userType, retryCount + 1, maxRetries);
    }

    // If max retries exceeded
    if (retryCount >= maxRetries) {
      throw new Error(`Email service unavailable after ${maxRetries} retries. Please try again later or contact support.`);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

const sendPasswordResetEmail = (userEmail, fullname, resetCode, userType = 'user') => {
  return sendPasswordResetEmailWithRetry(userEmail, fullname, resetCode, userType);
};

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetEmailWithRetry,
  createPasswordResetEmailTemplate,
  initializeSendGrid
};
