const nodemailer = require('nodemailer');
const { EMAIL } = require('../config/constants');

const createTransporter = () => {
  if (!EMAIL.USER || !EMAIL.PASSWORD) {
    throw new Error('Email configuration is missing. Please check EMAIL_USER and EMAIL_PASSWORD in .env file');
  }

  return nodemailer.createTransport({
    service: EMAIL.SERVICE,
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use TLS (STARTTLS) on port 587
    auth: {
      user: EMAIL.USER,
      pass: EMAIL.PASSWORD
    },
    connectionTimeout: 10000, // 10 seconds
    socketTimeout: 10000,     // 10 seconds
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

const sendPasswordResetEmail = async (userEmail, fullname, resetCode, userType = 'user') => {
  try {
    console.log(`[EMAIL SERVICE] Attempting to send password reset email to: ${userEmail}`);

    const transporter = createTransporter();

    // Verify transporter connection
    try {
      await transporter.verify();
      console.log('[EMAIL SERVICE] SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('[EMAIL SERVICE] SMTP connection verification failed:', verifyError.message);
      throw new Error(`Email server connection failed: ${verifyError.message}. Please check your email configuration.`);
    }

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

    console.log(`[EMAIL SERVICE] Sending email with subject: "${subject}"`);

    const info = await transporter.sendMail(mailOptions);

    console.log('[EMAIL SERVICE] Email sent successfully');
    console.log(`[EMAIL SERVICE] Message ID: ${info.messageId}`);
    console.log(`[EMAIL SERVICE] Response: ${info.response}`);

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to send password reset email:', error);
    console.error('[EMAIL SERVICE] Error details:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });

    // Provide more specific error messages based on the error type
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Please verify EMAIL_USER and EMAIL_PASSWORD in your .env file are correct.');
    } else if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT') {
      throw new Error('Unable to connect to email server. Please check your network connection.');
    } else if (error.code === 'EENVELOPE') {
      throw new Error('Invalid email address format.');
    } else if (error.message.includes('Email server connection failed')) {
      throw error; // Re-throw our custom connection error
    } else {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
};

module.exports = {
  createTransporter,
  sendPasswordResetEmail,
  createPasswordResetEmailTemplate
};
