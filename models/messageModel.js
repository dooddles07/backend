const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation ID is required'],
    index: true,
  },
  senderType: {
    type: String,
    enum: ['user', 'admin'],
    required: [true, 'Sender type is required'],
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Sender ID is required'],
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
    required: function() {
      return this.messageType === 'text';
    },
  },
  mediaUrl: {
    type: String,
    required: function() {
      return this.messageType !== 'text';
    },
  },
  thumbnailUrl: {
    type: String,
    default: null,
  },
  mediaDuration: {
    type: Number,
    default: null,
  },
  mediaSize: {
    type: Number,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },
  userName: {
    type: String,
    required: true,
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true,
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
}, {
  timestamps: true,
});

conversationSchema.index({ userId: 1, status: 1 });
conversationSchema.index({ adminId: 1, status: 1 });
conversationSchema.index({ lastMessageTime: -1 });

const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = { Message, Conversation };
