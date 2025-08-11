const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const postsRoutes = require('./routes/posts');
const usersRoutes = require('./routes/users');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/posts', postsRoutes);
app.use('/preferences', usersRoutes);

// Start server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;