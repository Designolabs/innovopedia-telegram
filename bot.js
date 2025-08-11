require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // Import axios

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

// WordPress API URL
const WORDPRESS_API_URL = 'https://innovopedia.com/wp-json/wp/v2';

// Target Telegram channel or group ID
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID; // Use environment variable for chat ID

// Store the ID of the last fetched post to avoid duplicates
let lastPostId = null;

// Flag to control automatic posting
let autoPostingEnabled = false;
let autoPostingInterval = null; // To store the interval timer

// Function to fetch latest posts from WordPress
async function fetchLatestPosts() {
  try {
    const params = {
        orderby: 'date',
        order: 'desc',
        per_page: 10 // Fetch a few latest posts
    };

    // Add categories parameter if preferredCategories are set
    if (preferredCategories.length > 0) {
      params.categories = preferredCategories.join(','); // Join categories with comma
    }

    // Add tags parameter if preferredTags are set
    if (preferredTags.length > 0) {
      params.tags = preferredTags.join(','); // Join tags with comma
    }

    const response = await axios.get(`${WORDPRESS_API_URL}/posts`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching posts from WordPress:', error);
    return [];
  }
}

// Function to send a post to Telegram
async function sendPostToTelegram(post) {
  try {
    const caption = `<b>${post.title.rendered}</b>\n\n${post.excerpt.rendered.replace(/<[^>]*>/g, '')}\n\n<a href="${post.link}">Read More</a>`;
    const imageUrl = post.featured_media_url || '';

    if (imageUrl) {
      await bot.telegram.sendPhoto(TARGET_CHAT_ID, imageUrl, {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Read More', url: post.link }
            ]
          ]
        }
      });
    } else {
      await bot.telegram.sendMessage(TARGET_CHAT_ID, caption, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Read More', url: post.link }
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error sending post to Telegram:', error);
  }
}

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

// Function to check for new posts and send them
async function checkForNewPosts() {
  if (!autoPostingEnabled) {
    return;
  }

  const posts = await fetchLatestPosts();

  if (posts.length > 0) {
    // Assuming posts are ordered by date descending, the first one is the latest
    const latestPost = posts[0];

    if (latestPost.id !== lastPostId) {
      await sendPostToTelegram(latestPost);
      lastPostId = latestPost.id;
    }
  }
}

// Admin commands
bot.command('start_autopost', (ctx) => {
  if (!autoPostingEnabled) {
    autoPostingEnabled = true;
    // Check for new posts every 10 minutes (adjust as needed)
    autoPostingInterval = setInterval(checkForNewPosts, 10 * 60 * 1000);
    ctx.reply('Automatic posting started.');
    checkForNewPosts(); // Check for new posts immediately on start
  } else {
    ctx.reply('Automatic posting is already enabled.');
  }
});

bot.command('stop_autopost', (ctx) => {
  if (autoPostingEnabled) {
    autoPostingEnabled = false;
    clearInterval(autoPostingInterval);
    ctx.reply('Automatic posting stopped.');
  } else {
    ctx.reply('Automatic posting is not currently enabled.');
  }
});

bot.command('set_filters', (ctx) => {
  ctx.reply('Category and tag filtering (coming soon)'); // Placeholder - implementation to follow
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
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  clearInterval(autoPostingInterval); // Clear interval on stop
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  clearInterval(autoPostingInterval); // Clear interval on stop
});