const NodeCache = require('node-cache');
const config = require('../config');
const logger = require('../utils/logger');

// Cache with no expiration by default
const cache = new NodeCache({ stdTTL: 0 });

class PreferencesService {
  constructor() {
    this.defaultPreferences = {
      categories: [...config.posts.defaultCategories],
      tags: [...config.posts.defaultTags],
      autoPosting: false,
      lastPostId: null,
      lastCheck: null,
    };
  }

  /**
   * Get preferences for a chat
   * @param {string|number} chatId - Chat ID
   * @returns {Object} Chat preferences
   */
  getPreferences(chatId) {
    const chatIdStr = String(chatId);
    const cached = cache.get(chatIdStr);
    
    if (!cached) {
      // Initialize with default preferences
      const defaultPrefs = { ...this.defaultPreferences };
      cache.set(chatIdStr, defaultPrefs);
      return defaultPrefs;
    }
    
    return cached;
  }

  /**
   * Update preferences for a chat
   * @param {string|number} chatId - Chat ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated preferences
   */
  updatePreferences(chatId, updates) {
    const chatIdStr = String(chatId);
    const current = this.getPreferences(chatIdStr);
    const updated = { ...current, ...updates };
    
    cache.set(chatIdStr, updated);
    logger.debug(`Updated preferences for chat ${chatIdStr}`, { updates });
    
    return updated;
  }

  /**
   * Update categories for a chat
   * @param {string|number} chatId - Chat ID
   * @param {Array<number>} categories - Array of category IDs
   * @returns {Object} Updated preferences
   */
  updateCategories(chatId, categories) {
    return this.updatePreferences(chatId, { 
      categories: [...new Set(categories.map(Number).filter(Boolean))] 
    });
  }

  /**
   * Update tags for a chat
   * @param {string|number} chatId - Chat ID
   * @param {Array<number>} tags - Array of tag IDs
   * @returns {Object} Updated preferences
   */
  updateTags(chatId, tags) {
    return this.updatePreferences(chatId, { 
      tags: [...new Set(tags.map(Number).filter(Boolean))] 
    });
  }

  /**
   * Toggle auto-posting for a chat
   * @param {string|number} chatId - Chat ID
   * @param {boolean} [enabled] - Optional: set to true/false, or toggle if undefined
   * @returns {Object} Updated preferences
   */
  toggleAutoPosting(chatId, enabled = null) {
    const current = this.getPreferences(chatId);
    const newValue = enabled !== null ? enabled : !current.autoPosting;
    
    return this.updatePreferences(chatId, { 
      autoPosting: newValue,
      lastCheck: newValue ? new Date().toISOString() : current.lastCheck
    });
  }

  /**
   * Update the last post ID for a chat
   * @param {string|number} chatId - Chat ID
   * @param {number} postId - Last post ID
   * @returns {Object} Updated preferences
   */
  updateLastPostId(chatId, postId) {
    return this.updatePreferences(chatId, { 
      lastPostId: Number(postId),
      lastCheck: new Date().toISOString()
    });
  }

  /**
   * Get all active chat IDs with auto-posting enabled
   * @returns {Array<string>} Array of chat IDs
   */
  getActiveChats() {
    const allChats = cache.keys();
    return allChats.filter(chatId => {
      const prefs = this.getPreferences(chatId);
      return prefs.autoPosting;
    });
  }

  /**
   * Reset preferences for a chat to defaults
   * @param {string|number} chatId - Chat ID
   * @returns {Object} Default preferences
   */
  resetPreferences(chatId) {
    const chatIdStr = String(chatId);
    cache.del(chatIdStr);
    return this.getPreferences(chatIdStr);
  }
}

module.exports = new PreferencesService();
