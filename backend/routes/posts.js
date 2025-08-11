const express = require('express');
const router = express.Router();

// Example posts data
const posts = [
  {
    id: 1,
    title: 'The Future of AI in Healthcare',
    image: 'https://picsum.photos/id/237/300/200',
    excerpt: 'Artificial intelligence is revolutionizing healthcare with predictive analytics and personalized medicine...',
    url: 'https://example.com/ai-healthcare'
  },
  {
    id: 2,
    title: 'Sustainable Energy Solutions',
    image: 'https://picsum.photos/id/1019/300/200',
    excerpt: 'Renewable energy technologies are becoming more efficient and affordable, leading to widespread adoption...',
    url: 'https://example.com/sustainable-energy'
  },
  {
    id: 3,
    title: 'Blockchain Beyond Cryptocurrency',
    image: 'https://picsum.photos/id/180/300/200',
    excerpt: 'Blockchain technology is finding applications in supply chain management, voting systems, and more...',
    url: 'https://example.com/blockchain-applications'
  },
  {
    id: 4,
    title: 'The Rise of Quantum Computing',
    image: 'https://picsum.photos/id/119/300/200',
    excerpt: 'Quantum computers are poised to solve complex problems that are currently beyond the reach of classical computers...',
    url: 'https://example.com/quantum-computing'
  },
  {
    id: 5,
    title: 'Biotechnology Breakthroughs',
    image: 'https://picsum.photos/id/250/300/200',
    excerpt: 'Recent advances in gene editing and synthetic biology are opening new frontiers in medicine and agriculture...',
    url: 'https://example.com/biotech-breakthroughs'
  }
];

// GET /posts - Return all posts
router.get('/', (req, res) => {
  res.json(posts);
});

// GET /posts/:id - Return a specific post
router.get('/:id', (req, res) => {
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json(post);
});

module.exports = router;