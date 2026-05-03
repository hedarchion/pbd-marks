const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'pbd_marks';
const COLLECTION_NAME = 'marks';

const app = express();
app.use(express.json());

let client, marksCollection;

async function connect() {
  if (!client && MONGODB_URI) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    marksCollection = client.db(DB_NAME).collection(COLLECTION_NAME);
  }
  return marksCollection;
}

function getGrade(pct) {
  if (pct >= 82) return 'A';
  if (pct >= 66) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  if (pct >= 20) return 'E';
  return 'F';
}

// GET marks for a class
app.get('/api/marks', async (req, res) => {
  try {
    const col = await connect();
    if (!col) return res.json([]);
    const cls = req.query.class;
    if (!cls) return res.status(400).json({ error: 'class query param required' });
    const docs = await col.find({ cls }).sort({ idx: 1 }).toArray();
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST update marks
app.post('/api/marks', async (req, res) => {
  try {
    const col = await connect();
    if (!col) return res.status(503).json({ error: 'No database connection' });
    const { cls, idx, paper1, paper2 } = req.body;
    if (!cls || idx == null) return res.status(400).json({ error: 'cls and idx required' });
    const p1 = Math.max(0, Math.min(40, parseInt(paper1) || 0));
    const p2 = Math.max(0, Math.min(40, parseInt(paper2) || 0));
    await col.updateOne({ cls, idx: parseInt(idx) }, { $set: { paper1: p1, paper2: p2 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST clear all marks
app.post('/api/clear', async (req, res) => {
  try {
    const col = await connect();
    if (!col) return res.status(503).json({ error: 'No database connection' });
    await col.updateMany({}, { $set: { paper1: 0, paper2: 0 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET export markdown
app.get('/api/export', async (req, res) => {
  try {
    const col = await connect();
    if (!col) return res.status(503).json({ error: 'No database connection' });
    const docs = await col.find({}).sort({ cls: 1, idx: 1 }).toArray();
    const grouped = {};
    for (const d of docs) {
      if (!grouped[d.cls]) grouped[d.cls] = [];
      grouped[d.cls].push(d);
    }
    let md = '# PBD Marks\n\n';
    for (const cls of Object.keys(grouped).sort()) {
      md += `## ${cls}\n\n| No | Name | Paper 1 | Paper 2 | Total | Grade |\n|----|------|---------|---------|-------|-------|\n`;
      for (const s of grouped[cls]) {
        const any = s.paper1 > 0 || s.paper2 > 0;
        const total = any ? Math.round(((s.paper1 + s.paper2) / 80) * 100) : '';
        const grade = any ? getGrade(total) : '';
        md += `| ${s.idx} | ${s.name} | ${any ? s.paper1 : ''} | ${any ? s.paper2 : ''} | ${any ? total + '%' : ''} | ${grade} |\n`;
      }
      md += '\n';
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="PBD_Marks.md"');
    res.send(md);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve static files from root
app.use(express.static(path.join(__dirname, '..')));

module.exports = app;
