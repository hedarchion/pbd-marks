require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 3000;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function getGrade(pct) {
  if (pct >= 82) return 'A';
  if (pct >= 66) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  if (pct >= 20) return 'E';
  return 'F';
}

app.get('/api/marks', async (req, res) => {
  try {
    const cls = req.query.class;
    if (!cls) return res.status(400).json({ error: 'class query param required' });
    const r = await pool.query(
      'SELECT cls, idx, name, paper1, paper2 FROM pbd_marks WHERE cls = $1 ORDER BY idx',
      [cls]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/marks', async (req, res) => {
  try {
    const { cls, idx, paper1, paper2 } = req.body;
    if (!cls || idx == null) return res.status(400).json({ error: 'cls and idx required' });
    const p1 = Math.max(0, Math.min(40, parseInt(paper1) || 0));
    const p2 = Math.max(0, Math.min(40, parseInt(paper2) || 0));
    await pool.query(
      'UPDATE pbd_marks SET paper1 = $1, paper2 = $2 WHERE cls = $3 AND idx = $4',
      [p1, p2, cls, parseInt(idx)]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clear', async (req, res) => {
  try {
    await pool.query('UPDATE pbd_marks SET paper1 = 0, paper2 = 0');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export', async (req, res) => {
  try {
    const r = await pool.query('SELECT cls, idx, name, paper1, paper2 FROM pbd_marks ORDER BY cls, idx');
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
