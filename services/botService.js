const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const preferences = require('./preferences');
const wordpress = require('./wordpress');
const logger = require('../utils/logger');
const { Telegraf: TelegrafSession } = require('telegraf-session-local');
const SchedulerService = require('./schedulerService');
const metricsService = require('./metricsService');
const moment = require('moment-timezone');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiting: 5 messages per second
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 1,
});

// Helper function to escape markdown special characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-={}|.!\\]/g, '\\$&');
}

class BotService {
  constructor() {
    // Initialize bot first
    this.bot = new Telegraf(config.telegram.token, {
      telegram: { webhookReply: false }
    });
    
    // Now initialize scheduler with the bot instance
    this.scheduler = new SchedulerService(this.bot);
    
    // Initialize session middleware
    const session = new TelegrafSession({
      // Database name/path to load on start
      database: 'sessions.json',
      // Type of storage to use
      storage: TelegrafSession.storageFileAsync,
      // Format of storage/database (default: JSON.stringify / JSON.parse)
      format: {
        serialize: (obj) => JSON.stringify(obj, null, 2),
        deserialize: (str) => JSON.parse(str),
      },
      // Update session on every message
      getSessionKey: (ctx) => {
        if (ctx.from && ctx.chat) {
          return `${ctx.from.id}:${ctx.chat.id}`;
        }
        return null;
      },
    });
    
    this.bot.use(session.middleware());
    
    // Initialize default session values
    this.bot.use((ctx, next) => {
      if (!ctx.session) {
        ctx.session = {
          selectedCategories: [],
          selectedTags: []
        };
      }
      return next();
    });
    
    this.setupErrorHandling();
  }

  /**
   * Initialize the bot with all commands and handlers
   */
  initialize() {
    this.setupCommands();
    this.setupActionHandlers();
    this.setupErrorHandling();
    
    // Log bot start
    this.bot.launch().then(() => {
      logger.info('Bot started successfully');
      
      // Start auto-posting for active chats
      this.startAutoPostingForActiveChats();
    }).catch(error => {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    });
  }

  /**
   * Setup bot commands
   */
  setupCommands() {
    // Basic commands
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));
    
    // Category commands
    this.bot.command('categories', (ctx) => this.handleListCategories(ctx));
    this.bot.command('set_categories', (ctx) => this.handleSetCategories(ctx));
    
    // Tag commands
    this.bot.command('tags', (ctx) => this.handleListTags(ctx));
    this.bot.command('set_tags', (ctx) => this.handleSetTags(ctx));
    
    // Post commands
    this.bot.command('post_latest', (ctx) => this.handlePostLatest(ctx));
    this.bot.command('post_specific', (ctx) => this.handlePostSpecific(ctx));
    this.bot.command('schedule_post', (ctx) => this.handleSchedulePost(ctx));
    this.bot.command('scheduled_posts', (ctx) => this.handleListScheduledPosts(ctx));
    
    // Search command
    this.bot.command('search', (ctx) => this.handleSearch(ctx));
    
    // Stats command
    this.bot.command('stats', (ctx) => this.handleStats(ctx));
    
    // Admin commands
    this.bot.command('admin', (ctx) => this.handleAdminCommand(ctx));
    
    // Info commands
    this.bot.command('preferences', (ctx) => this.handlePreferences(ctx));
    
    // Auto-posting commands
    this.bot.command('start_autopost', (ctx) => this.handleStartAutoPost(ctx));
    this.bot.command('stop_autopost', (ctx) => this.handleStopAutoPost(ctx));
    
    this.bot.help((ctx) => this.handleHelp(ctx));
    
    // Handle any other commands
    this.bot.command(/(.+)/, (ctx) => {
      logger.warn(`Unknown command: ${ctx.match[1]}`);
      return ctx.reply("I don't recognize that command. Type /help to see available commands.");
    });
  }

  /**
   * Setup action handlers for inline buttons
   */
  setupActionHandlers() {
    // Toggle category selection
    this.bot.action(/^toggle_category_(\d+)$/, async (ctx) => {
      try {
        const categoryId = parseInt(ctx.match[1], 10);
        const chatId = String(ctx.chat?.id || ctx.from?.id);
        
        if (!ctx.session) {
          ctx.session = { selectedCategories: [] };
        }
        
        // Toggle category selection
        const index = ctx.session.selectedCategories.indexOf(categoryId);
        if (index === -1) {
          ctx.session.selectedCategories.push(categoryId);
        } else {
          ctx.session.selectedCategories.splice(index, 1);
        }
        
        // Update the message with new selection
        const categories = await wordpress.getCategories();
        await this.showSelectionMenu(ctx, 'categories', categories);
        
        // Acknowledge the button press
        await ctx.answerCbQuery();
      } catch (error) {
        logger.error('Error toggling category:', error);
        await ctx.answerCbQuery('❌ Error updating selection');
      }
    });
    
    // Save categories
    this.bot.action('save_categories', async (ctx) => {
      try {
        const chatId = String(ctx.chat?.id || ctx.from?.id);
        
        if (ctx.session?.selectedCategories) {
          // Update preferences
          preferences.updateCategories(chatId, ctx.session.selectedCategories);
          
          // Clean up session
          delete ctx.session.selectedCategories;
          
          // Update the message
          await ctx.editMessageText('✅ Categories updated successfully!');
          await ctx.answerCbQuery('Categories saved');
        } else {
          await ctx.answerCbQuery('No changes to save');
        }
      } catch (error) {
        logger.error('Error saving categories:', error);
        await ctx.answerCbQuery('❌ Error saving categories');
      }
    });
    
    // Cancel category selection
    this.bot.action('cancel_categories', async (ctx) => {
      try {
        // Clean up session
        if (ctx.session) {
          delete ctx.session.selectedCategories;
        }
        
        await ctx.deleteMessage();
        await ctx.answerCbQuery('Category selection cancelled');
      } catch (error) {
        logger.error('Error cancelling category selection:', error);
      }
    });
    
    // Toggle tag selection (placeholder for now)
    this.bot.action(/^toggle_tag_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery('Tag selection coming soon');
    });
    
    // Save tags (placeholder for now)
    this.bot.action('save_tags', async (ctx) => {
      await ctx.answerCbQuery('Tag management coming soon');
    });
    
    // Cancel tags (placeholder for now)
    this.bot.action('cancel_tags', async (ctx) => {
      if (ctx.session) {
        delete ctx.session.selectedTags;
      }
      await ctx.deleteMessage();
      await ctx.answerCbQuery('Tag selection cancelled');
    });
    
    // Like post
    this.bot.action(/^like_(\d+)$/, async (ctx) => {
      const postId = ctx.match[1];
      await ctx.answerCbQuery(`❤️ Liked post #${postId}`);
    });
  }

  /**
   * Setup error handling for the bot
   */
  setupErrorHandling() {
    // Handle errors
    this.bot.catch((error, ctx) => {
      logger.error('Bot error:', error);
      logger.error('Update that caused the error:', ctx.update);
      
      try {
        ctx.reply('❌ An error occurred. Please try again later.');
      } catch (e) {
        logger.error('Failed to send error message:', e);
      }
    });
    
    // Handle unhandled rejections
    process.on('unhandledRejection', (error) => {
      logger.error('Unhandled rejection:', error);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });
  }

  /**
   * Start auto-posting for all active chats
   */
  async startAutoPostingForActiveChats() {
    const activeChats = preferences.getActiveChats();
    
    for (const chatId of activeChats) {
      try {
        await this.startAutoPosting(chatId);
      } catch (error) {
        logger.error(`Failed to start auto-posting for chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Start auto-posting for a specific chat
   * @param {string|number} chatId - Chat ID to start auto-posting for
   */
  async startAutoPosting(chatId) {
    const chatIdStr = String(chatId);
    
    // Clear any existing interval for this chat
    if (this.intervals && this.intervals[chatIdStr]) {
      clearInterval(this.intervals[chatIdStr]);
    } else if (!this.intervals) {
      this.intervals = {};
    }
    
    // Update preferences
    preferences.toggleAutoPosting(chatIdStr, true);
    
    // Initial check for new posts
    await this.checkForNewPosts(chatIdStr);
    
    // Set up interval for checking new posts
    this.intervals[chatIdStr] = setInterval(
      () => this.checkForNewPosts(chatIdStr),
      config.posts.checkInterval
    );
    
    logger.info(`Started auto-posting for chat ${chatIdStr}`);
  }

  /**
   * Stop auto-posting for a specific chat
   * @param {string|number} chatId - Chat ID to stop auto-posting for
   */
  stopAutoPosting(chatId) {
    const chatIdStr = String(chatId);
    
    // Clear the interval if it exists
    if (this.intervals && this.intervals[chatIdStr]) {
      clearInterval(this.intervals[chatIdStr]);
      delete this.intervals[chatIdStr];
      
      // Update preferences
      preferences.toggleAutoPosting(chatIdStr, false);
      
      logger.info(`Stopped auto-posting for chat ${chatIdStr}`);
      return true;
    }
    
    return false;
  }

  /**
   * Check for new posts and send them to a specific chat
   * @param {string|number} chatId - Chat ID to check and send posts for
   */
  async checkForNewPosts(chatId) {
    const chatIdStr = String(chatId);
    const prefs = preferences.getPreferences(chatIdStr);
    
    try {
      logger.debug(`Checking for new posts for chat ${chatIdStr}`, {
        categories: prefs.categories,
        tags: prefs.tags
      });
      
      // Get new posts since last check
      const posts = await wordpress.getPosts({
        categories: prefs.categories,
        tags: prefs.tags,
        after: prefs.lastCheck,
        perPage: 10
      });
      
      // Send new posts (oldest first)
      for (const post of posts) {
        if (prefs.lastPostId && post.id <= prefs.lastPostId) {
          continue; // Skip already sent posts
        }
        
        await this.sendPost(chatIdStr, post);
        
        // Update last post ID
        preferences.updateLastPostId(chatIdStr, post.id);
        
        // Small delay between posts to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Update last check time
      preferences.updatePreferences(chatIdStr, {
        lastCheck: new Date().toISOString()
      });
      
      logger.info(`Checked for new posts for chat ${chatIdStr} - found ${posts.length} new posts`);
    } catch (error) {
      logger.error(`Error checking for new posts for chat ${chatIdStr}:`, error);
    }
  }

  /**
   * Format a post for Telegram
   * @param {Object} post - Post data from WordPress
   * @returns {Object} Formatted post with text and options
   */
  formatPost(post) {
    // Clean excerpt text
    const excerpt = post.excerpt
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Truncate excerpt if too long
    const maxLength = 1000; // Telegram's max message length is 4096, leaving room for title and buttons
    const truncatedExcerpt = excerpt.length > maxLength 
      ? `${excerpt.substring(0, maxLength - 3)}...` 
      : excerpt;
    
    // Create inline keyboard with buttons
    const keyboard = [
      [
        Markup.button.url('📖 Read Full Article', post.link),
        Markup.button.callback('👍 Like', `like_${post.id}`)
      ]
    ];
    
    // Add category/tag buttons if available
    if (post.categories.length > 0 || post.tags.length > 0) {
      const buttons = [];
      
      if (post.categories.length > 0) {
        buttons.push(Markup.button.callback(
          `🏷️ ${post.categories.length} Categories`,
          `show_categories_${post.id}`
        ));
      }
      
      if (post.tags.length > 0) {
        buttons.push(Markup.button.callback(
          `🔖 ${post.tags.length} Tags`,
          `show_tags_${post.id}`
        ));
      }
      
      keyboard.push(buttons);
    }
    
    // Format the message text
    const text = `*${post.title}*\n\n${truncatedExcerpt}\n\n[Read more](${post.link})`;
    
    return {
      text,
      options: {
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    };
  }

  /**
   * Send a post to a chat
   * @param {string|number} chatId - Chat ID to send the post to
   * @param {Object} post - Post data from WordPress
   * @returns {Promise<Object>} Sent message data
   */
  async sendPost(chatId, post) {
    const { text, options } = this.formatPost(post);
    
    try {
      if (post.featuredImage) {
        // Send photo with caption
        return await this.bot.telegram.sendPhoto(chatId, post.featuredImage, {
          caption: text,
          ...options,
          parse_mode: 'HTML'
        });
      } else {
        // Send text message
        return await this.bot.telegram.sendMessage(chatId, text, options);
      }
    } catch (error) {
      logger.error(`Error sending post ${post.id} to chat ${chatId}:`, error);
      
      // Fallback: try sending just the text if sending with image failed
      if (post.featuredImage) {
        try {
          return await this.bot.telegram.sendMessage(chatId, text, {
            ...options,
            parse_mode: 'HTML'
          });
        } catch (fallbackError) {
          logger.error(`Fallback error sending post ${post.id} to chat ${chatId}:`, fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Handle the /start command
   */

/**
 * Handle the /start command
 */
async handleStart(ctx) {
  try {
    // Apply rate limiting
    await rateLimiter.consume(`user_${ctx.from.id}`);

    // Track user engagement
    await metricsService.trackNewUser(String(ctx.from.id));
    await metricsService.trackCommand(String(ctx.from.id), 'start');

    const isAdminUser = this.isAdmin(ctx);
    const welcomeMessage = `👋 Welcome to the ${config.bot.name}!\n\nI can help you stay updated with the latest content from ${config.wordpress.siteName}.\n\nUse /help to see available commands.`;

    const adminMessage = isAdminUser ? `

📋 *Admin Commands*:
/start_autopost - Start auto-posting new content
/stop_autopost - Stop auto-posting
/set_categories - Set categories to filter by
/set_tags - Set tags to filter by
/post_latest - Manually post the latest article
/post_specific - Post a specific article by ID
/schedule_post - Schedule a post for later
/scheduled_posts - View scheduled posts
/search - Search for posts
/stats - View bot statistics` : '';
      
      await ctx.replyWithMarkdown(welcomeMessage + adminMessage, {
        reply_markup: {
          remove_keyboard: true
        }
      });
    } catch (err) {
      if (err instanceof Error) {
        logger.error('Error in handleStart:', err);
      }
      // Rate limit exceeded
      if (err.remainingPoints === 0) {
        await ctx.reply('⚠️ Too many requests. Please try again later.');
      }
    }
  }

  /**
   * Handle the /help command
   */
  async handleHelp(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      await metricsService.trackCommand(String(ctx.from.id), 'help');
      await this.handleStart(ctx); // Reuse start handler for help
    } catch (err) {
      if (err.remainingPoints === 0) {
        await ctx.reply('⚠️ Too many requests. Please try again later.');
      } else {
        logger.error('Error in handleHelp:', err);
        await ctx.reply('❌ An error occurred while processing your request.');
      }
    }
  }
  
  /**
   * Handle the /stats command
   * Shows bot usage statistics
   */
  async handleStats(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      
      if (!this.isAdmin(ctx)) {
        return ctx.reply('❌ You do not have permission to view statistics.');
      }
      
      // Track command usage
      await metricsService.trackCommand(String(ctx.from.id), 'stats');
      
      // Get metrics summary
      const stats = metricsService.getSummary();
      const lastUpdated = moment(stats.lastUpdated).fromNow();
      
      // Format top commands
      let topCommands = 'No command data available';
      if (stats.mostUsedCommands && stats.mostUsedCommands.length > 0) {
        topCommands = stats.mostUsedCommands
          .map(([cmd, count]) => `• /${cmd}: ${count} uses`)
          .join('\n');
      }
      
      // Format top users
      let topUsers = 'No user data available';
      if (stats.mostActiveUsers && stats.mostActiveUsers.length > 0) {
        topUsers = stats.mostActiveUsers
          .map((user, index) => {
            const lastSeen = moment(user.lastSeen).fromNow();
            return `${index + 1}. User ${user.userId}: ${user.commandsUsed} commands (last seen ${lastSeen})`;
          })
          .join('\n');
      }
      
      // Create the stats message
      const message = `📊 *Bot Statistics*\n\n` +
        `👥 *Users*\n` +
        `• Total: ${stats.totalUsers}\n` +
        `• Active (30d): ${stats.activeUsers}\n\n` +
        `📝 *Content*\n` +
        `• Posts sent: ${stats.totalPostsSent}\n` +
        `• Searches performed: ${stats.totalSearches}\n` +
        `• Posts scheduled: ${stats.totalScheduledPosts}\n\n` +
        `🔝 *Top Commands*\n${topCommands}\n\n` +
        `🏆 *Top Users*\n${topUsers}\n\n` +
        `_Last updated: ${lastUpdated}_`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Error in handleStats:', error);
      await ctx.reply('❌ An error occurred while fetching statistics. Please try again later.');
    }
  }

  /**
   * Handle the /start_autopost command
   */
  /**
   * Handle the /schedule_post command
   * Format: /schedule_post [post_id] [time]
   * Example: /schedule_post 123 in 2 hours
   * Example: /schedule_post 123 2023-12-31 18:30
   */
  async handleSchedulePost(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      
      // Track schedule command
      await metricsService.trackCommand(String(ctx.from.id), 'schedule_post');
      
      if (!this.isAdmin(ctx)) {
        return ctx.reply('❌ You do not have permission to use this command.');
      }
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) {
        return ctx.reply(
          '❌ Please provide a post ID and schedule time.\n' +
          'Example: `/schedule_post 123 in 2 hours`\n' +
          'Or: `/schedule_post 123 2023-12-31 18:30`',
          { parse_mode: 'Markdown' }
        );
      }
      
      const postId = parseInt(args[0], 10);
      if (isNaN(postId)) {
        return ctx.reply('❌ Invalid post ID. Please provide a valid numeric ID.');
      }
      
      const timeArg = args.slice(1).join(' ');
      
      // Get the post from WordPress
      const post = await wordpress.getPost(postId);
      if (!post) {
        return ctx.reply('❌ Post not found. Please check the post ID and try again.');
      }
      
      // Schedule the post
      const result = await this.scheduler.schedulePost(
        String(ctx.chat.id),
        post,
        timeArg
      );
      
      if (result.success) {
        const formattedTime = moment(result.scheduledTime).format('YYYY-MM-DD HH:mm:ss');
        await ctx.reply(
          `✅ Post scheduled successfully!\n` +
          `📝 *${post.title?.rendered || 'Untitled Post'}*\n` +
          `⏰ *When:* ${formattedTime}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`❌ Failed to schedule post: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      logger.error('Error in handleSchedulePost:', error);
      await ctx.reply('❌ An error occurred while scheduling the post. Please try again later.');
    }
  }
  
  /**
   * Handle the /scheduled_posts command
   * Lists all scheduled posts for the current chat
   */
  async handleListScheduledPosts(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      
      // Track command usage
      await metricsService.trackCommand(String(ctx.from.id), 'scheduled_posts');
      
      if (!this.isAdmin(ctx)) {
        return ctx.reply('❌ You do not have permission to use this command.');
      }
      
      const scheduledPosts = this.scheduler.listScheduledPosts(String(ctx.chat.id));
      
      if (scheduledPosts.length === 0) {
        return ctx.reply('📭 No scheduled posts found.');
      }
      
      let message = '📅 *Scheduled Posts*\n\n';
      
      scheduledPosts.forEach((post, index) => {
        const time = moment(post.scheduledTime).format('YYYY-MM-DD HH:mm');
        message += `${index + 1}. *${post.postTitle}*\n`;
        message += `   🕒 ${time} (${moment(post.scheduledTime).fromNow()})\n`;
        message += `   ID: \`${post.jobId}\`\n\n`;
      });
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔄 Refresh',
                callback_data: 'refresh_scheduled_posts'
              },
              {
                text: '❌ Clear All',
                callback_data: 'clear_scheduled_posts'
              }
            ]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in handleListScheduledPosts:', error);
      await ctx.reply('❌ An error occurred while fetching scheduled posts.');
    }
  }
  
  /**
   * Handle the /search command
   * Format: /search [query]
   * Example: /search blockchain technology
   */
  async handleSearch(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      
      // Track search command
      await metricsService.trackCommand(String(ctx.from.id), 'search');
      
      const query = ctx.message.text.split(' ').slice(1).join(' ');
      if (!query) {
        return ctx.reply(
          '🔍 Please provide a search query.\n' +
          'Example: `/search blockchain technology`',
          { parse_mode: 'Markdown' }
        );
      }
      
      // Show typing indicator
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
      
      // Search for posts
      const searchResults = await wordpress.searchPosts(query, { per_page: 5 });
      
      if (!searchResults || searchResults.length === 0) {
        return ctx.reply('🔍 No posts found matching your search.');
      }
      
      let message = `🔍 *Search Results for "${query}"*\n\n`;
      
      searchResults.forEach((post, index) => {
        const title = post.title?.rendered || 'Untitled Post';
        const excerpt = post.excerpt?.rendered 
          ? post.excerpt.rendered.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...'
          : 'No description available';
          
        message += `*${index + 1}. ${title}*\n`;
        message += `${excerpt}\n`;
        message += `📅 ${moment(post.date).format('MMM D, YYYY')} | `;
        message += `🔗 [Read More](${post.link})\n\n`;
      });
      
      message += `_Showing ${searchResults.length} of ${searchResults.length} results_`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📚 View All Results',
                url: `${config.wordpress.url}/?s=${encodeURIComponent(query)}`
              }
            ]
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error in handleSearch:', error);
      await ctx.reply('❌ An error occurred while searching. Please try again later.');
    }
  }
  
  /**
   * Handle the /start_autopost command
   */
  async handleStartAutoPost(ctx) {
    try {
      await rateLimiter.consume(`user_${ctx.from.id}`);
      
      if (!this.isAdmin(ctx)) {
        return ctx.reply('❌ You do not have permission to use this command.');
      }
      
      await this.startAutoPosting(String(ctx.chat.id));
      await ctx.reply('✅ Automatic posting has been started!');
    } catch (error) {
      logger.error('Error starting auto-post:', error);
      await ctx.reply('❌ Failed to start automatic posting. Please try again later.');
    }
  }

  /**
   * Handle the /stop_autopost command
   */
  async handleStopAutoPost(ctx) {
    const chatId = String(ctx.chat.id);
    
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    const stopped = this.stopAutoPosting(chatId);
    
    if (stopped) {
      await ctx.reply('🛑 Automatic posting has been stopped.');
    } else {
      await ctx.reply('ℹ️ Automatic posting is not currently active.');
    }
  }

  /**
   * Handle the /set_categories command
   */
  async handleSetCategories(ctx) {
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    try {
      const categories = await wordpress.getCategories();
      await this.showSelectionMenu(ctx, 'categories', categories);
    } catch (error) {
      logger.error('Error fetching categories:', error);
      await ctx.reply('❌ Failed to fetch categories. Please try again later.');
    }
  }

  /**
   * Handle the /set_tags command
   */
  async handleSetTags(ctx) {
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    try {
      const tags = await wordpress.getTags();
      await this.showSelectionMenu(ctx, 'tags', tags);
    } catch (error) {
      logger.error('Error fetching tags:', error);
      await ctx.reply('❌ Failed to fetch tags. Please try again later.');
    }
  }

  /**
        });
      }
      
      // Acknowledge the callback query if this was triggered by a button press
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }
      
    } catch (error) {
      logger.error(`Error in showSelectionMenu (${type}):`, error);
    }
    
    // Toggle selection
    const index = ctx.session[sessionKey].indexOf(id);
    if (index === -1) {
      ctx.session[sessionKey].push(id);
    } else {
      ctx.session[sessionKey].splice(index, 1);
    }
    
    // Update the message with new selection
    const isSelected = ctx.session[sessionKey].includes(id);
    const newText = isSelected ? 'X' : ' ';
    
    // Create a deep copy of the keyboard to avoid modifying the original
    const updatedKeyboard = JSON.parse(JSON.stringify(
      ctx.callbackQuery.message.reply_markup.inline_keyboard
    ));
    
    // Find and update the button
    for (const row of updatedKeyboard) {
      for (const button of row) {
        if (button.callback_data === `toggle_${type}_${id}`) {
          // Update the button text
          button.text = button.text.replace(/^\[.\]/s, `[${newText}]`);
          break;
        }
      }
    }
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: updatedKeyboard });
    
    // Acknowledge the button press
    await ctx.answerCbQuery();
  }

  /**
   * Handle save selection of categories/tags
   */
  async handleSaveSelection(ctx, type) {
    const chatId = String(ctx.chat.id);
    const sessionKey = `selected${this.capitalize(type)}`;
    
    if (!Array.isArray(ctx.session[sessionKey])) {
      await ctx.answerCbQuery('No changes to save');
      return;
    }
    
    // Update preferences
    if (type === 'categories') {
      preferences.updateCategories(chatId, ctx.session[sessionKey]);
    } else {
      preferences.updateTags(chatId, ctx.session[sessionKey]);
    }
    
    // Clear session
    delete ctx.session[sessionKey];
    
    // Update message
    await ctx.editMessageText(`✅ ${this.capitalize(type)} updated successfully!`);
    await ctx.answerCqQuery();
  }

  /**
   * Handle the /post_latest command
   */
  async handlePostLatest(ctx) {
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    const chatId = String(ctx.chat.id);
    const prefs = preferences.getPreferences(chatId);
    
    const loadingMsg = await ctx.reply('⏳ Fetching the latest article...');
    
    try {
      const posts = await wordpress.getPosts({
        categories: prefs.categories,
        tags: prefs.tags,
        perPage: 1
      });
      
      if (posts.length > 0) {
        await this.sendPost(chatId, posts[0]);
        
        // Update last post ID
        preferences.updateLastPostId(chatId, posts[0].id);
        
        // Delete loading message
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      } else {
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          null,
          'No articles found matching your criteria.'
        );
      }
    } catch (error) {
      logger.error('Error posting latest article:', error);
      await ctx.telegram.editMessageText(
        chatId,
        loadingMsg.message_id,
        null,
        '❌ Failed to fetch the latest article. Please try again later.'
      );
    }
  }

  /**
   * Handle the /post_specific command
   */
  async handlePostSpecific(ctx) {
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    const postId = ctx.message.text.split(' ')[1];
    if (!postId || isNaN(postId)) {
      return ctx.reply('Please provide a valid post ID. Example: /post_specific 123');
    }
    
    const chatId = String(ctx.chat.id);
    const loadingMsg = await ctx.reply(`⏳ Fetching article #${postId}...`);
    
    try {
      const post = await wordpress.getPostById(parseInt(postId, 10));
      await this.sendPost(chatId, post);
      
      // Update last post ID
      preferences.updateLastPostId(chatId, post.id);
      
      // Delete loading message
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (error) {
      logger.error(`Error posting article #${postId}:`, error);
      await ctx.telegram.editMessageText(
        chatId,
        loadingMsg.message_id,
        null,
        `❌ Failed to fetch article #${postId}. It may not exist or there was an error.`
      );
    }
  }

  /**
   * Handle the /preferences command
   */
  async handlePreferences(ctx) {
    const chatId = String(ctx.chat.id);
    const prefs = preferences.getPreferences(chatId);
    const isAdminUser = this.isAdmin(ctx);
    
    let message = `⚙️ *Current Preferences*\n\n`;
    
    if (isAdminUser) {
      message += `*Auto-posting:* ${prefs.autoPosting ? '✅ Enabled' : '❌ Disabled'}\n`;
    }
    
    message += `*Categories:* ${prefs.categories.length ? prefs.categories.join(', ') : 'All'}\n`;
    message += `*Tags:* ${prefs.tags.length ? prefs.tags.join(', ') : 'All'}\n\n`;
    
    if (isAdminUser) {
      message += `*Admin Commands:*\n`;
      message += `• Use /set_categories to change categories\n`;
      message += `• Use /set_tags to change tags\n`;
      message += `• Use /start_autopost or /stop_autopost to control auto-posting\n`;
      message += `• Use /post_latest to manually post the latest article`;
    }
    
    await ctx.replyWithMarkdown(message);
  }

  /**
   * Handle the /categories command
   */
  async handleListCategories(ctx) {
    try {
      const categories = await wordpress.getCategories();
      const prefs = preferences.getPreferences(String(ctx.chat.id));
      
      // Build the message parts with HTML formatting
      let message = '<b>📚 Available Categories</b>\n\n';
      
      categories.forEach(cat => {
        const isSelected = prefs.categories.includes(cat.id);
        message += `${isSelected ? '✅' : '◻️'} <b>${this.escapeHtml(cat.name)}</b> (${cat.count} posts)\n`;
      });
      
      message += '\nTo change categories, use /set_categories';
      
      // Send with HTML parsing
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error fetching categories:', error);
      await ctx.reply('❌ Failed to fetch categories. Please try again later.');
    }
  }

  /**
   * Helper to escape HTML special characters
   */
  escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Handle the /tags command
   */
  async handleListTags(ctx) {
    try {
      const tags = await wordpress.getTags();
      const prefs = preferences.getPreferences(String(ctx.chat.id));
      
      let message = '🏷️ *Available Tags*\n\n';
      
      tags.forEach(tag => {
        const isSelected = prefs.tags.includes(tag.id);
        message += `${isSelected ? '✅' : '◻️'} *${tag.name}* (${tag.count} posts)\n`;
      });
      
      message += '\nTo change tags, use /set_tags';
      
      await ctx.replyWithMarkdown(message);
    } catch (error) {
      logger.error('Error fetching tags:', error);
      await ctx.reply('❌ Failed to fetch tags. Please try again later.');
    }
  }

  /**
   * Check if a user is an admin
   */
  isAdmin(ctx) {
    const userId = ctx.from?.id;
    return userId && config.telegram.adminUsers.includes(Number(userId));
  }

  /**
   * Helper to capitalize the first letter of a string
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = new BotService();
