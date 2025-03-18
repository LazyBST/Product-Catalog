const jwt = require('jsonwebtoken');

/**
 * Authentication middleware to validate JWT tokens
 * This middleware will check for a valid JWT token and extract user information
 */
const authMiddleware = (req, res, next) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      errMsg: 'No authentication token provided'
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Add user info to request object
    req.user = {
      userId: decoded.userId,
      companyId: decoded.companyId
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      errMsg: 'Invalid or expired token'
    });
  }
};

module.exports = authMiddleware; 