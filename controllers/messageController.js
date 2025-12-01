/**
 * Message Controller
 * Handles messaging operations between users (mobile) and admins (web)
 */

const { Message, Conversation } = require('../models/messageModel');
const User = require('../models/userModel');
const Admin = require('../models/adminModel');
const cloudinary = require('../config/cloudinary');
const { MESSAGE, CONVERSATION, CLOUDINARY, ADMIN_ROLES } = require('../config/constants');
const { hashPassword } = require('../utils/passwordService');
const {
  sendCreated,
  sendOk,
  sendBadRequest,
  sendUnauthorized,
  sendNotFound,
  sendServerError
} = require('../utils/responseHelper');

/**
 * Get message preview text based on type
 */
const getMessagePreview = (messageType, text) => {
  switch (messageType) {
    case 'image':
      return '📷 Image';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎤 Voice message';
    default:
      return text ? text.substring(0, MESSAGE.PREVIEW_LENGTH) : '';
  }
};

/**
 * Get or Create Conversation
 */
const getOrCreateConversation = async (req, res) => {
  try {
    let { userId, adminId } = req.body;

    if (!userId && req.user) {
      userId = req.user._id;
    }

    if (!userId) {
      return sendBadRequest(res, 'User ID is required');
    }

    // First attempt: Check if conversation exists
    let conversation = await Conversation.findOne({
      userId,
      status: CONVERSATION.STATUS.ACTIVE,
      ...(adminId && { adminId })
    });

    if (conversation) {
      const conversationObj = conversation.toObject();
      return res.status(200).json(conversationObj);
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    let adminName = null;
    if (adminId) {
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return sendNotFound(res, 'Admin not found');
      }
      adminName = admin.fullname;
    }

    try {
      // Attempt to create new conversation
      conversation = await Conversation.create({
        userId,
        userName: user.fullname,
        adminId: adminId || null,
        adminName,
        lastMessage: 'No messages yet',
        lastMessageTime: new Date()
      });

      const conversationObj = conversation.toObject();
      return res.status(200).json(conversationObj);
    } catch (createError) {
      // Handle duplicate key error (race condition)
      if (createError.code === 11000 || createError.name === 'MongoServerError') {
        console.log('Duplicate conversation detected, fetching existing conversation...');
        // Another request created the conversation, fetch it
        conversation = await Conversation.findOne({
          userId,
          status: CONVERSATION.STATUS.ACTIVE
        });

        if (conversation) {
          const conversationObj = conversation.toObject();
          return res.status(200).json(conversationObj);
        }
      }
      // Re-throw if it's not a duplicate key error
      throw createError;
    }
  } catch (error) {
    console.error('Error in getOrCreateConversation:', error);
    return sendServerError(res, 'Failed to get or create conversation');
  }
};

/**
 * Get User Conversations
 */
const getUserConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      userId,
      status: CONVERSATION.STATUS.ACTIVE
    })
      .sort({ lastMessageTime: -1 })
      .select('-__v');

    return sendOk(res, 'Conversations retrieved successfully', conversations);
  } catch (error) {
    console.error('Error in getUserConversations:', error);
    return sendServerError(res, 'Failed to retrieve conversations');
  }
};

/**
 * Get Admin Conversations
 */
const getAdminConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      status: CONVERSATION.STATUS.ACTIVE
    })
      .populate('userId', 'fullname avatar username email') // Populate user details including avatar
      .sort({ lastMessageTime: -1 })
      .select('-__v');

    return sendOk(res, 'Conversations retrieved successfully', conversations);
  } catch (error) {
    console.error('Error in getAdminConversations:', error);
    return sendServerError(res, 'Failed to retrieve conversations');
  }
};

/**
 * Send Message
 */
const sendMessage = async (req, res) => {
  try {
    const {
      conversationId,
      text,
      senderType,
      messageType = 'text',
      mediaData,
      mediaDuration,
      mediaSize
    } = req.body;

    if (!conversationId || !senderType) {
      return sendBadRequest(res, 'Conversation ID and sender type are required');
    }

    if (!MESSAGE.SENDER_TYPES.includes(senderType)) {
      return sendBadRequest(res, 'Invalid sender type');
    }

    if (!MESSAGE.TYPES.includes(messageType)) {
      return sendBadRequest(res, 'Invalid message type');
    }

    if (messageType === 'text' && !text) {
      return sendBadRequest(res, 'Text is required for text messages');
    }

    if (messageType !== 'text' && !mediaData) {
      return sendBadRequest(res, 'Media data is required for multimedia messages');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return sendNotFound(res, 'Conversation not found');
    }

    let senderId, senderModel;
    if (senderType === 'user') {
      senderId = req.user?._id;
      senderModel = 'User';
      if (!senderId) {
        return sendUnauthorized(res, 'User not authenticated');
      }
    } else {
      senderId = req.admin?._id;
      senderModel = 'Admin';
      if (!senderId) {
        return sendUnauthorized(res, 'Admin not authenticated');
      }
    }

    let mediaUrl = null;
    let thumbnailUrl = null;

    if (messageType !== 'text' && mediaData) {
      try {
        const resourceType = messageType === 'image' ? 'image' : 'video';

        const uploadResult = await cloudinary.uploader.upload(mediaData, {
          resource_type: resourceType,
          folder: CLOUDINARY.FOLDER,
          ...(messageType === 'video' && {
            eager: [CLOUDINARY.VIDEO_THUMBNAIL]
          })
        });

        mediaUrl = uploadResult.secure_url;

        if (messageType === 'video' && uploadResult.eager?.[0]) {
          thumbnailUrl = uploadResult.eager[0].secure_url;
        }
      } catch (uploadError) {
        console.error('Error uploading to Cloudinary:', uploadError);
        return sendServerError(res, 'Failed to upload media');
      }
    }

    const messageData = {
      conversationId,
      senderType,
      senderId,
      senderModel,
      messageType,
      isRead: false
    };

    if (text) messageData.text = text.trim();
    if (messageType !== 'text') {
      messageData.mediaUrl = mediaUrl;
      if (thumbnailUrl) messageData.thumbnailUrl = thumbnailUrl;
      if (mediaDuration) messageData.mediaDuration = mediaDuration;
      if (mediaSize) messageData.mediaSize = mediaSize;
    }

    const message = await Message.create(messageData);

    const lastMessageText = getMessagePreview(messageType, text);
    const updateData = {
      lastMessage: lastMessageText,
      lastMessageTime: new Date()
    };

    if (senderType === 'user') {
      updateData.unreadCountAdmin = conversation.unreadCountAdmin + 1;
    } else {
      updateData.unreadCountUser = conversation.unreadCountUser + 1;
    }

    await Conversation.findByIdAndUpdate(conversationId, updateData);

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'fullname email')
      .lean(); // Convert to plain JavaScript object

    return sendCreated(res, 'Message sent successfully', populatedMessage);
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return sendServerError(res, 'Failed to send message');
  }
};

/**
 * Get Conversation Messages
 */
const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || MESSAGE.DEFAULT_LIMIT;
    const skip = parseInt(req.query.skip) || 0;

    console.log('Fetching messages for conversation:', id);
    console.log('Query params - limit:', limit, 'skip:', skip);

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('Invalid conversation ID format:', id);
      return sendBadRequest(res, 'Invalid conversation ID format');
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      console.log('Conversation not found for id:', id);
      return sendNotFound(res, 'Conversation not found');
    }

    console.log('Conversation found, fetching messages...');

    // Fetch messages without populate first to avoid refPath issues
    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .lean();

    console.log(`Found ${messages.length} messages for conversation ${id}`);

    // Manually populate sender info based on senderModel
    const populatedMessages = await Promise.all(
      messages.map(async (message) => {
        try {
          if (message.senderId && message.senderModel) {
            const Model = message.senderModel === 'User' ? User : Admin;
            const sender = await Model.findById(message.senderId)
              .select('fullname email')
              .lean();

            if (sender) {
              message.senderId = sender;
            }
          }
        } catch (populateError) {
          console.error('Error populating sender for message:', message._id, populateError.message);
          // Keep the message but with unpopulated senderId
        }
        return message;
      })
    );

    return sendOk(res, 'Messages retrieved successfully', populatedMessages);
  } catch (error) {
    console.error('Error in getConversationMessages:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return sendServerError(res, 'Failed to retrieve messages');
  }
};

/**
 * Mark Messages as Read
 */
const markMessagesAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { readerType } = req.body;

    if (!MESSAGE.SENDER_TYPES.includes(readerType)) {
      return sendBadRequest(res, 'Invalid reader type');
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return sendNotFound(res, 'Conversation not found');
    }

    const oppositeSenderType = readerType === 'user' ? 'admin' : 'user';
    await Message.updateMany(
      {
        conversationId: id,
        senderType: oppositeSenderType,
        isRead: false
      },
      { isRead: true }
    );

    const updateData = readerType === 'user'
      ? { unreadCountUser: 0 }
      : { unreadCountAdmin: 0 };

    await Conversation.findByIdAndUpdate(id, updateData);

    return sendOk(res, 'Messages marked as read');
  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
    return sendServerError(res, 'Failed to mark messages as read');
  }
};

/**
 * Archive Conversation
 */
const archiveConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { status: CONVERSATION.STATUS.ARCHIVED },
      { new: true }
    );

    if (!conversation) {
      return sendNotFound(res, 'Conversation not found');
    }

    return sendOk(res, 'Conversation archived successfully', { conversation });
  } catch (error) {
    console.error('Error in archiveConversation:', error);
    return sendServerError(res, 'Failed to archive conversation');
  }
};

module.exports = {
  getOrCreateConversation,
  getUserConversations,
  getAdminConversations,
  sendMessage,
  getConversationMessages,
  markMessagesAsRead,
  archiveConversation
};
