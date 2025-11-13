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
    const { username, latitude, longitude } = req.body;

    if (!username || !latitude || !longitude) {
      return sendBadRequest(res, 'Username, latitude, and longitude are required');
    }

    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`SOS received for non-existent user: ${username}. Creating SOS anyway for safety.`);
    }

    const fullname = user?.fullname || username;
    const userId = user?._id || null;

    const address = await getAddressFromCoordinates(latitude, longitude);

    const activeSOS = await SOS.findOne({ username, status: SOS_CONSTANTS.STATUS.ACTIVE });

    if (activeSOS) {
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

      const io = req.app.get('io');
      emitSOSUpdate(io, {
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
      });

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

    const io = req.app.get('io');
    emitSOSAlert(io, {
      id: newSOS._id,
      username: newSOS.username,
      fullname: fullname,
      latitude: newSOS.latitude,
      longitude: newSOS.longitude,
      address: newSOS.address,
      status: newSOS.status,
      timestamp: newSOS.timestamp
    });

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
    const { username } = req.body;

    if (!username) {
      return sendBadRequest(res, 'Username is required');
    }

    const activeSOS = await SOS.findOne({ username, status: SOS_CONSTANTS.STATUS.ACTIVE });
    if (!activeSOS) {
      return sendNotFound(res, 'No active SOS found');
    }

    activeSOS.status = SOS_CONSTANTS.STATUS.CANCELLED;
    activeSOS.resolvedAt = new Date();
    await activeSOS.save();

    const io = req.app.get('io');
    if (io) {
      const cancelledData = {
        id: activeSOS._id,
        username: activeSOS.username,
        status: activeSOS.status,
        resolvedAt: activeSOS.resolvedAt
      };

      // Emit to user's room (both by userId and username for compatibility)
      if (activeSOS.userId) {
        io.to(activeSOS.userId.toString()).emit('sos-cancelled', cancelledData);
      }
      io.to(`user-${activeSOS.username}`).emit('sos-cancelled', cancelledData);

      // Notify admin room
      io.to('admin-room').emit('sos-cancelled', cancelledData);
    }

    return sendOk(res, 'SOS cancelled successfully', {
      sos: {
        id: activeSOS._id,
        status: activeSOS.status,
        resolvedAt: activeSOS.resolvedAt
      }
    });
  } catch (error) {
    console.error('Cancel SOS Error:', error);
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
    const { sosId } = req.params;

    const sos = await SOS.findById(sosId).populate('userId', 'fullname');
    if (!sos) {
      return sendNotFound(res, 'SOS not found');
    }

    if (sos.status !== SOS_CONSTANTS.STATUS.ACTIVE) {
      return sendBadRequest(res, `SOS is already ${sos.status}`, {
        currentStatus: sos.status
      });
    }

    sos.status = SOS_CONSTANTS.STATUS.RESOLVED;
    sos.resolvedAt = new Date();
    await sos.save();

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

      // Emit by userId if available
      if (sos.userId) {
        io.to(sos.userId.toString()).emit('sos-resolved', resolvedData);
      }

      // Also emit by username as fallback (for users not in userId room)
      io.to(`user-${sos.username}`).emit('sos-resolved', resolvedData);

      // Notify admin room
      io.to('admin-room').emit('sos-resolved', {
        id: sos._id,
        username: sos.username,
        status: sos.status,
        resolvedAt: sos.resolvedAt
      });
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
    console.error('Resolve SOS Error:', error);
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

module.exports = {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS,
  resolveSOS,
  getAllSOSHistory
};
