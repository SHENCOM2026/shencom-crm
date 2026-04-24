require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const seed = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS allowlist: production URL + local dev + LAN (for mobile PWA)
const DEFAULT_ALLOWED = [
  'https://shencom-crm.onrender.com',
  process.env.CRM_BASE_URL,
].filter(Boolean);
const EXTRA_ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED, ...EXTRA_ALLOWED])];
// Regex for localhost and private LAN IPs (dev + mobile on local network)
const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
  origin: (origin, cb) => {
    // No origin: same-origin request, curl, server-to-server, mobile WebView
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (LOCAL_ORIGIN_REGEX.test(origin)) return cb(null, true);
    console.warn('[CORS] blocked origin:', origin);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Seed database on first run
seed();

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/commissions', require('./routes/commissions'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/imports', require('./routes/imports'));

// Serve Mobile PWA app
const mobileBuildPath = path.join(__dirname, '..', 'mobile', 'dist');
app.use('/mobile', express.static(mobileBuildPath));
app.get('/mobile/*', (req, res) => {
  res.sendFile(path.join(mobileBuildPath, 'index.html'));
});

// Serve Desktop React app in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/mobile')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // Detect local IP for mobile access
  const nets = require('os').networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  console.log(`\n  ===================================`);
  console.log(`  SHENCOM CRM - Claro Ecuador`);
  console.log(`  ===================================`);
  console.log(`  🖥️  PC Desktop: http://localhost:${PORT}`);
  console.log(`  📱 App Movil:  http://${localIP}:${PORT}/mobile/`);
  console.log(`  👤 Usuario: admin | Clave: shencom2026`);
  console.log(`  ===================================\n`);
});
