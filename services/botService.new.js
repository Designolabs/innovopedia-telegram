const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const preferences = require('./preferences');
const wordpress = require('./wordpress');
const logger = require('../utils/logger');
const { LocalSession } = require('telegraf-session-local');
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
  return text.replace(/[_*\[\]()~`>#+\-={}|.!\\]/g, '\\$&');
}

class BotService {
  constructor() {
    try {
      logger.info('Initializing BotService...');
      
      // Validate config
      if (!config.telegram || !config.telegram.token) {
        throw new Error('Missing Telegram bot token in config');
      }
      
      logger.debug('Creating Telegraf instance...');
      // Initialize bot
      this.bot = new Telegraf(config.telegram.token, {
        telegram: { webhookReply: false }
      });
      
      logger.debug('Initializing session middleware...');
      // Initialize session middleware
      this.session = new LocalSession({
        database: 'sessions.json',
        format: {
          serialize: (obj) => {
            try {
              return JSON.stringify(obj, null, 2);
            } catch (e) {
              logger.error('Error serializing session:', e);
              return '{}';
            }
          },
          deserialize: (str) => {
            try {
              return str ? JSON.parse(str) : {};
            } catch (e) {
              logger.error('Error deserializing session:', e);
              return {};
            }
          }
        },
        getSessionKey: (ctx) => {
          try {
            if (ctx && ctx.from && ctx.chat) {
              return `${ctx.from.id}:${ctx.chat.id}`;
            }
          } catch (e) {
            logger.error('Error generating session key:', e);
          }
          return null;
        }
      });
      
      // Apply session middleware
      this.bot.use(this.session.middleware());
      
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
      
    } catch (error) {
      logger.error('Error in BotService constructor:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  /**
   * Initialize the bot with all commands and handlers
   */
  async initialize() {
    try {
      logger.info('Initializing bot commands...');
      this.setupCommands();
      
      logger.info('Setting up action handlers...');
      this.setupActionHandlers();
      
      logger.info('Starting bot...');
      await this.bot.launch();
      logger.info('Bot started successfully');
      
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * Setup bot commands with error handling and logging
   */
  setupCommands() {
    // Add middleware to log all updates
    this.bot.use((ctx, next) => {
      logger.debug('Received update:', {
        updateId: ctx.update.update_id,
        messageId: ctx.message?.message_id,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id,
        updateType: ctx.updateType,
        messageText: ctx.message?.text,
        callbackQuery: ctx.callbackQuery?.data
      });
      return next();
    });

    // Helper function to wrap command handlers with error handling
    const commandWrapper = (handler, commandName) => {
      return async (ctx) => {
        try {
          logger.info(`Command received: /${commandName}`, { 
            from: ctx.from?.id, 
            chat: ctx.chat?.id,
            message: ctx.message?.text 
          });
          await handler.call(this, ctx);
        } catch (error) {
          logger.error(`Error in /${commandName} command:`, {
            error: error.message,
            stack: error.stack,
            update: JSON.stringify(ctx.update, null, 2)
          });
          
          try {
            await ctx.reply(`❌ An error occurred while processing your /${commandName} command. Please try again later.`);
          } catch (e) {
            logger.error('Failed to send error message to user:', e);
          }
        }
      };
    };

    // Register all commands with error handling
    const commands = [
      { name: 'start', handler: this.handleStart },
      { name: 'help', handler: this.handleHelp },
      { name: 'categories', handler: this.handleListCategories },
      { name: 'set_categories', handler: this.handleSetCategories },
      { name: 'tags', handler: this.handleListTags },
      { name: 'set_tags', handler: this.handleSetTags },
      { name: 'post_latest', handler: this.handlePostLatest },
      { name: 'post_specific', handler: this.handlePostSpecific },
      { name: 'preferences', handler: this.handlePreferences },
      { name: 'start_autopost', handler: this.handleStartAutoPost },
      { name: 'stop_autopost', handler: this.handleStopAutoPost },
      { name: 'search', handler: this.handleSearch },
      { name: 'stats', handler: this.handleStats }
    ];

    // Register each command
    commands.forEach(({ name, handler }) => {
      this.bot.command(name, commandWrapper(handler, name));
    });

    logger.info('Registered commands:', commands.map(cmd => `/${cmd.name}`).join(', '));
  }

  /**
   * Setup action handlers for inline buttons
   */
  setupActionHandlers() {
    // Add your action handlers here
  }

  /**
   * Setup error handling for the bot
   */
  setupErrorHandling() {
    this.bot.catch((error, ctx) => {
      logger.error('Bot error:', {
        error: error.message,
        stack: error.stack,
        update: ctx.update
      });
      
      try {
        ctx.reply('❌ An error occurred. Please try again later.');
      } catch (e) {
        logger.error('Failed to send error message:', e);
      }
    });
  }

  /**
   * Handle the /start command
   */
  async handleStart(ctx) {
    try {
      const welcomeMessage = `👋 Welcome to *${config.botName || 'Innovopedia Bot'}*!\n\n` +
        'I can help you stay updated with the latest content from Innovopedia.\n\n' +
        '*Available commands:*\n' +
        '• /start - Show this welcome message\n' +
        '• /help - Show help information\n' +
        '• /categories - List all available categories\n' +
        '• /tags - List all available tags\n' +
        '• /preferences - View and update your preferences\n' +
        '• /post_latest - Get the latest post\n' +
        '• /search [query] - Search for posts\n' +
        '• /stats - View bot statistics';
      
      // Send welcome message with keyboard
      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          ['📚 Categories', '🏷️ Tags'],
          ['⚙️ Preferences', 'ℹ️ Help']
        ]).resize()
      });
      
      logger.info('Sent welcome message', { 
        userId: ctx.from.id, 
        chatId: ctx.chat.id 
      });
      
    } catch (error) {
      logger.error('Error in handleStart:', {
        error: error.message,
        stack: error.stack,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        update: JSON.stringify(ctx.update, null, 2)
      });
      
      try {
        await ctx.reply(
          '❌ An error occurred while processing your request. ' +
          'The issue has been logged and will be investigated.\n\n' +
          'Please try again later or contact support if the problem persists.'
        );
      } catch (e) {
        logger.error('Failed to send error message:', e);
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

  // Add other handler methods here with proper JSDoc comments
  // ...

  /**
   * Helper to check if a user is an admin
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
