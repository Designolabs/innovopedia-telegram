const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class MetricsService {
  constructor() {
    this.metricsFile = path.join(__dirname, '../data/metrics.json');
    this.metrics = {
      totalUsers: 0,
      activeUsers: 0,
      totalPostsSent: 0,
      totalSearches: 0,
      totalScheduledPosts: 0,
      userEngagement: {},
      commandUsage: {},
      lastUpdated: new Date().toISOString()
    };
    this.initialize();
  }

  /**
   * Initialize the metrics service
   */
  async initialize() {
    try {
      await fs.mkdir(path.dirname(this.metricsFile), { recursive: true });
      await this.loadMetrics();
      logger.info('Metrics service initialized');
    } catch (error) {
      logger.error('Error initializing metrics service:', error);
      await this.saveMetrics(); // Save initial metrics
    }
  }

  /**
   * Load metrics from file
   */
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No metrics file found, using default metrics');
      } else {
        logger.error('Error loading metrics:', error);
      }
    }
  }

  /**
   * Save metrics to file
   */
  async saveMetrics() {
    try {
      this.metrics.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2), 'utf8');
    } catch (error) {
      logger.error('Error saving metrics:', error);
    }
  }

  /**
   * Track a new user
   * @param {string} userId - User ID
   */
  async trackNewUser(userId) {
    if (!this.metrics.userEngagement[userId]) {
      this.metrics.totalUsers++;
      this.metrics.activeUsers++;
      this.metrics.userEngagement[userId] = {
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        commandsUsed: 0,
        postsViewed: 0,
        searchesPerformed: 0
      };
      await this.saveMetrics();
    }
  }

  /**
   * Track user activity
   * @param {string} userId - User ID
   * @param {string} command - Command used
   */
  async trackCommand(userId, command) {
    await this.trackNewUser(userId);
    
    // Update user engagement
    const user = this.metrics.userEngagement[userId];
    user.lastSeen = new Date().toISOString();
    user.commandsUsed = (user.commandsUsed || 0) + 1;

    // Update command usage
    this.metrics.commandUsage[command] = (this.metrics.commandUsage[command] || 0) + 1;

    // Update specific metrics
    if (command === 'search') {
      user.searchesPerformed = (user.searchesPerformed || 0) + 1;
      this.metrics.totalSearches++;
    }

    await this.saveMetrics();
  }

  /**
   * Track post view
   * @param {string} userId - User ID
   * @param {string} postId - Post ID
   */
  async trackPostView(userId, postId) {
    await this.trackNewUser(userId);
    
    const user = this.metrics.userEngagement[userId];
    user.lastSeen = new Date().toISOString();
    user.postsViewed = (user.postsViewed || 0) + 1;
    
    if (!user.posts) user.posts = [];
    if (!user.posts.includes(postId)) {
      user.posts.push(postId);
    }
    
    this.metrics.totalPostsSent++;
    await this.saveMetrics();
  }

  /**
   * Track scheduled post
   */
  async trackScheduledPost() {
    this.metrics.totalScheduledPosts++;
    await this.saveMetrics();
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const activeUsers = Object.values(this.metrics.userEngagement).filter(
      user => new Date() - new Date(user.lastSeen) < 30 * 24 * 60 * 60 * 1000 // Active in last 30 days
    ).length;

    const mostUsedCommands = Object.entries(this.metrics.commandUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const mostActiveUsers = Object.entries(this.metrics.userEngagement)
      .map(([userId, data]) => ({
        userId,
        commandsUsed: data.commandsUsed || 0,
        lastSeen: data.lastSeen
      }))
      .sort((a, b) => b.commandsUsed - a.commandsUsed)
      .slice(0, 5);

    return {
      totalUsers: this.metrics.totalUsers,
      activeUsers,
      totalPostsSent: this.metrics.totalPostsSent,
      totalSearches: this.metrics.totalSearches,
      totalScheduledPosts: this.metrics.totalScheduledPosts,
      mostUsedCommands,
      mostActiveUsers,
      lastUpdated: this.metrics.lastUpdated
    };
  }
}

// Create a singleton instance
const metricsService = new MetricsService();

// Save metrics periodically (every 5 minutes)
setInterval(() => metricsService.saveMetrics(), 5 * 60 * 1000);

// Handle process termination
process.on('SIGINT', async () => {
  await metricsService.saveMetrics();
  process.exit(0);
});

module.exports = metricsService;
