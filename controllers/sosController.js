/**
 * SOS Controller
 * Handles emergency SOS alerts and location tracking
 */

const SOS = require('../models/sosModel');
const User = require('../models/userModel');
const axios = require('axios');
const { SOS: SOS_CONSTANTS } = require('../config/constants');
const {
  sendCreated,
  sendOk,
  sendBadRequest,
  sendNotFound,
  sendServerError
} = require('../utils/responseHelper');

const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const response = await axios.get(
      'https://nominatim.openstreetmap.org/reverse',
      {
        params: { format: 'json', lat: latitude, lon: longitude },
        headers: { 'User-Agent': 'ResQYou-App/1.0' },
        timeout: 5000
      }
    );

    return response.data?.display_name || 'Location not available';
  } catch (error) {
    console.log('Geocoding error:', error.message);
    return 'Location not available';
  }
};

const emitSOSAlert = (io, sosData) => {
  if (!io) return;
  io.to('admin-room').emit('sos-alert', sosData);
};

const emitSOSUpdate = (io, sosData) => {
  if (!io) return;
  io.to('admin-room').emit('sos-updated', sosData);
};

const sendSOS = async (req, res) => {
  try {
    console.log('📥 SOS Request received');
    console.log('📋 Request body:', req.body);

    const { username, latitude, longitude } = req.body;

    console.log('👤 Username:', username);
    console.log('📍 Latitude:', latitude, 'Type:', typeof latitude);
    console.log('📍 Longitude:', longitude, 'Type:', typeof longitude);

    if (!username || !latitude || !longitude) {
      console.error('❌ Missing required fields:', { username, latitude, longitude });
      return sendBadRequest(res, 'Username, latitude, and longitude are required');
    }

    // Validate coordinates are numbers
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      console.error('❌ Invalid coordinate types');
      return sendBadRequest(res, 'Latitude and longitude must be numbers');
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      console.error('❌ Coordinates out of valid range');
      return sendBadRequest(res, 'Invalid coordinate values');
    }

    // 🔒 SECURITY: Prevent IDOR - Users can only send SOS for themselves
    if (req.user.username !== username) {
      console.warn(`⚠️ IDOR attempt: User ${req.user.username} tried to send SOS as ${username}`);
      return sendBadRequest(res, 'You can only send SOS for your own account');
    }

    console.log('✅ Validation passed');

    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`⚠️ SOS received for non-existent user: ${username}. Creating SOS anyway for safety.`);
    } else {
      console.log('✅ User found:', user.fullname);
    }

    const fullname = user?.fullname || username;
    const userId = user?._id || null;

    console.log('🗺️ Getting address for coordinates:', latitude, longitude);
    const address = await getAddressFromCoordinates(latitude, longitude);
    console.log('📍 Address resolved:', address);

    console.log('🔍 Checking for existing active SOS...');
    const activeSOS = await SOS.findOne({ username, status: SOS_CONSTANTS.STATUS.ACTIVE });

    if (activeSOS) {
      console.log('🔄 Updating existing SOS:', activeSOS._id);

      activeSOS.latitude = latitude;
      activeSOS.longitude = longitude;
      activeSOS.location = { type: 'Point', coordinates: [longitude, latitude] };
      activeSOS.address = address;
      activeSOS.fullname = fullname;
      activeSOS.lastUpdated = new Date();

      activeSOS.locationHistory.push({
        latitude,
        longitude,
        timestamp: new Date(),
        address
      });

      if (activeSOS.locationHistory.length > SOS_CONSTANTS.MAX_LOCATION_HISTORY) {
        activeSOS.locationHistory = activeSOS.locationHistory.slice(-SOS_CONSTANTS.MAX_LOCATION_HISTORY);
      }

      await activeSOS.save();
      console.log('✅ SOS updated successfully');

      const io = req.app.get('io');
      const updateData = {
        id: activeSOS._id,
        username: activeSOS.username,
        fullname: fullname,
        latitude: activeSOS.latitude,
        longitude: activeSOS.longitude,
        address: activeSOS.address,
        status: activeSOS.status,
        timestamp: activeSOS.timestamp,
        lastUpdated: activeSOS.lastUpdated,
        updateCount: activeSOS.locationHistory.length
      };

      console.log('📡 Emitting sos-updated to admin-room:', updateData);
      emitSOSUpdate(io, updateData);

      return sendOk(res, 'SOS location updated successfully', {
        sos: {
          id: activeSOS._id,
          username: activeSOS.username,
          fullname: fullname,
          latitude: activeSOS.latitude,
          longitude: activeSOS.longitude,
          address: activeSOS.address,
          status: activeSOS.status,
          timestamp: activeSOS.timestamp,
          lastUpdated: activeSOS.lastUpdated,
          updateCount: activeSOS.locationHistory.length
        }
      });
    }

    console.log('🆕 Creating new SOS entry');

    const newSOS = new SOS({
      username,
      fullname: fullname,
      userId: userId,
      latitude,
      longitude,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      address,
      status: SOS_CONSTANTS.STATUS.ACTIVE,
      locationHistory: [{ latitude, longitude, timestamp: new Date(), address }]
    });

    await newSOS.save();
    console.log('✅ New SOS saved to database:', newSOS._id);

    const io = req.app.get('io');
    const alertData = {
      id: newSOS._id,
      username: newSOS.username,
      fullname: fullname,
      latitude: newSOS.latitude,
      longitude: newSOS.longitude,
      address: newSOS.address,
      status: newSOS.status,
      timestamp: newSOS.timestamp
    };

    console.log('📡 Emitting sos-alert to admin-room:', alertData);
    emitSOSAlert(io, alertData);
    console.log('✅ Socket.IO emission complete');

    return sendCreated(res, 'SOS sent successfully', {
      sos: {
        id: newSOS._id,
        username: newSOS.username,
        fullname: fullname,
        latitude: newSOS.latitude,
        longitude: newSOS.longitude,
        address: newSOS.address,
        status: newSOS.status,
        timestamp: newSOS.timestamp
      }
    });
  } catch (error) {
    console.error('SOS Error:', error);
    return sendServerError(res, 'Failed to send SOS. Please try again.');
  }
};

/**
 * Cancel SOS Alert
 */
const cancelSOS = async (req, res) => {
  try {
    console.log('📥 Cancel SOS Request received');
    console.log('📋 Request body:', req.body);

    const { username } = req.body;

    if (!username) {
      console.error('❌ Missing username in cancel request');
      return sendBadRequest(res, 'Username is required');
    }

    // 🔒 SECURITY: Prevent IDOR - Users can only cancel their own SOS
    if (req.user.username !== username) {
      console.warn(`⚠️ IDOR attempt: User ${req.user.username} tried to cancel ${username}'s SOS`);
      return sendBadRequest(res, 'You can only cancel your own SOS');
    }

    console.log('🔍 Looking for active SOS for username:', username);
    const activeSOS = await SOS.findOne({ username, status: SOS_CONSTANTS.STATUS.ACTIVE });

    if (!activeSOS) {
      console.warn(`⚠️ No active SOS found for username: ${username}`);
      return sendNotFound(res, 'No active SOS found');
    }

    console.log('✅ Found active SOS:', activeSOS._id);
    console.log('   Current status:', activeSOS.status);

    activeSOS.status = SOS_CONSTANTS.STATUS.CANCELLED;
    activeSOS.cancelledAt = new Date();
    await activeSOS.save();

    console.log('✅ SOS status updated to CANCELLED in database');
    console.log('   SOS ID:', activeSOS._id);
    console.log('   Cancelled at:', activeSOS.cancelledAt);

    const io = req.app.get('io');
    if (io) {
      const cancelledData = {
        id: activeSOS._id,
        username: activeSOS.username,
        status: activeSOS.status,
        cancelledAt: activeSOS.cancelledAt
      };

      console.log('📡 Emitting sos-cancelled event with data:', cancelledData);

      // Emit to user's room (both by userId and username for compatibility)
      if (activeSOS.userId) {
        io.to(activeSOS.userId.toString()).emit('sos-cancelled', cancelledData);
        console.log(`   ✅ Emitted to user room: ${activeSOS.userId.toString()}`);
      }
      io.to(`user-${activeSOS.username}`).emit('sos-cancelled', cancelledData);
      console.log(`   ✅ Emitted to username room: user-${activeSOS.username}`);

      // Notify admin room
      io.to('admin-room').emit('sos-cancelled', cancelledData);
      console.log('   ✅ Emitted to admin-room');
      console.log('✅ Socket.IO sos-cancelled emission complete');
    } else {
      console.error('❌ Socket.IO instance not found - events not emitted!');
    }

    return sendOk(res, 'SOS cancelled successfully', {
      sos: {
        id: activeSOS._id,
        status: activeSOS.status,
        cancelledAt: activeSOS.cancelledAt
      }
    });
  } catch (error) {
    console.error('❌ Cancel SOS Error:', error);
    return sendServerError(res, 'Failed to cancel SOS');
  }
};

/**
 * Get SOS History
 */
const getSOSHistory = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return sendBadRequest(res, 'Username is required');
    }

    // 🔒 SECURITY: Prevent IDOR - Users can only access their own data
    if (req.user.username !== username) {
      console.warn(`⚠️ IDOR attempt: User ${req.user.username} tried to access ${username}'s history`);
      return sendBadRequest(res, 'You can only access your own SOS history');
    }

    const sosHistory = await SOS.find({ username })
      .sort({ timestamp: -1 })
      .limit(SOS_CONSTANTS.DEFAULT_HISTORY_LIMIT);

    return sendOk(res, 'SOS history retrieved successfully', {
      count: sosHistory.length,
      history: sosHistory
    });
  } catch (error) {
    console.error('Get SOS History Error:', error);
    return sendServerError(res, 'Failed to retrieve SOS history');
  }
};

/**
 * Get Active SOS
 */
const getActiveSOS = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return sendBadRequest(res, 'Username is required');
    }

    // 🔒 SECURITY: Prevent IDOR - Users can only access their own data
    if (req.user.username !== username) {
      console.warn(`⚠️ IDOR attempt: User ${req.user.username} tried to check ${username}'s active SOS`);
      return sendBadRequest(res, 'You can only check your own active SOS');
    }

    const activeSOS = await SOS.findOne({ username, status: SOS_CONSTANTS.STATUS.ACTIVE });
    if (!activeSOS) {
      return sendNotFound(res, 'No active SOS found', {
        hasActiveSOS: false
      });
    }

    const user = await User.findOne({ username });

    return sendOk(res, 'Active SOS found', {
      hasActiveSOS: true,
      sos: {
        id: activeSOS._id,
        username: activeSOS.username,
        fullname: user?.fullname || username,
        latitude: activeSOS.latitude,
        longitude: activeSOS.longitude,
        address: activeSOS.address,
        status: activeSOS.status,
        timestamp: activeSOS.timestamp
      }
    });
  } catch (error) {
    console.error('Get Active SOS Error:', error);
    return sendServerError(res, 'Failed to retrieve active SOS');
  }
};

/**
 * Get All Active SOS (Admin)
 */
const getAllActiveSOS = async (req, res) => {
  try {
    const activeSOS = await SOS.find({ status: SOS_CONSTANTS.STATUS.ACTIVE })
      .populate('userId', 'fullname email contactNumber')
      .sort({ timestamp: -1 });

    return sendOk(res, 'Active SOS alerts retrieved successfully', {
      count: activeSOS.length,
      alerts: activeSOS
    });
  } catch (error) {
    console.error('Get All Active SOS Error:', error);
    return sendServerError(res, 'Failed to retrieve active SOS alerts');
  }
};

/**
 * Resolve SOS (Admin)
 */
const resolveSOS = async (req, res) => {
  try {
    console.log('📥 Resolve SOS Request received');
    const { sosId } = req.params;
    console.log('🔍 Looking for SOS ID:', sosId);

    const sos = await SOS.findById(sosId).populate('userId', 'fullname');
    if (!sos) {
      console.warn(`⚠️ SOS not found: ${sosId}`);
      return sendNotFound(res, 'SOS not found');
    }

    console.log('✅ Found SOS:', sosId);
    console.log('   Username:', sos.username);
    console.log('   Current status:', sos.status);

    if (sos.status !== SOS_CONSTANTS.STATUS.ACTIVE) {
      console.warn(`⚠️ SOS is already ${sos.status}`);
      return sendBadRequest(res, `SOS is already ${sos.status}`, {
        currentStatus: sos.status
      });
    }

    sos.status = SOS_CONSTANTS.STATUS.RESOLVED;
    sos.resolvedAt = new Date();
    await sos.save();

    console.log('✅ SOS status updated to RESOLVED in database');
    console.log('   Resolved at:', sos.resolvedAt);

    const io = req.app.get('io');
    if (io) {
      // Emit to user's room (both by userId and username for compatibility)
      const resolvedData = {
        id: sos._id,
        username: sos.username,
        status: sos.status,
        resolvedAt: sos.resolvedAt,
        message: 'Your emergency has been resolved by responders'
      };

      console.log('📡 Emitting sos-resolved event with data:', resolvedData);

      // Emit by userId if available
      if (sos.userId) {
        io.to(sos.userId.toString()).emit('sos-resolved', resolvedData);
        console.log(`   ✅ Emitted to user room: ${sos.userId.toString()}`);
      }

      // Also emit by username as fallback (for users not in userId room)
      io.to(`user-${sos.username}`).emit('sos-resolved', resolvedData);
      console.log(`   ✅ Emitted to username room: user-${sos.username}`);

      // Notify admin room
      const adminData = {
        id: sos._id,
        username: sos.username,
        status: sos.status,
        resolvedAt: sos.resolvedAt
      };
      io.to('admin-room').emit('sos-resolved', adminData);
      console.log('   ✅ Emitted to admin-room:', adminData);
      console.log('✅ Socket.IO sos-resolved emission complete');
    } else {
      console.error('❌ Socket.IO instance not found - events not emitted!');
    }

    return sendOk(res, 'SOS marked as resolved successfully', {
      sos: {
        id: sos._id,
        username: sos.username,
        status: sos.status,
        resolvedAt: sos.resolvedAt
      }
    });
  } catch (error) {
    console.error('❌ Resolve SOS Error:', error);
    return sendServerError(res, 'Failed to resolve SOS');
  }
};

/**
 * Get All SOS History (Admin)
 */
const getAllSOSHistory = async (req, res) => {
  try {
    const { limit = SOS_CONSTANTS.DEFAULT_HISTORY_LIMIT, status } = req.query;

    const query = status
      ? { status }
      : { status: { $in: [SOS_CONSTANTS.STATUS.RESOLVED, SOS_CONSTANTS.STATUS.CANCELLED] } };

    const sosHistory = await SOS.find(query)
      .populate('userId', 'fullname email contactNumber')
      .sort({ resolvedAt: -1, timestamp: -1 })
      .limit(parseInt(limit));

    return sendOk(res, 'SOS history retrieved successfully', {
      count: sosHistory.length,
      history: sosHistory
    });
  } catch (error) {
    console.error('Get All SOS History Error:', error);
    return sendServerError(res, 'Failed to retrieve SOS history');
  }
};

/**
 * Get SOS Statistics (Admin)
 * Efficiently returns counts without fetching all documents
 */
const getSOSStats = async (req, res) => {
  try {
    console.log('📊 Fetching SOS statistics...');

    // Use MongoDB aggregation for efficient counting
    const [stats] = await SOS.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [
            { $match: { status: SOS_CONSTANTS.STATUS.ACTIVE } },
            { $count: 'count' }
          ],
          resolved: [
            { $match: { status: SOS_CONSTANTS.STATUS.RESOLVED } },
            { $count: 'count' }
          ],
          cancelled: [
            { $match: { status: SOS_CONSTANTS.STATUS.CANCELLED } },
            { $count: 'count' }
          ],
          critical: [
            {
              $match: {
                status: SOS_CONSTANTS.STATUS.ACTIVE,
                timestamp: {
                  $gte: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
                }
              }
            },
            { $count: 'count' }
          ]
        }
      }
    ]);

    const result = {
      totalIncidents: stats.total[0]?.count || 0,
      activeIncidents: stats.active[0]?.count || 0,
      resolvedIncidents: stats.resolved[0]?.count || 0,
      cancelledIncidents: stats.cancelled[0]?.count || 0,
      criticalIncidents: stats.critical[0]?.count || 0
    };

    console.log('✅ SOS statistics retrieved:', result);

    return sendOk(res, 'SOS statistics retrieved successfully', result);
  } catch (error) {
    console.error('Get SOS Stats Error:', error);
    return sendServerError(res, 'Failed to retrieve SOS statistics');
  }
};

module.exports = {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS,
  resolveSOS,
  getAllSOSHistory,
  getSOSStats
};
