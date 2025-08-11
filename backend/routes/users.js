<<<<<<< HEAD
const express = require('express');
const router = express.Router();

// In-memory storage for user preferences
// In a production app, this would be a database
const userPreferences = {};

// POST /preferences - Store user preferences
router.post('/', (req, res) => {
  const { userId, categories } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  
  userPreferences[userId] = {
    userId,
    categories: categories || [],
    updatedAt: new Date().toISOString()
  };
  
  res.status(201).json(userPreferences[userId]);
});

// GET /preferences/:userId - Get user preferences
router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (!userPreferences[userId]) {
    return res.status(404).json({ error: 'User preferences not found' });
  }
  
  res.json(userPreferences[userId]);
});

=======
const express = require('express');
const router = express.Router();

// In-memory storage for user preferences
// In a production app, this would be a database
const userPreferences = {};

// POST /preferences - Store user preferences
router.post('/', (req, res) => {
  const { userId, categories } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  
  userPreferences[userId] = {
    userId,
    categories: categories || [],
    updatedAt: new Date().toISOString()
  };
  
  res.status(201).json(userPreferences[userId]);
});

// GET /preferences/:userId - Get user preferences
router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (!userPreferences[userId]) {
    return res.status(404).json({ error: 'User preferences not found' });
  }
  
  res.json(userPreferences[userId]);
});

>>>>>>> fddee1d865d2a53238848734df53742a08d23ba5
module.exports = router;