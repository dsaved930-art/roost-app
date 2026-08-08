require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { passport } = require('./passport-setup');
const { authOptional } = require('./middleware/auth');

const app = express();

app.use(express.json({ limit: '10mb' })); // photos are sent as base64, need more than Express's tiny default
app.use(cookieParser());
app.use(passport.initialize());
app.use(authOptional); // attaches req.user (or null) on every request, from a real signed cookie

app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/conversations', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/saved-searches', require('./routes/savedSearches'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/geocode', require('./routes/geocode'));

// SEO: real, crawlable, individually-addressable pages for each listing —
// this is what lets Google (and link previews on social/messaging apps)
// actually index and show real content instead of a blank JS shell.
const seo = require('./seo');
app.get('/listing/:id', seo.renderListingPage);
app.get('/sitemap.xml', seo.renderSitemap);
app.get('/robots.txt', seo.renderRobots);

// Serve the frontend as static files, and hand back index.html for any other
// route so the single-page app can handle its own navigation.
const frontendDir = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Roost backend running on port ${PORT}`);
  if (!process.env.DATABASE_URL) console.warn('WARNING: DATABASE_URL is not set.');
  if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is not set — sessions will not work correctly.');
});
