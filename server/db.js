import Database from "better-sqlite3";

export const db = new Database("velora.sqlite");

export function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'FREE',
      avatar_seed TEXT NOT NULL DEFAULT 'velora',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verify_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      tone TEXT NOT NULL DEFAULT 'soft',
      length TEXT NOT NULL DEFAULT 'normal',
      language TEXT NOT NULL DEFAULT 'ru',
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(chat_id) REFERENCES chats(id)
    );

    CREATE TABLE IF NOT EXISTS usage_daily (
      user_id TEXT NOT NULL,
      ymd TEXT NOT NULL,
      msg_count INTEGER NOT NULL DEFAULT 0,
      img_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, ymd),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount_eur REAL NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

export function ymdNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function planLimits(plan) {
  // можешь поменять как хочешь
  if (plan === "FULL") return { msgPerDay: 500, imgPerDay: 100, pro: true };
  if (plan === "PLUS") return { msgPerDay: 200, imgPerDay: 30, pro: true };
  return { msgPerDay: 20, imgPerDay: 0, pro: false };
}