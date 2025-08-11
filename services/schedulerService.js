const { Telegraf } = require('telegraf');
const nodeSchedule = require('node-schedule');
const logger = require('../utils/logger');
const wordpress = require('./wordpress');
const moment = require('moment-timezone');

class SchedulerService {
  constructor(bot) {
    this.bot = bot;
    this.jobs = new Map();
    this.initialize();
  }

  /**
   * Initialize the scheduler service
   */
  initialize() {
    // Load any persisted jobs from storage if needed
    logger.info('Scheduler service initialized');
  }

  /**
   * Schedule a post to be sent at a specific time
   * @param {string} chatId - Chat ID to send the post to
   * @param {Object} post - Post data to send
   * @param {Date|string} scheduleTime - When to send the post (Date object or parseable date string)
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.notify=true] - Whether to send a notification when scheduled
   * @returns {Object} Job information
   */
  async schedulePost(chatId, post, scheduleTime, options = {}) {
    const { notify = true } = options;
    
    try {
      // Parse schedule time if it's a string
      const scheduledTime = typeof scheduleTime === 'string' 
        ? this.parseScheduleTime(scheduleTime, chatId)
        : scheduleTime;

      if (!(scheduledTime instanceof Date) || isNaN(scheduledTime.getTime())) {
        throw new Error('Invalid schedule time');
      }

      const jobId = `post_${post.id}_${chatId}_${Date.now()}`;
      const job = nodeSchedule.scheduleJob(jobId, scheduledTime, async () => {
        try {
          await this.sendPost(chatId, post);
          this.jobs.delete(jobId);
        } catch (error) {
          logger.error(`Error in scheduled job ${jobId}:`, error);
          // Reschedule for 5 minutes later on error
          this.schedulePost(chatId, post, new Date(Date.now() + 5 * 60 * 1000), { notify: false });
        }
      });

      if (job) {
        this.jobs.set(jobId, {
          job,
          chatId,
          postId: post.id,
          postTitle: post.title?.rendered || 'Untitled Post',
          scheduledTime: job.nextInvocation()
        });

        if (notify) {
          await this.notifyScheduled(chatId, post, job.nextInvocation());
        }

        return { 
          success: true, 
          jobId, 
          scheduledTime: job.nextInvocation(),
          message: `✅ Post scheduled for ${job.nextInvocation().toLocaleString()}`
        };
      }
      
      return { 
        success: false, 
        error: 'Failed to schedule job' 
      };
      
    } catch (error) {
      logger.error('Error in schedulePost:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a scheduled post
   * @param {string} jobId - The ID of the job to cancel
   * @returns {Object} Result of the operation
   */
  cancelScheduledPost(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      if (job.job) {
        job.job.cancel();
      }
      this.jobs.delete(jobId);
      return { 
        success: true, 
        message: `✅ Scheduled post "${job.postTitle}" has been cancelled.`
      };
    }
    return { 
      success: false, 
      error: 'Job not found or already executed' 
    };
  }

  /**
   * List all scheduled posts for a chat
   * @param {string} chatId - Chat ID to list scheduled posts for
   * @returns {Array} Array of scheduled posts
   */
  listScheduledPosts(chatId) {
    return Array.from(this.jobs.entries())
      .filter(([_, job]) => job.chatId === chatId)
      .filter(([jobId]) => jobId.endsWith(`_${chatId}`))
      .map(([jobId, job]) => ({
        jobId,
        postId: jobId.split('_')[1],
        scheduledTime: job.nextInvocation()
      }));
  }

  /**
   * Format a post message for Telegram
   * @private
   */
  formatPostMessage(post) {
    const title = post.title?.rendered || 'New Post';
    const excerpt = post.excerpt?.rendered 
      ? post.excerpt.rendered.replace(/<[^>]*>?/gm, '').trim() 
      : 'No excerpt available';
    
    return `<b>${this.escapeHtml(title)}</b>\n\n${this.escapeHtml(excerpt)}\n\n<a href="${post.link}">Read more →</a>`;
  }

  /**
   * Helper to escape HTML special characters
   * @private
   */
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = SchedulerService;
