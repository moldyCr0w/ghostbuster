require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve uploaded resumes at /uploads
// In production (Railway) UPLOADS_DIR points to the persistent volume.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Public job posting routes — no auth required, must be mounted before auth middleware
app.use('/api/public',        require('./routes/public'));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/candidates',    require('./routes/candidates'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/reqs',          require('./routes/reqs'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/hm-users',       require('./routes/hmUsers'));
app.use('/api/stats',          require('./routes/stats'));
app.use('/api/google-auth',    require('./routes/googleAuth'));
app.use('/api/panelist-tags',  require('./routes/panelistTags'));
app.use('/api/panelists',       require('./routes/panelists'));
app.use('/api/interview-types', require('./routes/interviewTypes'));
app.use('/api/schedule',        require('./routes/schedule'));
app.use('/api/scheduling-tool', require('./routes/schedulingTool'));
app.use('/api/reqs/:reqId/interview-plan', require('./routes/reqInterviewPlans'));
app.use('/api/pokedex',         require('./routes/pokedex'));
app.use('/api/workday',         require('./routes/workday'));

// Serve the built React app whenever the dist folder exists.
// Works in production (Railway) without requiring NODE_ENV to be set.
// In local dev the dist folder is absent so Vite's dev server takes over.
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const PORT = process.env.API_PORT || process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);

  // Run HM 24-hour reminder check on startup and then every hour
  const { sendHmReminders } = require('./reminders');
  sendHmReminders().catch(err => console.error('[reminders] Startup check failed:', err.message));
  setInterval(() => {
    sendHmReminders().catch(err => console.error('[reminders] Hourly check failed:', err.message));
  }, 60 * 60 * 1000); // every hour
});
