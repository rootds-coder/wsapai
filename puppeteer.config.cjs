const { join } = require('path');

// Store downloaded Chrome inside the project so it is available at runtime on Render
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};

