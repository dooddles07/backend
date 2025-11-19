const nodemailer = require('nodemailer');
const { EMAIL } = require('../config/constants');

// Create fresh transporter for each email (avoids connection pooling issues on Render)
const createTransporter = () => {
  if (!EMAIL.USER || !EMAIL.PASSWORD) {
    throw new Error('Email configuration is missing. Please check EMAIL_USER and EMAIL_PASSWORD in .env file');
  }

  // Use port 465 with SSL instead of 587 with TLS
  // Port 465 is more reliable on restrictive networks like Render
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL on port 465 (more direct, fewer negotiation issues)
    auth: {
      user: EMAIL.USER,
      pass: EMAIL.PASSWORD
    },
    // Timeout settings optimized for Render
    connectionTimeout: 15000, // 15 seconds for initial connection
    socketTimeout: 15000,     // 15 seconds for socket
    tls: {
      rejectUnauthorized: false // Allow self-signed certs in development/Render
    },
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  });
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

// Retry logic with exponential backoff
const sendPasswordResetEmailWithRetry = async (userEmail, fullname, resetCode, userType = 'user', retryCount = 0, maxRetries = 3) => {
  try {
    console.log(`[EMAIL SERVICE] Attempting to send password reset email to: ${userEmail}${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ''}`);

    const mailTransporter = createTransporter();

    // Skip verify() - it adds unnecessary connection overhead and causes timeouts
    // Instead, trust the credentials and handle errors during actual send

    const brandColor = userType === 'admin' ? '#DC2626' : '#8c01c0';
    const gradientEnd = userType === 'admin' ? '#991B1B' : '#6a0190';
    const subject = userType === 'admin'
      ? 'Admin Password Reset Code - ResQYou'
      : 'Password Reset Code - ResQYou';
    const fromName = userType === 'admin'
      ? 'ResQYou Admin Reset'
      : 'ResQYou Password Reset';

    const emailTemplate = createPasswordResetEmailTemplate(fullname, resetCode, brandColor, gradientEnd);

    const mailOptions = {
      from: `"${fromName}" <${EMAIL.USER}>`,
      to: userEmail,
      subject,
      html: emailTemplate
    };

    const info = await mailTransporter.sendMail(mailOptions);

    console.log('[EMAIL SERVICE] Email sent successfully');
    console.log(`[EMAIL SERVICE] Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error(`[EMAIL SERVICE] Failed to send password reset email:`, error.message);

    // Specific error handling
    if (error.code === 'EAUTH') {
      console.error('[EMAIL SERVICE] Authentication failed - check EMAIL_USER and EMAIL_PASSWORD');
      throw new Error('Email authentication failed. Please verify your email credentials.');
    } else if (error.code === 'EENVELOPE') {
      console.error('[EMAIL SERVICE] Invalid email address format');
      throw new Error('Invalid email address format.');
    }

    // Retry logic for transient failures (timeout, connection errors)
    if ((error.code === 'ESOCKET' || error.code === 'ETIMEDOUT' ||
         error.message.includes('timeout') || error.message.includes('Connection') ||
         error.message.includes('ECONNREFUSED') || error.message.includes('EHOSTUNREACH'))
        && retryCount < maxRetries) {

      const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.log(`[EMAIL SERVICE] Retrying in ${waitTime}ms due to transient error...`);

      // Wait before retrying (fresh transporter will be created on next attempt)
      await new Promise(resolve => setTimeout(resolve, waitTime));

      return sendPasswordResetEmailWithRetry(userEmail, fullname, resetCode, userType, retryCount + 1, maxRetries);
    }

    // If max retries exceeded
    if (retryCount >= maxRetries) {
      throw new Error(`Email server connection failed after ${maxRetries} retries. Please try again later or contact support.`);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

const sendPasswordResetEmail = (userEmail, fullname, resetCode, userType = 'user') => {
  return sendPasswordResetEmailWithRetry(userEmail, fullname, resetCode, userType);
};

module.exports = {
  createTransporter,
  sendPasswordResetEmail,
  sendPasswordResetEmailWithRetry,
  createPasswordResetEmailTemplate
};
