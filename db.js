import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "velora.db");

export const db = new Database(dbPath);

export function initDb() {
  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      plan TEXT DEFAULT 'FREE',
      avatar_seed TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      tone TEXT DEFAULT 'soft',
      length TEXT DEFAULT 'normal',
      language TEXT DEFAULT 'ru'
    )
  `);

  // Chats
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats (id)
    )
  `);

  // Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Usage Daily
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      user_id TEXT NOT NULL,
      ymd TEXT NOT NULL,
      msg_count INTEGER DEFAULT 0,
      img_count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, ymd)
    )
  `);

  // Verify Codes
  db.exec(`
    CREATE TABLE IF NOT EXISTS verify_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  // Payments
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount_eur INTEGER NOT NULL,
      starts_at INTEGER,
      ends_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
}

export function ymdNow() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function planLimits(plan) {
  switch (plan) {
    case 'FULL':
      return { msgPerDay: 500, imgPerDay: 100, pro: true };
    case 'PLUS':
      return { msgPerDay: 200, imgPerDay: 30, pro: true };
    default:
      return { msgPerDay: 20, imgPerDay: 0, pro: false };
  }
}
