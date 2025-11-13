/**
 * SOS Controller Tests
 * Tests critical emergency SOS functionality
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const SOS = require('../models/sosModel');
const User = require('../models/userModel');

// Test database connection
const testDBUrl = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/resqyou-test';

beforeAll(async () => {
  // Connect to test database
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(testDBUrl);
  }
});

afterAll(async () => {
  // Cleanup and close connection
  await SOS.deleteMany({});
  await User.deleteMany({});
  await mongoose.connection.close();
});

beforeEach(async () => {
  // Clear database before each test
  await SOS.deleteMany({});
  await User.deleteMany({});
});

describe('SOS Emergency System', () => {
  describe('POST /api/sos/send', () => {
    it('should create a new SOS alert with valid data', async () => {
      // Create test user first
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123',
        contactNumber: '+1234567890'
      });

      const sosData = {
        username: 'testuser',
        latitude: 14.5995,
        longitude: 120.9842,
        address: 'Test Location'
      };

      const response = await request(app)
        .post('/api/sos/send')
        .send(sosData)
        .expect(201);

      expect(response.body.message).toBe('SOS sent successfully');
      expect(response.body.sos).toHaveProperty('id');
      expect(response.body.sos.username).toBe('testuser');
      expect(response.body.sos.status).toBe('active');
    });

    it('should return 400 if latitude is invalid', async () => {
      const sosData = {
        username: 'testuser',
        latitude: 100, // Invalid latitude
        longitude: 120.9842
      };

      const response = await request(app)
        .post('/api/sos/send')
        .send(sosData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 400 if required fields are missing', async () => {
      const sosData = {
        username: 'testuser'
        // Missing latitude and longitude
      };

      const response = await request(app)
        .post('/api/sos/send')
        .send(sosData)
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
    });

    it('should update existing active SOS instead of creating new one', async () => {
      // Create test user
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123',
        contactNumber: '+1234567890'
      });

      // Send first SOS
      const firstSOS = {
        username: 'testuser',
        latitude: 14.5995,
        longitude: 120.9842
      };

      await request(app)
        .post('/api/sos/send')
        .send(firstSOS)
        .expect(201);

      // Send second SOS (should update, not create)
      const secondSOS = {
        username: 'testuser',
        latitude: 14.6000,
        longitude: 120.9850
      };

      const response = await request(app)
        .post('/api/sos/send')
        .send(secondSOS)
        .expect(200);

      expect(response.body.message).toBe('SOS location updated successfully');

      // Verify only one active SOS exists
      const activeSOS = await SOS.find({ username: 'testuser', status: 'active' });
      expect(activeSOS).toHaveLength(1);
    });
  });

  describe('POST /api/sos/cancel', () => {
    it('should cancel an active SOS', async () => {
      // Create test user and SOS
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123'
      });

      await SOS.create({
        username: 'testuser',
        fullname: 'Test User',
        userId: testUser._id,
        latitude: 14.5995,
        longitude: 120.9842,
        location: {
          type: 'Point',
          coordinates: [120.9842, 14.5995]
        },
        status: 'active'
      });

      const response = await request(app)
        .post('/api/sos/cancel')
        .send({ username: 'testuser' })
        .expect(200);

      expect(response.body.message).toBe('SOS cancelled successfully');
      expect(response.body.sos.status).toBe('cancelled');

      // Verify SOS is cancelled in database
      const cancelledSOS = await SOS.findOne({ username: 'testuser' });
      expect(cancelledSOS.status).toBe('cancelled');
      expect(cancelledSOS.resolvedAt).toBeDefined();
    });

    it('should return 404 if no active SOS found', async () => {
      const response = await request(app)
        .post('/api/sos/cancel')
        .send({ username: 'nonexistent' })
        .expect(404);

      expect(response.body.message).toBe('No active SOS found');
    });
  });

  describe('GET /api/sos/active/:username', () => {
    it('should return active SOS for a user', async () => {
      // Create test user and SOS
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123'
      });

      await SOS.create({
        username: 'testuser',
        fullname: 'Test User',
        userId: testUser._id,
        latitude: 14.5995,
        longitude: 120.9842,
        location: {
          type: 'Point',
          coordinates: [120.9842, 14.5995]
        },
        status: 'active'
      });

      const response = await request(app)
        .get('/api/sos/active/testuser')
        .expect(200);

      expect(response.body.hasActiveSOS).toBe(true);
      expect(response.body.sos.username).toBe('testuser');
    });

    it('should return 404 if no active SOS exists', async () => {
      const response = await request(app)
        .get('/api/sos/active/nonexistent')
        .expect(404);

      expect(response.body.hasActiveSOS).toBe(false);
    });
  });

  describe('PATCH /api/sos/resolve/:sosId', () => {
    it('should resolve an active SOS alert', async () => {
      // Create test user and SOS
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123'
      });

      const sos = await SOS.create({
        username: 'testuser',
        fullname: 'Test User',
        userId: testUser._id,
        latitude: 14.5995,
        longitude: 120.9842,
        location: {
          type: 'Point',
          coordinates: [120.9842, 14.5995]
        },
        status: 'active'
      });

      const response = await request(app)
        .patch(`/api/sos/resolve/${sos._id}`)
        .expect(200);

      expect(response.body.message).toBe('SOS marked as resolved successfully');
      expect(response.body.sos.status).toBe('resolved');

      // Verify SOS is resolved in database
      const resolvedSOS = await SOS.findById(sos._id);
      expect(resolvedSOS.status).toBe('resolved');
      expect(resolvedSOS.resolvedAt).toBeDefined();
    });

    it('should return 400 if SOS is already resolved', async () => {
      // Create test user and resolved SOS
      const testUser = await User.create({
        fullname: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword123'
      });

      const sos = await SOS.create({
        username: 'testuser',
        fullname: 'Test User',
        userId: testUser._id,
        latitude: 14.5995,
        longitude: 120.9842,
        location: {
          type: 'Point',
          coordinates: [120.9842, 14.5995]
        },
        status: 'resolved',
        resolvedAt: new Date()
      });

      const response = await request(app)
        .patch(`/api/sos/resolve/${sos._id}`)
        .expect(400);

      expect(response.body.message).toContain('already resolved');
    });

    it('should return 400 if SOS ID is invalid', async () => {
      const response = await request(app)
        .patch('/api/sos/resolve/invalid-id')
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
    });
  });

  describe('GET /api/sos/all-active', () => {
    it('should return all active SOS alerts', async () => {
      // Create test users and SOS alerts
      const user1 = await User.create({
        fullname: 'User 1',
        email: 'user1@example.com',
        username: 'user1',
        password: 'password123'
      });

      const user2 = await User.create({
        fullname: 'User 2',
        email: 'user2@example.com',
        username: 'user2',
        password: 'password123'
      });

      await SOS.create({
        username: 'user1',
        fullname: 'User 1',
        userId: user1._id,
        latitude: 14.5995,
        longitude: 120.9842,
        location: { type: 'Point', coordinates: [120.9842, 14.5995] },
        status: 'active'
      });

      await SOS.create({
        username: 'user2',
        fullname: 'User 2',
        userId: user2._id,
        latitude: 14.6000,
        longitude: 120.9850,
        location: { type: 'Point', coordinates: [120.9850, 14.6000] },
        status: 'active'
      });

      const response = await request(app)
        .get('/api/sos/all-active')
        .expect(200);

      expect(response.body.count).toBe(2);
      expect(response.body.alerts).toHaveLength(2);
    });
  });
});

describe('Health Check Endpoints', () => {
  it('should return API status on /', async () => {
    const response = await request(app)
      .get('/')
      .expect(200);

    expect(response.body.status).toBe('OK');
    expect(response.body.message).toBe('ResQYou API is running');
  });

  it('should return health status on /health', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('timestamp');
  });
});
