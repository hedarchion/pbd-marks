const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const app = express();
app.use(express.json());

let pool;

function getPool() {
  if (!pool && DATABASE_URL) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

function getGrade(pct) {
  if (pct >= 82) return 'A';
  if (pct >= 66) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  if (pct >= 20) return 'E';
  return 'F';
}

// Read index.html once at startup (cached across warm invocations)
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');

app.get('/api/marks', async (req, res) => {
  try {
    const p = getPool();
    if (!p) return res.json([]);
    const cls = req.query.class;
    if (!cls) return res.status(400).json({ error: 'class query param required' });
    const r = await p.query(
      'SELECT cls, idx, name, paper1, paper2 FROM pbd_marks WHERE cls = $1 ORDER BY idx',
      [cls]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/marks', async (req, res) => {
  try {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'No database connection' });
    const { cls, idx, paper1, paper2 } = req.body;
    if (!cls || idx == null) return res.status(400).json({ error: 'cls and idx required' });
    const p1 = Math.max(0, Math.min(40, parseInt(paper1) || 0));
    const p2 = Math.max(0, Math.min(40, parseInt(paper2) || 0));
    await p.query(
      'UPDATE pbd_marks SET paper1 = $1, paper2 = $2 WHERE cls = $3 AND idx = $4',
      [p1, p2, cls, parseInt(idx)]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clear', async (req, res) => {
  try {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'No database connection' });
    await p.query('UPDATE pbd_marks SET paper1 = 0, paper2 = 0');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export', async (req, res) => {
  try {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'No database connection' });
    const r = await p.query('SELECT cls, idx, name, paper1, paper2 FROM pbd_marks ORDER BY cls, idx');
    const grouped = {};
    for (const s of r.rows) {
      if (!grouped[s.cls]) grouped[s.cls] = [];
      grouped[s.cls].push(s);
    }
    let md = '# PBD Marks\n\n';
    for (const cls of Object.keys(grouped).sort()) {
      md += '## ' + cls + '\n\n| No | Name | Paper 1 | Paper 2 | Total | Grade |\n';
      md += '|----|------|---------|---------|-------|-------|\n';
      for (const s of grouped[cls]) {
        const any = s.paper1 > 0 || s.paper2 > 0;
        const total = any ? Math.round(((s.paper1 + s.paper2) / 80) * 100) : '';
        const grade = any ? getGrade(total) : '';
        md += '| ' + s.idx + ' | ' + s.name + ' | ' + (any ? s.paper1 : '') + ' | ' + (any ? s.paper2 : '') + ' | ' + (any ? total + '%' : '') + ' | ' + grade + ' |\n';
      }
      md += '\n';
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="PBD_Marks.md"');
    res.send(md);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve HTML for all non-API routes
app.get('/', (_req, res) => { res.type('html').send(html); });
app.get('/api', (_req, res) => { res.type('html').send(html); });
app.use((_req, res) => { res.type('html').send(html); });

module.exports = app;
