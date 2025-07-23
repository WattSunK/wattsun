const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Sample route
app.get('/', (req, res) => {
  res.send('🔒 WattSun API running over HTTPS');
});

module.exports = app;