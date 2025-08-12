const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class WordPressService {
  constructor() {
    this.api = axios.create({
      baseURL: config.wordpress.apiUrl,
      ...(config.wordpress.auth && { 
        auth: config.wordpress.auth 
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 10000, // 10 seconds
    });
  }

  /**
   * Fetch latest posts with optional filtering
   * @param {Object} options - Filtering options
   * @param {Array} [options.categories] - Array of category IDs
   * @param {Array} [options.tags] - Array of tag IDs
   * @param {number} [options.perPage=5] - Number of posts to fetch
   * @param {string} [options.after] - ISO date string to get posts after this date
   * @returns {Promise<Array>} - Array of posts
   */
  async getPosts({ categories = [], tags = [], perPage = 5, after } = {}) {
    try {
      const params = {
        _fields: [
          'id',
          'title',
          'excerpt',
          'link',
          'date',
          'modified',
          'slug',
          'categories',
          'tags',
          'featured_media',
          '_links.wp:featuredmedia',
        ].join(','),
        _embed: 'wp:featuredmedia',
        per_page: perPage,
        orderby: 'date',
        order: 'desc',
      };

      if (categories.length > 0) {
        params.categories = categories.join(',');
      }

      if (tags.length > 0) {
        params.tags = tags.join(',');
      }

      if (after) {
        params.after = after;
      }

      const response = await this.api.get('/posts', { params });
      return this._formatPosts(response.data);
    } catch (error) {
      logger.error('Error fetching posts from WordPress:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error('Failed to fetch posts from WordPress');
    }
  }

  /**
   * Get a single post by ID
   * @param {number} id - Post ID
   * @returns {Promise<Object>} - Post data
   */
  async getPostById(id) {
    try {
      const response = await this.api.get(`/posts/${id}`, {
        params: {
          _embed: 'wp:featuredmedia',
        },
      });
      return this._formatPost(response.data);
    } catch (error) {
      logger.error(`Error fetching post ${id} from WordPress:`, error.message);
      throw new Error(`Post with ID ${id} not found`);
    }
  }

  /**
   * Get all categories
   * @returns {Promise<Array>} - Array of categories
   */
  async getCategories() {
    try {
      const response = await this.api.get('/categories', {
        params: {
          per_page: 100,
          orderby: 'count',
          order: 'desc',
          hide_empty: true,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching categories from WordPress:', error.message);
      throw new Error('Failed to fetch categories');
    }
  }

  /**
   * Get all tags
   * @returns {Promise<Array>} - Array of tags
   */
  async getTags() {
    try {
      const response = await this.api.get('/tags', {
        params: {
          per_page: 100,
          orderby: 'count',
          order: 'desc',
          hide_empty: true,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching tags from WordPress:', error.message);
      throw new Error('Failed to fetch tags');
    }
  }

  /**
   * Format a single post
   * @private
   */
  _formatPost(post) {
    if (!post) return null;

    // Get featured image URL if available
    let featuredImage = null;
    if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
      featuredImage = post._embedded['wp:featuredmedia'][0].source_url;
    }

    return {
      id: post.id,
      title: post.title?.rendered || 'No Title',
      excerpt: post.excerpt?.rendered || '',
      content: post.content?.rendered || '',
      link: post.link,
      date: post.date,
      modified: post.modified,
      slug: post.slug,
      categories: post.categories || [],
      tags: post.tags || [],
      featuredImage,
    };
  }

  /**
   * Format an array of posts
   * @private
   */
  _formatPosts(posts) {
    if (!Array.isArray(posts)) return [];
    return posts.map(post => this._formatPost(post));
  }

  /**
   * Get recent posts with default settings
   * @param {number} [count=10] - Number of recent posts to fetch
   * @returns {Promise<Array>} - Array of formatted posts
   */
  async getRecentPosts(count = 10) {
    try {
      const posts = await this.getPosts({ perPage: count });
      
      // Format posts for the frontend
      return posts.map(post => ({
        id: post.id,
        title: post.title.rendered,
        excerpt: post.excerpt.rendered,
        content: post.content?.rendered || '',
        link: post.link,
        date: post.date,
        jetpack_featured_media_url: post.jetpack_featured_media_url || '',
        categories: post.categories || []
      }));
    } catch (error) {
      logger.error('Error in getRecentPosts:', error);
      throw error;
    }
  }
}

module.exports = new WordPressService();
