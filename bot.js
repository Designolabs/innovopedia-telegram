require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Preferred categories and tags for filtering
let preferredCategories = [];
let preferredTags = [];


// Import routes
const postsRoutes = require('./backend/routes/posts');
const usersRoutes = require('./backend/routes/users');

// Check for required environment variables
if (!process.env.BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not set in .env file');
  process.exit(1);
}

if (!process.env.WEB_APP_URL) {
  console.error('Error: WEB_APP_URL is not set in .env file');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Set up Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// API Routes
app.use('/posts', postsRoutes);
app.use('/preferences', usersRoutes);

// Bot commands
bot.command('start', (ctx) => {
  ctx.reply(
    'Welcome to Innovopedia! Explore innovative ideas and technologies.',
    Markup.keyboard([
      Markup.button.webApp('📖 Open App', process.env.WEB_APP_URL)
    ]).resize()
  );
});

bot.command('saved', (ctx) => {
  ctx.reply('Your saved articles (coming soon)');
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Web App URL: ${process.env.WEB_APP_URL}`);
});

// Start bot
bot.launch().then(() => {
  console.log('Bot started successfully!');
}).catch((err) => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));