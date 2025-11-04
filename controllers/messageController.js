/**
 * ============================================
 * MESSAGE CONTROLLER
 * ============================================
 *
 * Handles messaging operations between users (mobile) and admins (web)
 * Supports conversations, message sending, and real-time communication
 */

const { Message, Conversation } = require('../models/messageModel');
const User = require('../models/userModel');
const Admin = require('../models/adminModel');

// ============================================
// CONVERSATION MANAGEMENT
// ============================================

/**
 * Get or create a conversation between user and admin
 *
 * @route POST /api/messages/conversation
 * @access Protected (User or Admin)
 * @body {String} userId - ID of the user (optional, will use authenticated user if not provided)
 * @body {String} adminId - ID of the admin (optional)
 */
const getOrCreateConversation = async (req, res) => {
  try {
    console.log('\n📝 === getOrCreateConversation called ===');
    console.log('Request body:', req.body);
    console.log('Request user:', req.user ? { id: req.user._id, fullname: req.user.fullname } : 'No user');
    console.log('Request admin:', req.admin ? { id: req.admin._id, fullname: req.admin.fullname } : 'No admin');

    let { userId, adminId } = req.body;

    // If no userId provided, get it from authenticated user
    if (!userId && req.user) {
      console.log('✅ Extracting userId from authenticated user token');
      userId = req.user._id;
      console.log('UserId:', userId);
    }

    if (!userId) {
      console.log('❌ No userId found - neither in body nor in token');
      return res.status(400).json({ message: 'User ID is required' });
    }

    console.log('🔍 Searching for existing conversation with userId:', userId, 'adminId:', adminId);

    // Find existing conversation
    let conversation = await Conversation.findOne({
      userId,
      ...(adminId && { adminId }),
    });

    if (conversation) {
      console.log('✅ Found existing conversation:', conversation._id);
      return res.status(200).json(conversation);
    }

    // If no conversation exists, create a new one
    console.log('📝 No existing conversation found, creating new one...');

    console.log('🔍 Looking up user by ID:', userId);
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('✅ User found:', user.fullname, user.email);

    let admin = null;
    let adminName = null;

    if (adminId) {
      console.log('🔍 Looking up admin by ID:', adminId);
      admin = await Admin.findById(adminId);
      if (!admin) {
        console.log('❌ Admin not found in database');
        return res.status(404).json({ message: 'Admin not found' });
      }
      adminName = admin.fullname;
      console.log('✅ Admin found:', adminName);
    } else {
      console.log('ℹ️ No adminId provided, conversation will be unassigned');
    }

    console.log('💾 Creating new conversation document...');
    conversation = await Conversation.create({
      userId,
      userName: user.fullname,
      adminId: adminId || null,
      adminName: adminName,
      lastMessage: 'Conversation started',
      lastMessageTime: new Date(),
    });

    console.log('✅ Conversation created successfully:', conversation._id);

    // Create automatic welcome message
    console.log('📝 Creating automatic welcome message...');

    // Find or create a system admin for automated messages
    let systemAdmin = await Admin.findOne({ username: 'resqyou_system' });

    if (!systemAdmin) {
      console.log('Creating ResqYOU System admin account for automated messages...');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('system_admin_2024', 10);

      systemAdmin = await Admin.create({
        username: 'resqyou_system',
        password: hashedPassword,
        fullname: 'ResqYOU Respondents',
        email: 'emergency@resqyou.com',
        role: 'admin',
        isActive: true,
      });
      console.log('✅ System admin created');
    }

    const welcomeMessageText = `Hi ${user.fullname}! 👋\n\nYou're now connected to ResqYOU Emergency Respondents. This is a direct line for emergency assistance and urgent support.\n\nIf you need immediate help or have an emergency situation, please let us know right away. Our response team is here to assist you 24/7.`;

    const welcomeMessage = await Message.create({
      conversationId: conversation._id,
      senderType: 'admin',
      senderId: systemAdmin._id,
      senderModel: 'Admin',
      text: welcomeMessageText,
      isRead: false,
    });

    // Update conversation with welcome message
    conversation.lastMessage = welcomeMessageText.substring(0, 100);
    conversation.lastMessageTime = new Date();
    conversation.unreadCountUser = 1; // Mark as unread for user
    await conversation.save();

    console.log('✅ Welcome message created:', welcomeMessage._id);
    console.log('=== getOrCreateConversation completed ===\n');

    res.status(200).json(conversation);
  } catch (error) {
    console.error('❌ Error in getOrCreateConversation:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all conversations for a user (mobile app)
 *
 * @route GET /api/messages/conversations/user
 * @access Protected (User)
 */
const getUserConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({ userId, status: 'active' })
      .sort({ lastMessageTime: -1 })
      .select('-__v');

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Error in getUserConversations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all conversations for an admin (web dashboard)
 *
 * @route GET /api/messages/conversations/admin
 * @access Protected (Admin)
 */
const getAdminConversations = async (req, res) => {
  try {
    // Get all active conversations (admins can see all)
    const conversations = await Conversation.find({ status: 'active' })
      .sort({ lastMessageTime: -1 })
      .select('-__v');

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Error in getAdminConversations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Assign an admin to a conversation
 *
 * @route PUT /api/messages/conversation/:id/assign
 * @access Protected (Admin)
 * @param {String} id - Conversation ID
 */
const assignAdminToConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin._id;
    const adminName = req.admin.fullname;

    console.log('\n👔 === assignAdminToConversation called ===');
    console.log('Conversation ID:', id);
    console.log('Admin:', adminName, adminId);

    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const wasUnassigned = !conversation.adminId;

    // Update conversation with admin details
    conversation.adminId = adminId;
    conversation.adminName = adminName;
    await conversation.save();

    console.log('✅ Admin assigned to conversation');

    // If this is the first admin assignment, send a welcome message
    if (wasUnassigned) {
      console.log('📝 Sending welcome message (first admin assignment)...');

      const user = await User.findById(conversation.userId);
      const welcomeMessageText = `Hi ${user.fullname}! 👋\n\nI'm ${adminName} from ResqYOU Emergency Response Team, and I'll be handling your case today.\n\nIf you need immediate assistance or have an emergency situation, please let me know right away. I'm here to help you 24/7.`;

      const welcomeMessage = await Message.create({
        conversationId: conversation._id,
        senderType: 'admin',
        senderId: adminId,
        senderModel: 'Admin',
        text: welcomeMessageText,
        isRead: false,
      });

      // Update conversation with welcome message
      conversation.lastMessage = welcomeMessageText.substring(0, 100);
      conversation.lastMessageTime = new Date();
      conversation.unreadCountUser += 1;
      await conversation.save();

      console.log('✅ Welcome message created:', welcomeMessage._id);
    }

    console.log('=== assignAdminToConversation completed ===\n');

    res.status(200).json(conversation);
  } catch (error) {
    console.error('Error in assignAdminToConversation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ============================================
// MESSAGE OPERATIONS
// ============================================

/**
 * Send a message (from user or admin)
 *
 * @route POST /api/messages/send
 * @access Protected (User or Admin)
 * @body {String} conversationId - ID of the conversation
 * @body {String} text - Message content (optional for multimedia messages)
 * @body {String} senderType - 'user' or 'admin'
 * @body {String} messageType - 'text', 'image', 'video', 'audio' (default: 'text')
 * @body {String} mediaData - Base64 encoded media data (for multimedia messages)
 * @body {Number} mediaDuration - Duration in seconds (for audio/video)
 * @body {Number} mediaSize - File size in bytes
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

    // Validation
    if (!conversationId || !senderType) {
      return res.status(400).json({ message: 'Conversation ID and sender type are required' });
    }

    if (!['user', 'admin'].includes(senderType)) {
      return res.status(400).json({ message: 'Invalid sender type' });
    }

    if (!['text', 'image', 'video', 'audio'].includes(messageType)) {
      return res.status(400).json({ message: 'Invalid message type' });
    }

    // For text messages, text is required
    if (messageType === 'text' && !text) {
      return res.status(400).json({ message: 'Text is required for text messages' });
    }

    // For multimedia messages, mediaData is required
    if (messageType !== 'text' && !mediaData) {
      return res.status(400).json({ message: 'Media data is required for multimedia messages' });
    }

    // Verify conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Determine sender ID and model based on sender type
    let senderId, senderModel;
    if (senderType === 'user') {
      senderId = req.user?._id;
      senderModel = 'User';
      if (!senderId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
    } else {
      senderId = req.admin?._id;
      senderModel = 'Admin';
      if (!senderId) {
        return res.status(401).json({ message: 'Admin not authenticated' });
      }
    }

    // Handle media upload to Cloudinary
    let mediaUrl = null;
    let thumbnailUrl = null;

    if (messageType !== 'text' && mediaData) {
      const cloudinary = require('../config/cloudinary');

      try {
        console.log(`📤 Uploading ${messageType} to Cloudinary...`);

        // Determine resource type for Cloudinary
        let resourceType = 'auto';
        if (messageType === 'video') resourceType = 'video';
        else if (messageType === 'audio') resourceType = 'video'; // Cloudinary treats audio as video
        else if (messageType === 'image') resourceType = 'image';

        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(mediaData, {
          resource_type: resourceType,
          folder: 'resqyou_messages',
          // Generate thumbnail for videos
          ...(messageType === 'video' && {
            eager: [
              { width: 300, height: 300, crop: 'thumb', gravity: 'center', format: 'jpg' }
            ]
          })
        });

        mediaUrl = uploadResult.secure_url;

        // Get thumbnail URL for videos
        if (messageType === 'video' && uploadResult.eager && uploadResult.eager[0]) {
          thumbnailUrl = uploadResult.eager[0].secure_url;
        }

        console.log('✅ Media uploaded successfully:', mediaUrl);
      } catch (uploadError) {
        console.error('❌ Error uploading to Cloudinary:', uploadError);
        return res.status(500).json({ message: 'Failed to upload media', error: uploadError.message });
      }
    }

    // Prepare message data
    const messageData = {
      conversationId,
      senderType,
      senderId,
      senderModel,
      messageType,
      isRead: false,
    };

    // Add text if provided
    if (text) {
      messageData.text = text.trim();
    }

    // Add media data if this is a multimedia message
    if (messageType !== 'text') {
      messageData.mediaUrl = mediaUrl;
      if (thumbnailUrl) messageData.thumbnailUrl = thumbnailUrl;
      if (mediaDuration) messageData.mediaDuration = mediaDuration;
      if (mediaSize) messageData.mediaSize = mediaSize;
    }

    // Create the message
    const message = await Message.create(messageData);

    // Determine last message text for conversation preview
    let lastMessageText = '';
    if (messageType === 'text') {
      lastMessageText = text.substring(0, 100);
    } else if (messageType === 'image') {
      lastMessageText = '📷 Image';
    } else if (messageType === 'video') {
      lastMessageText = '🎥 Video';
    } else if (messageType === 'audio') {
      lastMessageText = '🎤 Voice message';
    }

    // Update conversation's last message and unread count
    const updateData = {
      lastMessage: lastMessageText,
      lastMessageTime: new Date(),
    };

    if (senderType === 'user') {
      updateData.unreadCountAdmin = conversation.unreadCountAdmin + 1;
    } else {
      updateData.unreadCountUser = conversation.unreadCountUser + 1;
    }

    await Conversation.findByIdAndUpdate(conversationId, updateData);

    // Populate sender info
    const populatedMessage = await Message.findById(message._id).populate(
      'senderId',
      'fullname email'
    );

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get messages for a conversation
 *
 * @route GET /api/messages/conversation/:id
 * @access Protected (User or Admin)
 * @param {String} id - Conversation ID
 * @query {Number} limit - Number of messages to fetch (default: 50)
 * @query {Number} skip - Number of messages to skip (for pagination)
 */
const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    // Verify conversation exists
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Get messages
    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 }) // Oldest first
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'fullname email')
      .select('-__v');

    res.status(200).json(messages);
  } catch (error) {
    console.error('Error in getConversationMessages:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Mark messages as read
 *
 * @route PUT /api/messages/conversation/:id/read
 * @access Protected (User or Admin)
 * @param {String} id - Conversation ID
 * @body {String} readerType - 'user' or 'admin'
 */
const markMessagesAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { readerType } = req.body;

    if (!['user', 'admin'].includes(readerType)) {
      return res.status(400).json({ message: 'Invalid reader type' });
    }

    // Verify conversation exists
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Mark messages as read (opposite sender type)
    const oppositeSenderType = readerType === 'user' ? 'admin' : 'user';
    await Message.updateMany(
      {
        conversationId: id,
        senderType: oppositeSenderType,
        isRead: false,
      },
      { isRead: true }
    );

    // Reset unread count in conversation
    const updateData = {};
    if (readerType === 'user') {
      updateData.unreadCountUser = 0;
    } else {
      updateData.unreadCountAdmin = 0;
    }

    await Conversation.findByIdAndUpdate(id, updateData);

    res.status(200).json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Archive a conversation
 *
 * @route PUT /api/messages/conversation/:id/archive
 * @access Protected (Admin)
 * @param {String} id - Conversation ID
 */
const archiveConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      { status: 'archived' },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.status(200).json({ message: 'Conversation archived', conversation });
  } catch (error) {
    console.error('Error in archiveConversation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getOrCreateConversation,
  getUserConversations,
  getAdminConversations,
  assignAdminToConversation,
  sendMessage,
  getConversationMessages,
  markMessagesAsRead,
  archiveConversation,
};
