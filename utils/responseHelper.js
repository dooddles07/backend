const sendSuccess = (res, statusCode, message, data = {}) => {
  // Handle arrays properly by wrapping them in a data property
  if (Array.isArray(data)) {
    return res.status(statusCode).json({
      message,
      data
    });
  }

  // For objects, check if they should be wrapped in data property
  // If the object has common data fields, spread it directly
  // Otherwise wrap it in data property
  const hasDataFields = data && typeof data === 'object' && Object.keys(data).length > 0;

  if (hasDataFields) {
    // Check if this looks like a MongoDB document or has _id
    const isDocument = data._id || data.id || data.createdAt;

    if (isDocument) {
      // Spread document fields directly for backward compatibility
      return res.status(statusCode).json({
        message,
        ...data
      });
    } else {
      // Wrap plain objects in data property
      return res.status(statusCode).json({
        message,
        data
      });
    }
  }

  // For empty objects or no data
  return res.status(statusCode).json({
    message,
    ...data
  });
};

const sendError = (res, statusCode, message, additionalData = {}) => {
  return res.status(statusCode).json({
    message,
    ...additionalData
  });
};

const sendCreated = (res, message, data = {}) => {
  return sendSuccess(res, 201, message, data);
};

const sendOk = (res, message, data = {}) => {
  return sendSuccess(res, 200, message, data);
};

const sendBadRequest = (res, message) => {
  return sendError(res, 400, message);
};

const sendUnauthorized = (res, message) => {
  return sendError(res, 401, message);
};

const sendForbidden = (res, message) => {
  return sendError(res, 403, message);
};

const sendNotFound = (res, message) => {
  return sendError(res, 404, message);
};

const sendServerError = (res, message = 'Internal server error') => {
  return sendError(res, 500, message);
};

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendOk,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendServerError
};
