import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import scoresRouter from './routes/scores.js';
import cryptoRouter from './routes/crypto.js';
import { backend } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

const app = express();
app.use(express.json());

// CORS permissif en dev (le client Vite tourne sur :5173).
if (isDev) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: backend, uptime: process.uptime() });
});

app.use('/api', scoresRouter);
app.use('/api', cryptoRouter);

// En production, sert le build statique du client.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🐕  Escape BONK — serveur sur http://localhost:${PORT}`);
  if (isDev && !fs.existsSync(clientDist)) {
    console.log('    (dev) lance le client avec : npm run dev:client  → http://localhost:5173');
  }
});
