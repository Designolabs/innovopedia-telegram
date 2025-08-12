require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const botService = require('./services/botService');
const config = require('./config');

// Initialize Express server
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoint to get posts
app.get('/posts', async (req, res) => {
  try {
    const wordpress = require('./services/wordpress');
    const posts = await wordpress.getRecentPosts();
    
    // Format posts for the frontend
    const formattedPosts = posts.map(post => ({
      id: post.id,
      title: post.title.rendered,
      excerpt: post.excerpt.rendered.replace(/<[^>]*>?/gm, ''), // Remove HTML tags
      content: post.content.rendered,
      url: post.link,
      date: post.date,
      image: post.jetpack_featured_media_url || 'https://via.placeholder.com/800x400?text=No+Image',
      categories: post.categories
    }));
    
    res.json(formattedPosts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Start server
const server = app.listen(config.server.port, () => {
  logger.info(`Server running on port ${config.server.port}`);
  
  try {
    // Log configuration for debugging
    logger.info('Bot configuration:', {
      telegram: {
        hasToken: !!config.telegram.token,
        adminUsers: config.telegram.adminUsers || [],
        webAppUrl: config.telegram.webAppUrl || 'Not set'
      },
      wordpress: {
        apiUrl: config.wordpress.apiUrl || 'Not set',
        hasAuth: !!config.wordpress.auth
      },
      server: {
        port: config.server.port,
        nodeEnv: config.server.nodeEnv
      }
    });
    
    // Initialize and start the bot service
    logger.info('Initializing bot service...');
    botService.initialize();
    logger.info('Bot service initialization completed');
    
    if (config.telegram.webAppUrl) {
      logger.info(`Web App URL: ${config.telegram.webAppUrl}`);
    }
  } catch (error) {
    logger.error('Failed to initialize bot service:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    process.exit(1);
  }
});

/**
 * Graceful shutdown handler
 */
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  try {
    // Stop the bot service
    await botService.shutdown();
    
    // Close the HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Log startup completion
logger.info('Application startup completed');