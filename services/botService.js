const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const preferences = require('./preferences');
const wordpress = require('./wordpress');
const logger = require('../utils/logger');
const { Telegraf: TelegrafSession } = require('telegraf-session-local');

// Helper function to escape markdown special characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-={}|.!\\]/g, '\\$&');
}

class BotService {
  constructor() {
    this.bot = new Telegraf(config.telegram.token, {
      telegram: { webhookReply: false }
    });
    
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
    // Start command
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    
    // Admin commands
    this.bot.command('start_autopost', (ctx) => this.handleStartAutoPost(ctx));
    this.bot.command('stop_autopost', (ctx) => this.handleStopAutoPost(ctx));
    this.bot.command('set_categories', (ctx) => this.handleSetCategories(ctx));
    this.bot.command('set_tags', (ctx) => this.handleSetTags(ctx));
    this.bot.command('post_latest', (ctx) => this.handlePostLatest(ctx));
    this.bot.command('post_specific', (ctx) => this.handlePostSpecific(ctx));
    
    // Info commands
    this.bot.command('preferences', (ctx) => this.handlePreferences(ctx));
    this.bot.command('categories', (ctx) => this.handleListCategories(ctx));
    this.bot.command('tags', (ctx) => this.handleListTags(ctx));
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
  async handleStart(ctx) {
    const chatId = String(ctx.chat.id);
    const isAdmin = config.telegram.adminUsers.includes(Number(chatId));
    
    const welcomeMessage = `👋 *Welcome to Innovopedia Bot!*\n\n` +
      `I can automatically share the latest posts from Innovopedia to this chat.\n\n` +
      `*Available Commands:*\n` +
      `/help - Show this help message\n` +
      `/preferences - View current preferences\n` +
      `/categories - List available categories\n` +
      `/tags - List available tags\n`;
    
    const adminMessage = isAdmin ? 
      `\n*Admin Commands:*\n` +
      `/start_autopost - Start automatic posting\n` +
      `/stop_autopost - Stop automatic posting\n` +
      `/set_categories - Set categories to filter by\n` +
      `/set_tags - Set tags to filter by\n` +
      `/post_latest - Manually post the latest article\n` +
      `/post_specific - Post a specific article by ID\n` : '';
    
    await ctx.replyWithMarkdown(welcomeMessage + adminMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback('⚙️ Preferences', 'show_prefs'),
            Markup.button.url('🌐 Visit Innovopedia', 'https://innovopedia.com')
          ]
        ]
      }
    });
  }

  /**
   * Handle the /help command
   */
  async handleHelp(ctx) {
    await this.handleStart(ctx); // Reuse start handler for help
  }

  /**
   * Handle the /start_autopost command
   */
  async handleStartAutoPost(ctx) {
    const chatId = String(ctx.chat.id);
    
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }
    
    try {
      await this.startAutoPosting(chatId);
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
   * Show a selection menu for categories or tags
   */
  async showSelectionMenu(ctx, type, items) {
    try {
      const chatId = String(ctx.chat?.id || ctx.from?.id);
      const prefs = preferences.getPreferences(chatId);
      
      // Ensure session is properly initialized
      if (!ctx.session) {
        ctx.session = {};
      }
      
      // Initialize selected items array if not exists
      if (!ctx.session[`selected${this.capitalize(type)}`]) {
        ctx.session[`selected${this.capitalize(type)}`] = [];
      }
      
      // Update session with current preferences if needed
      if (Array.isArray(prefs[type])) {
        ctx.session[`selected${this.capitalize(type)}`] = [...prefs[type]];
      }
      
      // Create keyboard with items
      const keyboard = [];
      const chunkSize = 2;
      
      // Add category/tag selection buttons
      for (let i = 0; i < items.length; i += chunkSize) {
        const row = items
          .slice(i, i + chunkSize)
          .map(item => {
            const isSelected = ctx.session[`selected${this.capitalize(type)}`].includes(item.id);
            const buttonText = `${isSelected ? '✅' : '◻️'} ${item.name} (${item.count})`;
            return Markup.button.callback(buttonText, `toggle_${type}_${item.id}`);
          });
        keyboard.push(row);
      }
      
      // Add action buttons
      keyboard.push([
        Markup.button.callback('💾 Save', `save_${type}`),
        Markup.button.callback('❌ Cancel', `cancel_${type}`)
      ]);
      
      // Send or update the message
      const messageText = `Select ${type} to follow:\nClick the checkboxes to select/deselect.`;
      
      if (ctx.callbackQuery) {
        // Edit existing message
        await ctx.editMessageText(messageText, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'HTML'
        });
      } else {
        // Send new message
        await ctx.reply(messageText, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'HTML'
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
    await ctx.editMessageReplyMarkup({
      inline_keyboard: ctx.callbackQuery.message.reply_markup.inline_keyboard
        .map(row => row.map(button => {
          if (button.callback_data === `toggle_${type}_${id}`) {
            const isSelected = ctx.session[sessionKey].includes(id);
            return {
              ...button,
              text: button.text.replace(/^[^\w]\s*/, isSelected ? '✅ ' : '◻️ ')
            };
          }
          return button;
        }))
    });
    
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
