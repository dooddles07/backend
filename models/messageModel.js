/**
 * ============================================
 * MESSAGE MODEL
 * ============================================
 *
 * Defines the schema for messages exchanged between users and admins.
 * Used for emergency communication and support messaging.
 */

const mongoose = require('mongoose');

/**
 * Message Schema
 *
 * Represents individual messages in conversations between users (mobile) and admins (web)
 *
 * @property {ObjectId} conversationId - Reference to the conversation this message belongs to
 * @property {String} senderType - Type of sender: 'user' or 'admin'
 * @property {ObjectId} senderId - Reference to either User or Admin model
 * @property {String} messageType - Type of message: 'text', 'image', 'video', 'audio'
 * @property {String} text - Message content (optional for multimedia messages)
 * @property {String} mediaUrl - URL of uploaded media (for image/video/audio messages)
 * @property {String} thumbnailUrl - Thumbnail URL for videos
 * @property {Number} mediaDuration - Duration in seconds for audio/video
 * @property {Number} mediaSize - File size in bytes
 * @property {Boolean} isRead - Whether message has been read by recipient
 * @property {Date} createdAt - Message timestamp (auto-generated)
 * @property {Date} updatedAt - Last update timestamp (auto-generated)
 */
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true, // Index for fast conversation message queries
    },
    senderType: {
      type: String,
      enum: ['user', 'admin'],
      required: [true, 'Sender type is required'],
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Sender ID is required'],
      // Dynamic reference based on senderType
      refPath: 'senderModel',
    },
    senderModel: {
      type: String,
      required: true,
      enum: ['User', 'Admin'],
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio'],
      default: 'text',
      required: [true, 'Message type is required'],
    },
    text: {
      type: String,
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
      // Text is required only for text messages
      required: function() {
        return this.messageType === 'text';
      },
    },
    mediaUrl: {
      type: String,
      // Media URL is required for non-text messages
      required: function() {
        return this.messageType !== 'text';
      },
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    mediaDuration: {
      type: Number, // Duration in seconds
      default: null,
    },
    mediaSize: {
      type: Number, // Size in bytes
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

/**
 * Conversation Schema
 *
 * Represents a conversation thread between a user (mobile) and admin (web)
 *
 * @property {ObjectId} userId - Reference to the mobile User
 * @property {String} userName - User's full name (denormalized for performance)
 * @property {ObjectId} adminId - Reference to the Admin (null if not assigned)
 * @property {String} adminName - Admin's full name (denormalized for performance)
 * @property {String} lastMessage - Text of the most recent message
 * @property {Date} lastMessageTime - Timestamp of most recent message
 * @property {Number} unreadCountUser - Unread messages count for user
 * @property {Number} unreadCountAdmin - Unread messages count for admin
 * @property {String} status - Conversation status: 'active', 'archived'
 * @property {ObjectId} sosId - Optional reference to SOS alert that started this conversation
 * @property {Date} createdAt - Conversation creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true, // Index for user conversation queries
    },
    userName: {
      type: String,
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true, // Index for admin conversation queries
    },
    adminName: {
      type: String,
      default: null,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageTime: {
      type: Date,
      default: Date.now,
    },
    unreadCountUser: {
      type: Number,
      default: 0,
    },
    unreadCountAdmin: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sos',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
conversationSchema.index({ userId: 1, status: 1 });
conversationSchema.index({ adminId: 1, status: 1 });
conversationSchema.index({ lastMessageTime: -1 }); // Sort by most recent

const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = { Message, Conversation };
