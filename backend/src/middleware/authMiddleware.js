const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token and extract user information
 */
const authenticateToken = (req, res, next) => {
  // Get authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
  
  if (!token) {
    return res.status(401).json({
      success: false,
      errMsg: 'Unauthorized: No token provided'
    });
  }

  try {
    // Get JWT secret from environment variable with fallback
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET not found in environment variables');
      return res.status(500).json({
        success: false,
        errMsg: 'Server configuration error'
      });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, jwtSecret);
    
    // Add user info to request object
    req.user = {
      userId: decoded.userId,
      companyId: decoded.companyId
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        errMsg: 'Unauthorized: Token expired'
      });
    }
    
    return res.status(403).json({
      success: false,
      errMsg: 'Forbidden: Invalid token'
    });
  }
};

module.exports = {
  authenticateToken
}; 