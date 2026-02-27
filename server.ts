import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("distress_system.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_name TEXT,
    guardian_name TEXT,
    guardian_contact TEXT,
    emergency_contact TEXT,
    alert_interval INTEGER DEFAULT 30
  );

  CREATE TABLE IF NOT EXISTS distress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT,
    severity TEXT,
    summary TEXT,
    location TEXT,
    status TEXT DEFAULT 'pending'
  );

  INSERT OR IGNORE INTO settings (id, user_name, guardian_name, guardian_contact, emergency_contact)
  VALUES (1, 'User', 'Guardian', 'guardian@example.com', '911');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { user_name, guardian_name, guardian_contact, emergency_contact, alert_interval } = req.body;
    db.prepare(`
      UPDATE settings 
      SET user_name = ?, guardian_name = ?, guardian_contact = ?, emergency_contact = ?, alert_interval = ?
      WHERE id = 1
    `).run(user_name, guardian_name, guardian_contact, emergency_contact, alert_interval);
    res.json({ success: true });
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM distress_logs ORDER BY timestamp DESC LIMIT 50").all();
    res.json(logs);
  });

  app.post("/api/logs", (req, res) => {
    const { type, severity, summary, location } = req.body;
    const result = db.prepare(`
      INSERT INTO distress_logs (type, severity, summary, location)
      VALUES (?, ?, ?, ?)
    `).run(type, severity, summary, location);
    res.json({ id: result.lastInsertRowid });
  });

  app.post("/api/logs/:id/status", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE distress_logs SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
