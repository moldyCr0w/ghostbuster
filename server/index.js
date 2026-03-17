const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded resumes at /uploads
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/stages',     require('./routes/stages'));
app.use('/api/reqs',       require('./routes/reqs'));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (_, res) =>
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'))
  );
}

const PORT = process.env.API_PORT || process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running at http://localhost:${PORT}`));
