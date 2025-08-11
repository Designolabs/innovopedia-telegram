<<<<<<< HEAD
// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;

// Expand the WebApp to full height
tg.expand();

// Get user information from Telegram WebApp
const user = tg.initDataUnsafe?.user || {};
const userId = user.id || 'anonymous';

// DOM elements
const postsContainer = document.getElementById('posts-container');

// Fetch posts from the backend API
async function fetchPosts() {
  try {
    const response = await fetch('/posts');
    if (!response.ok) {
      throw new Error('Failed to fetch posts');
    }
    const posts = await response.json();
    renderPosts(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    postsContainer.innerHTML = `<div class="error">Failed to load posts. Please try again later.</div>`;
  }
}

// Render posts to the DOM
function renderPosts(posts) {
  if (!posts || posts.length === 0) {
    postsContainer.innerHTML = `<div class="no-posts">No posts available.</div>`;
    return;
  }

  postsContainer.innerHTML = '';
  
  posts.forEach(post => {
    const postCard = document.createElement('div');
    postCard.className = 'post-card';
    postCard.innerHTML = `
      <img src="${post.image}" alt="${post.title}" class="post-image">
      <div class="post-content">
        <h2 class="post-title">${post.title}</h2>
        <p class="post-excerpt">${post.excerpt}</p>
        <div class="post-actions">
          <a href="${post.url}" target="_blank" class="btn btn-primary">Read Full</a>
          <button class="btn btn-secondary save-btn" data-id="${post.id}">Save</button>
        </div>
      </div>
    `;
    postsContainer.appendChild(postCard);
  });

  // Add event listeners to save buttons
  document.querySelectorAll('.save-btn').forEach(button => {
    button.addEventListener('click', handleSavePost);
  });
}

// Handle saving a post
async function handleSavePost(event) {
  const postId = event.target.dataset.id;
  
  // Show a notification using Telegram's native UI
  tg.showPopup({
    title: 'Save Article',
    message: 'This feature is coming soon!',
    buttons: [{ type: 'ok' }]
  });
  
  // In a real app, you would save the post to the user's preferences
  // Example code (commented out for now):
  /*
  try {
    const response = await fetch('/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        categories: [],
        savedPosts: [postId]
      })
    });
    
    if (response.ok) {
      tg.showPopup({
        title: 'Success',
        message: 'Article saved successfully!',
        buttons: [{ type: 'ok' }]
      });
    }
  } catch (error) {
    console.error('Error saving post:', error);
  }
  */
}

// Initialize the app
function init() {
  fetchPosts();
}

// Start the app when the document is loaded
=======
// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;

// Expand the WebApp to full height
tg.expand();

// Get user information from Telegram WebApp
const user = tg.initDataUnsafe?.user || {};
const userId = user.id || 'anonymous';

// DOM elements
const postsContainer = document.getElementById('posts-container');

// Fetch posts from the backend API
async function fetchPosts() {
  try {
    const response = await fetch('/posts');
    if (!response.ok) {
      throw new Error('Failed to fetch posts');
    }
    const posts = await response.json();
    renderPosts(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    postsContainer.innerHTML = `<div class="error">Failed to load posts. Please try again later.</div>`;
  }
}

// Render posts to the DOM
function renderPosts(posts) {
  if (!posts || posts.length === 0) {
    postsContainer.innerHTML = `<div class="no-posts">No posts available.</div>`;
    return;
  }

  postsContainer.innerHTML = '';
  
  posts.forEach(post => {
    const postCard = document.createElement('div');
    postCard.className = 'post-card';
    postCard.innerHTML = `
      <img src="${post.image}" alt="${post.title}" class="post-image">
      <div class="post-content">
        <h2 class="post-title">${post.title}</h2>
        <p class="post-excerpt">${post.excerpt}</p>
        <div class="post-actions">
          <a href="${post.url}" target="_blank" class="btn btn-primary">Read Full</a>
          <button class="btn btn-secondary save-btn" data-id="${post.id}">Save</button>
        </div>
      </div>
    `;
    postsContainer.appendChild(postCard);
  });

  // Add event listeners to save buttons
  document.querySelectorAll('.save-btn').forEach(button => {
    button.addEventListener('click', handleSavePost);
  });
}

// Handle saving a post
async function handleSavePost(event) {
  const postId = event.target.dataset.id;
  
  // Show a notification using Telegram's native UI
  tg.showPopup({
    title: 'Save Article',
    message: 'This feature is coming soon!',
    buttons: [{ type: 'ok' }]
  });
  
  // In a real app, you would save the post to the user's preferences
  // Example code (commented out for now):
  /*
  try {
    const response = await fetch('/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        categories: [],
        savedPosts: [postId]
      })
    });
    
    if (response.ok) {
      tg.showPopup({
        title: 'Success',
        message: 'Article saved successfully!',
        buttons: [{ type: 'ok' }]
      });
    }
  } catch (error) {
    console.error('Error saving post:', error);
  }
  */
}

// Initialize the app
function init() {
  fetchPosts();
}

// Start the app when the document is loaded
>>>>>>> fddee1d865d2a53238848734df53742a08d23ba5
document.addEventListener('DOMContentLoaded', init);