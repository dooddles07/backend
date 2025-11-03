const SOS = require('../models/sosModel');
const User = require('../models/userModel');
const axios = require('axios');

// Send SOS
const sendSOS = async (req, res) => {
  try {
    const { username, latitude, longitude } = req.body;

    // Validate required fields
    if (!username || !latitude || !longitude) {
      return res.status(400).json({ 
        message: 'Please provide username, latitude, and longitude' 
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: 'Invalid latitude value' });
    }
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Invalid longitude value' });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get address from coordinates (optional - using reverse geocoding)
    let address = 'Location not available';
    try {
      const geocodeResponse = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        {
          headers: {
            'User-Agent': 'ResQYou-App/1.0'
          }
        }
      );
      
      if (geocodeResponse.data && geocodeResponse.data.display_name) {
        address = geocodeResponse.data.display_name;
      }
    } catch (geocodeError) {
      console.log('Geocoding error:', geocodeError.message);
      // Continue without address - not critical
    }

    // Check if user has an active SOS already
    const activeSOS = await SOS.findOne({ 
      username, 
      status: 'active' 
    });

    if (activeSOS) {
      // Update existing active SOS and add to history
      activeSOS.latitude = latitude;
      activeSOS.longitude = longitude;
      activeSOS.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
      activeSOS.address = address;
      activeSOS.fullname = user.fullname; // Update fullname in case it changed
      activeSOS.lastUpdated = new Date();
      
      // Add to location history
      activeSOS.locationHistory.push({
        latitude,
        longitude,
        timestamp: new Date(),
        address
      });
      
      // Keep only last 50 location updates
      if (activeSOS.locationHistory.length > 50) {
        activeSOS.locationHistory = activeSOS.locationHistory.slice(-50);
      }
      
      await activeSOS.save();

      return res.status(200).json({
        message: 'SOS location updated successfully',
        sos: {
          id: activeSOS._id,
          username: activeSOS.username,
          fullname: user.fullname,
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

    // Create new SOS
    const newSOS = new SOS({
      username,
      fullname: user.fullname,
      userId: user._id,
      latitude,
      longitude,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON uses [lng, lat]
      },
      address,
      status: 'active',
      locationHistory: [{
        latitude,
        longitude,
        timestamp: new Date(),
        address
      }]
    });

    await newSOS.save();

    res.status(201).json({
      message: 'SOS sent successfully',
      sos: {
        id: newSOS._id,
        username: newSOS.username,
        fullname: user.fullname,
        latitude: newSOS.latitude,
        longitude: newSOS.longitude,
        address: newSOS.address,
        status: newSOS.status,
        timestamp: newSOS.timestamp
      }
    });

  } catch (error) {
    console.error('SOS Error:', error);
    res.status(500).json({ 
      message: 'Failed to send SOS. Please try again.',
      error: error.message 
    });
  }
};

// Cancel/Disable SOS
const cancelSOS = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const activeSOS = await SOS.findOne({ 
      username, 
      status: 'active' 
    });

    if (!activeSOS) {
      return res.status(404).json({ message: 'No active SOS found' });
    }

    activeSOS.status = 'cancelled';
    activeSOS.resolvedAt = new Date();
    await activeSOS.save();

    res.status(200).json({
      message: 'SOS cancelled successfully',
      sos: {
        id: activeSOS._id,
        status: activeSOS.status,
        resolvedAt: activeSOS.resolvedAt
      }
    });

  } catch (error) {
    console.error('Cancel SOS Error:', error);
    res.status(500).json({ 
      message: 'Failed to cancel SOS',
      error: error.message 
    });
  }
};

// Get user's SOS history
const getSOSHistory = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const sosHistory = await SOS.find({ username })
      .sort({ timestamp: -1 })
      .limit(50);

    res.status(200).json({
      message: 'SOS history retrieved successfully',
      count: sosHistory.length,
      history: sosHistory
    });

  } catch (error) {
    console.error('Get SOS History Error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve SOS history',
      error: error.message 
    });
  }
};

// Get active SOS for a user
const getActiveSOS = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const activeSOS = await SOS.findOne({ 
      username, 
      status: 'active' 
    });

    if (!activeSOS) {
      return res.status(404).json({ 
        message: 'No active SOS found',
        hasActiveSOS: false 
      });
    }

    // Get user's fullname
    const user = await User.findOne({ username });

    res.status(200).json({
      message: 'Active SOS found',
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
    res.status(500).json({ 
      message: 'Failed to retrieve active SOS',
      error: error.message 
    });
  }
};

// Get all active SOS (for admin/emergency responders)
const getAllActiveSOS = async (req, res) => {
  try {
    const activeSOS = await SOS.find({ status: 'active' })
      .populate('userId', 'fullname email contactNumber')
      .sort({ timestamp: -1 });

    res.status(200).json({
      message: 'Active SOS alerts retrieved successfully',
      count: activeSOS.length,
      alerts: activeSOS
    });

  } catch (error) {
    console.error('Get All Active SOS Error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve active SOS alerts',
      error: error.message 
    });
  }
};

module.exports = {
  sendSOS,
  cancelSOS,
  getSOSHistory,
  getActiveSOS,
  getAllActiveSOS
};