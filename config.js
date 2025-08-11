require('dotenv').config();

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'WORDPRESS_API_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Parse environment variables with defaults
const config = {
  // Telegram settings
  telegram: {
    token: process.env.BOT_TOKEN,
    adminUsers: process.env.ADMIN_USERS 
      ? process.env.ADMIN_USERS.split(',').map(Number) 
      : [],
    webAppUrl: process.env.WEB_APP_URL || ''
  },
  
  // WordPress settings
  wordpress: {
    apiUrl: process.env.WORDPRESS_API_URL,
    auth: process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APPLICATION_PASSWORD
      ? {
          username: process.env.WORDPRESS_USERNAME,
          password: process.env.WORDPRESS_APPLICATION_PASSWORD
        }
      : null
  },
  
  // Post settings
  posts: {
    checkInterval: parseInt(process.env.POST_CHECK_INTERVAL || '600000', 10), // 10 minutes
    defaultCategories: process.env.DEFAULT_CATEGORIES 
      ? process.env.DEFAULT_CATEGORIES.split(',').map(Number).filter(Boolean)
      : [],
    defaultTags: process.env.DEFAULT_TAGS 
      ? process.env.DEFAULT_TAGS.split(',').map(Number).filter(Boolean)
      : []
  },
  
  // Server settings
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
