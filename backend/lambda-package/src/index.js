// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const apiRoutes = require('./routes');
const db = require('./db');
const awsServerlessExpress = require('aws-serverless-express');

const app = express();
const PORT = process.env.PORT || 5006;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api', apiRoutes);

// Test database connection
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    return res.json({
      success: true,
      data: {
        timestamp: result.rows[0].now,
        status: 'Database connected successfully'
      },
      errMsg: null
    });
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      errMsg: 'Database connection failed'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    errMsg: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    data: null,
    errMsg: err.message || 'Internal server error'
  });
});

// Start server if not in Lambda environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  
  // Handle graceful shutdown for local development
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    try {
      await db.pool.end();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error closing database connection:', error);
      process.exit(1);
    }
  });
}

// Create Lambda server and handler
const server = awsServerlessExpress.createServer(app);
exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context);

// Also export the app for imports
module.exports = app;