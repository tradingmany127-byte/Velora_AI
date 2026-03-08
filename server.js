import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

import { db, initDb, ymdNow, planLimits } from "./db.js";
import { makeMailer, sendVerifyCode } from "./mailer.js";
import { generateReply } from "./llm.js";
import path from "path";
import { fileURLToPath } from "url";
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Подключаем папку public
const publicDir = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 3000);

initDb();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const mailer = makeMailer(process.env);

function setSession(res, userId) {
  const token = nanoid(32);
  db.prepare("INSERT INTO sessions(token, user_id, created_at) VALUES(?,?,?)")
    .run(token, userId, Date.now());
  res.cookie("velora_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false // на проде поставишь true если https
  });
}

function clearSession(req, res) {
  const token = req.cookies.velora_session;
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.clearCookie("velora_session");
}

function getMe(req) {
  const token = req.cookies.velora_session;
  if (!token) return null;
  const s = db.prepare("SELECT user_id FROM sessions WHERE token=?").get(token);
  if (!s) return null;
  const u = db.prepare("SELECT id, name, email, plan, avatar_seed, verified, created_at FROM users WHERE id=?")
    .get(s.user_id);
  if (!u) return null;
  const settings = db.prepare("SELECT tone, length, language FROM settings WHERE user_id=?").get(u.id)
    || { tone: "soft", length: "normal", language: "ru" };
  return { user: u, settings };
}

function requireAuth(req, res, next) {
  const me = getMe(req);
  if (!me) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  req.me = me;
  next();
}

function ensureDailyUsage(userId) {
  const ymd = ymdNow();
  const row = db.prepare("SELECT * FROM usage_daily WHERE user_id=? AND ymd=?").get(userId, ymd);
  if (!row) db.prepare("INSERT INTO usage_daily(user_id, ymd, msg_count, img_count) VALUES(?,?,0,0)")
    .run(userId, ymd);
  return ymd;
}

function getUsage(userId) {
  const ymd = ensureDailyUsage(userId);
  return db.prepare("SELECT msg_count, img_count FROM usage_daily WHERE user_id=? AND ymd=?").get(userId, ymd);
}

function incMsg(userId) {
  const ymd = ensureDailyUsage(userId);
  db.prepare("UPDATE usage_daily SET msg_count = msg_count + 1 WHERE user_id=? AND ymd=?").run(userId, ymd);
}

function safeUserPayload(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan,
    avatarSeed: u.avatar_seed
  };
}

// ---------------- HEALTH ----------------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------------- ME ----------------
app.get("/api/me", (req, res) => {
  const me = getMe(req);
  res.json({ ok: true, user: me?.user ? safeUserPayload(me.user) : null });
});

// ---------------- AUTH ----------------
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.json({ ok: false, error: "MISSING_FIELDS" });
  if (String(password).length < 6) return res.json({ ok: false, error: "WEAK_PASSWORD" });

  const exists = db.prepare("SELECT id FROM users WHERE email=?").get(String(email).toLowerCase());
  if (exists) return res.json({ ok: false, error: "EMAIL_EXISTS" });

  const id = nanoid(12);
  const passHash = bcrypt.hashSync(password, 10);
  const avatarSeed = nanoid(8);
  db.prepare("INSERT INTO users(id, name, email, password_hash, verified, plan, avatar_seed, created_at) VALUES(?,?,?,?,0,'FREE',?,?)")
    .run(id, String(name).trim(), String(email).toLowerCase().trim(), passHash, avatarSeed, Date.now());

  db.prepare("INSERT OR IGNORE INTO settings(user_id, tone, length, language) VALUES(?,?,?,?)")
    .run(id, "soft", "normal", "ru");

  // code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  db.prepare("INSERT OR REPLACE INTO verify_codes(email, code, expires_at) VALUES(?,?,?)")
    .run(String(email).toLowerCase().trim(), code, expiresAt);

  const sent = await sendVerifyCode(mailer, process.env.SMTP_FROM || "Velora AI <no-reply@velora.local>", email, code);
  if (!sent) {
    console.log(`[DEV MODE] verify code for ${email}: ${code}`);
  }

  res.json({ ok: true, devMode: !mailer.hasSmtp });
});

app.post("/api/auth/verify", (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.json({ ok: false, error: "MISSING_FIELDS" });

  const row = db.prepare("SELECT code, expires_at FROM verify_codes WHERE email=?")
    .get(String(email).toLowerCase().trim());
  if (!row) return res.json({ ok: false, error: "NO_CODE" });
  if (Date.now() > row.expires_at) return res.json({ ok: false, error: "CODE_EXPIRED" });
  if (String(code).trim() !== row.code) return res.json({ ok: false, error: "CODE_INVALID" });

  const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(email).toLowerCase().trim());
  if (!u) return res.json({ ok: false, error: "NO_USER" });

  db.prepare("UPDATE users SET verified=1 WHERE id=?").run(u.id);
  db.prepare("DELETE FROM verify_codes WHERE email=?").run(String(email).toLowerCase().trim());

  setSession(res, u.id);
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ ok: false, error: "MISSING_FIELDS" });

  const u = db.prepare("SELECT * FROM users WHERE email=?").get(String(email).toLowerCase().trim());
  if (!u) return res.json({ ok: false, error: "INVALID_CREDENTIALS" });
  if (!u.verified) return res.json({ ok: false, error: "NOT_VERIFIED" });

  const ok = bcrypt.compareSync(String(password), u.password_hash);
  if (!ok) return res.json({ ok: false, error: "INVALID_CREDENTIALS" });

  setSession(res, u.id);
  res.json({ ok: true, user: safeUserPayload(u) });
});

app.post("/api/auth/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

// ---------------- PROFILE ----------------
app.get("/api/profile", requireAuth, (req, res) => {
  const u = req.me.user;
  const usage = getUsage(u.id);
  const limits = planLimits(u.plan);

  const totalMsgs = db.prepare(`
    SELECT COUNT(*) as c
    FROM messages m
    JOIN chats c ON c.id = m.chat_id
    WHERE c.user_id = ? AND m.role='user'
  `).get(u.id)?.c || 0;

  const totalImgs = 0; // пока заглушка

  // платежи
  const lastPay = db.prepare("SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 1").get(u.id);

  res.json({
    ok: true,
    profile: {
      user: safeUserPayload(u),
      settings: req.me.settings,
      usageToday: usage,
      limits,
      totals: { messages: totalMsgs, images: totalImgs },
      payments: {
        currentPlan: u.plan,
        startsAt: lastPay?.starts_at || null,
        endsAt: lastPay?.ends_at || null,
        history: db.prepare("SELECT id, plan, amount_eur, starts_at, ends_at, created_at FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 20")
          .all(u.id)
      }
    }
  });
});

app.post("/api/profile/settings", requireAuth, (req, res) => {
  const { tone, length, language } = req.body || {};
  const t = ["soft", "neutral", "tough"].includes(tone) ? tone : "soft";
  const l = ["short", "normal", "long"].includes(length) ? length : "normal";
  const lang = (language || "ru").slice(0, 5);

  db.prepare("INSERT OR REPLACE INTO settings(user_id, tone, length, language) VALUES(?,?,?,?)")
    .run(req.me.user.id, t, l, lang);

  res.json({ ok: true });
});

// ---------------- CHATS (AUTH ONLY) ----------------
app.get("/api/chats", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.pinned, c.created_at, c.updated_at,
           (SELECT content FROM messages WHERE chat_id=c.id AND role='assistant' ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT COUNT(*) FROM messages WHERE chat_id=c.id) as message_count
    FROM chats c
    WHERE c.user_id=?
    ORDER BY c.pinned DESC, c.updated_at DESC
  `).all(req.me.user.id);

  res.json({ ok: true, chats: rows });
});

app.post("/api/chats/new", requireAuth, (req, res) => {
  const id = nanoid(12);
  const title = String(req.body?.title || "Новый чат").slice(0, 80);
  const now = Date.now();

  db.prepare("INSERT INTO chats(id, user_id, title, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?)")
    .run(id, req.me.user.id, title, 0, now, now);

  res.json({ ok: true, chatId: id });
});

app.get("/api/chats/:id", requireAuth, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").get(req.params.id, req.me.user.id);
  if (!chat) return res.json({ ok: false, error: "NOT_FOUND" });

  const messages = db.prepare("SELECT role, content, created_at FROM messages WHERE chat_id=? ORDER BY created_at ASC")
    .all(chat.id);

  res.json({ ok: true, chat, messages });
});

app.post("/api/chats/:id/pin", requireAuth, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").get(req.params.id, req.me.user.id);
  if (!chat) return res.json({ ok: false, error: "NOT_FOUND" });

  const pinned = chat.pinned ? 0 : 1;
  db.prepare("UPDATE chats SET pinned=?, updated_at=? WHERE id=?").run(pinned, Date.now(), chat.id);
  res.json({ ok: true, pinned });
});

app.post("/api/chats/:id/rename", requireAuth, (req, res) => {
  const { title } = req.body || {};
  if (!title || String(title).trim() === "") return res.json({ ok: false, error: "MISSING_TITLE" });
  
  const chat = db.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").get(req.params.id, req.me.user.id);
  if (!chat) return res.json({ ok: false, error: "NOT_FOUND" });
  
  const newTitle = String(title).trim().slice(0, 80);
  db.prepare("UPDATE chats SET title=?, updated_at=? WHERE id=?").run(newTitle, Date.now(), chat.id);
  res.json({ ok: true, title: newTitle });
});

app.delete("/api/chats/:id", requireAuth, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").get(req.params.id, req.me.user.id);
  if (!chat) return res.json({ ok: false, error: "NOT_FOUND" });
  
  // Сначала удаляем сообщения чата
  db.prepare("DELETE FROM messages WHERE chat_id=?").run(chat.id);
  
  // Потом удаляем сам чат
  db.prepare("DELETE FROM chats WHERE id=?").run(chat.id);
  
  res.json({ ok: true });
});

// ---------------- CHAT (GUEST + AUTH) ----------------
app.post("/api/chat", async (req, res) => {
  const { message, chatId, mode } = req.body || {};
  const text = String(message || "").trim();
  if (!text) return res.json({ ok: false, error: "EMPTY" });

  const me = getMe(req);
  const user = me?.user || null;

  // режим: free/pro
  let useMode = (mode === "pro" ? "pro" : "free");

  // ограничения Pro: только если план позволяет
  if (useMode === "pro") {
    if (!user) return res.json({ ok: false, error: "LOGIN_REQUIRED_FOR_PRO" });
    const lim = planLimits(user.plan);
    if (!lim.pro) return res.json({ ok: false, error: "PLAN_REQUIRED" });
  }

  // лимиты сообщений
  if (user) {
    const lim = planLimits(user.plan);
    const usage = getUsage(user.id);
    if (usage.msg_count >= lim.msgPerDay) {
      return res.json({ ok: false, error: "DAILY_LIMIT", limit: lim.msgPerDay });
    }
  }

  try {
    // История для LLM: если юзер авторизован и передан chatId — берём последние сообщения
    let history = [];
    if (user && chatId) {
      const owns = db.prepare("SELECT id FROM chats WHERE id=? AND user_id=?").get(chatId, user.id);
      if (owns) {
        history = db.prepare(`
          SELECT role, content
          FROM messages
          WHERE chat_id=?
          ORDER BY created_at DESC
          LIMIT 10
        `).all(chatId).reverse();
      }
    }

    const reply = await generateReply({
      mode: useMode,
      env: process.env,
      userSettings: me?.settings || { tone: "soft", length: "normal", language: "ru" },
      chatHistory: history,
      userMessage: text
    });

    // сохранить только если авторизован + есть chatId
    if (user && chatId) {
      const owns = db.prepare("SELECT id FROM chats WHERE id=? AND user_id=?").get(chatId, user.id);
      if (owns) {
        const now = Date.now();
        db.prepare("INSERT INTO messages(id, chat_id, role, content, created_at) VALUES(?,?,?,?,?)")
          .run(nanoid(12), chatId, "user", text, now);
        db.prepare("INSERT INTO messages(id, chat_id, role, content, created_at) VALUES(?,?,?,?,?)")
          .run(nanoid(12), chatId, "assistant", reply, now + 1);
        db.prepare("UPDATE chats SET updated_at=? WHERE id=?").run(now, chatId);
      }
    }

    if (user) incMsg(user.id);

    res.json({ ok: true, reply });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("PRO_NOT_CONFIGURED")) return res.json({ ok: false, error: "PRO_NOT_CONFIGURED" });
    if (msg.startsWith("LLM_ERROR_")) return res.json({ ok: false, error: "LLM_ERROR" });
    console.error(e);
    res.json({ ok: false, error: "SERVER_ERROR" });
  }
});

app.listen(PORT, () => {
  console.log(`[Velora] running on http://localhost:${PORT}`);
});