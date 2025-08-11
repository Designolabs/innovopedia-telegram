# Innovopedia Telegram Bot

A Telegram bot that automatically pulls posts from the Innovopedia WordPress site and shares them to specified Telegram channels or groups. The bot supports filtering by categories and tags, manual posting, and more.

## Features

- 🚀 **Automatic Posting**: Fetch and share new posts at regular intervals
- 🏷️ **Content Filtering**: Filter posts by categories and tags
- 👨‍💻 **Admin Commands**: Control the bot with easy-to-use commands
- 📱 **Rich Media Support**: Posts include images, formatted text, and action buttons
- 🔄 **Multi-channel Support**: Post to multiple channels/groups with different filters
- ⚡ **Lightweight & Efficient**: Built with Node.js and Telegraf for optimal performance

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js 14.x or later
- npm or yarn
- A Telegram bot token from [@BotFather](https://t.me/botfather)
- Access to the WordPress REST API (for Innovopedia or your WordPress site)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/innovopedia-telegram.git
   cd innovopedia-telegram
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Copy the example environment file and update it with your configuration:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your configuration (see [Configuration](#configuration) section below)

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Telegram Bot Configuration (get from @BotFather)
BOT_TOKEN=your_bot_token_here
ADMIN_USERS=123456789,987654321  # Comma-separated list of Telegram user IDs who can use admin commands

# WordPress API Configuration
WORDPRESS_API_URL=https://innovopedia.com/wp-json/wp-json/wp/v2
# Optional: Only needed if WordPress requires authentication
# WORDPRESS_USERNAME=your_username
# WORDPRESS_APPLICATION_PASSWORD=your_application_password

# Default Categories and Tags (comma-separated IDs)
# Leave empty to include all categories/tags
DEFAULT_CATEGORIES=1,2,3
DEFAULT_TAGS=4,5,6

# Post Check Interval (in milliseconds, default: 10 minutes)
POST_CHECK_INTERVAL=600000

# Server Configuration
PORT=3000
NODE_ENV=production

# Web App URL (for web interface if needed)
WEB_APP_URL=https://your-domain.com

# Logging (optional)
LOG_LEVEL=info  # error, warn, info, debug
```

## Usage

### Starting the Bot

```bash
# Start in development mode (with auto-restart)
npm run dev

# Start in production mode
npm start
```

### Available Commands

#### For All Users
- `/start` - Show welcome message and available commands
- `/help` - Show help information
- `/preferences` - View current preferences
- `/categories` - List available categories
- `/tags` - List available tags

#### Admin Commands
- `/start_autopost` - Start automatic posting
- `/stop_autopost` - Stop automatic posting
- `/set_categories` - Set categories to filter by
- `/set_tags` - Set tags to filter by
- `/post_latest` - Manually post the latest article
- `/post_specific <id>` - Post a specific article by ID

## Deployment

### Using Coolify

1. Fork this repository to your GitHub account
2. Log in to your Coolify dashboard
3. Click on "Add a new project"
4. Select your forked repository
5. Configure the environment variables from the `.env.example` file
6. Set the following build settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Publish Directory: `./`
7. Deploy the application

### Using Docker

1. Build the Docker image:
   ```bash
   docker build -t innovopedia-telegram .
   ```

2. Run the container:
   ```bash
   docker run -d --name innovopedia-bot \
     --env-file .env \
     -p 3000:3000 \
     innovopedia-telegram
   ```

## Security Considerations

- Keep your bot token and other sensitive information in the `.env` file and never commit it to version control
- Restrict admin commands to trusted users only by setting the `ADMIN_USERS` environment variable
- Use HTTPS for your webhook URL if you set one up
- Regularly update your dependencies to include security patches

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue on GitHub or contact the maintainers.

## Acknowledgments

- [Telegraf](https://telegraf.js.org/) - Modern Telegram bot framework
- [WordPress REST API](https://developer.wordpress.org/rest-api/) - For fetching posts and taxonomies
- [Node.js](https://nodejs.org/) - JavaScript runtime