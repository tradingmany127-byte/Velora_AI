// ----- Firebase (Browser, no bundler) -----
import { firebaseAuth, googleProvider } from "./firebase.js";

import {
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const API = {
  async get(url) {
    const r = await fetch(url, { credentials: "include" });
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      credentials: "include"
    });
    return r.json();
  }
};

const state = {
  user: null,
  profile: null,
  activeChatId: null,
  activeMode: "free", // free|pro
  guestSession: [], // не сохраняем в localStorage, только RAM
};

const elApp = document.getElementById("app");
const elModalRoot = document.getElementById("modalRoot");
const elToasts = document.getElementById("toasts");
const elWelcome = document.getElementById("welcome");

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function toast(title, detail = "") {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${escapeHtml(title)}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}`;
  elToasts.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
  // ===== TOPBAR BUTTONS (global handler) =====
document.addEventListener("click", (e) => {

  // кнопка вход / регистрация
  if (e.target.closest("#authBtn")) {
    openAuthModal?.();
  }

  // кнопка профиль
  if (e.target.closest("#profileBtn")) {
    openProfile?.();
  }

  // закрытие модалки
  if (e.target.closest("[data-close='1']")) {
    closeModal?.();
  }

});

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function topbar() {
  const rightBtn = state.user
    ? `<button class="btn" id="profileBtn">Профиль</button>`
    : `<button class="btn primary" id="authBtn">Вход / Регистрация</button>`;

  return `
    <div class="topbar">
      <div class="brand" id="brandHome">
        <div class="dot"></div>
        <div>
          <strong>Velora AI</strong><br/>
          <span>AI рядом • premium chat</span>
        </div>
      </div>
      <div class="actions">
        ${rightBtn}
      </div>
    </div>
  `;
}

function renderChat() {
  elApp.innerHTML = `
    <div class="container">
      ${topbar()}

      <div class="grid fadeIn">
        <div class="card chatWrap">
          <div class="h">
            <div>
              <h2>Чат Velora</h2>
              <div class="sub">
                ${state.user ? `Вы вошли как <b>${escapeHtml(state.user.name)}</b>. История сохраняется.` : `Гостевой режим: можно писать без регистрации, но история не сохраняется.`}
              </div>
            </div>
            ${state.user ? `<button class="btn" id="newChatBtn">Новый чат</button>` : ``}
          </div>

          <div class="modeBar">
            <div class="modeBtn ${state.activeMode==="free"?"active":""}" data-mode="free">Free • Local</div>
            <div class="modeBtn ${state.activeMode==="pro"?"active":""}" data-mode="pro">Pro • GPT</div>
          </div>

          <div class="hr"></div>

          <div class="chatLog" id="chatLog"></div>

          <div class="chatBox">
            <input id="chatInput" class="input" placeholder="Напиши сообщение…" />
            <button class="btn primary" id="sendBtn">Отправить</button>
          </div>

          ${state.user ? `
            <div class="sub" style="margin-top:10px;">
              Активный чат: <b>${escapeHtml(state.activeChatId || "—")}</b>
            </div>
          ` : ``}
        </div>
      </div>
    </div>
  `;

  // bind
  document.getElementById("brandHome").onclick = () => renderChat();

  if (!state.user) {
    document.getElementById("authBtn").onclick = () => openAuthModal();
  } else {
    document.getElementById("profileBtn").onclick = () => openProfile();
    document.getElementById("newChatBtn").onclick = () => createNewChat();
  }

  elApp.querySelectorAll("[data-mode]").forEach(b => {
    b.onclick = () => {
      const m = b.getAttribute("data-mode");
      state.activeMode = m;

      // Pro только для PLUS/FULL
      if (m === "pro" && (!state.profile || !state.profile.profile?.limits?.pro)) {
        state.activeMode = "free";
        toast("Pro недоступен", "Нужен план Velora+ или Velora Full.");
      }
      renderChat();
      renderMessages();
    };
  });

  // send
  const input = document.getElementById("chatInput");
  document.getElementById("sendBtn").onclick = () => sendMessage(input.value);
  input.onkeydown = (e) => {
    if (e.key === "Enter") sendMessage(input.value);
  };

  renderMessages();
}

  
function renderMessages() {
  const log = document.getElementById("chatLog");
  log.innerHTML = "";

  const msgs = state.user ? (state.currentMessages || []) : state.guestSession;

  if (!msgs.length) {
    addBubble("Я Velora AI. Напиши, что тебе нужно — и я помогу.", "ai");
    return;
  }

  msgs.forEach(m => addBubble(m.content, m.role === "user" ? "me" : "ai"));

  function addBubble(text, who) {
    const div = document.createElement("div");
    div.className = `bubble ${who}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

async function createNewChat() {
  const r = await API.post("/api/chats/new", { title: "Новый чат" });
  if (!r.ok) return toast("Ошибка", r.error || "Не удалось создать чат.");
  state.activeChatId = r.chatId;
  state.currentMessages = [];
  toast("Готово", "Создал новый чат.");
  renderChat();
}

async function loadChat(chatId) {
  const r = await API.get(`/api/chats/${chatId}`);
  if (!r.ok) return toast("Ошибка", r.error || "Не удалось открыть чат.");
  state.activeChatId = chatId;
  state.currentMessages = (r.messages || []).map(x => ({
    role: x.role === "user" ? "user" : "assistant",
    content: x.content
  }));
  renderChat();
}

async function sendMessage(text) {
  const msg = String(text || "").trim();
  if (!msg) return;

  // Pro доступность
  if (state.activeMode === "pro") {
    if (!state.user) {
      toast("Pro только после входа", "Зарегистрируйся и выбери план.");
      return;
    }
    if (!state.profile?.profile?.limits?.pro) {
      toast("Нужен Velora+ / Full", "В бесплатном плане Pro недоступен.");
      state.activeMode = "free";
      renderChat();
      return;
    }
  }

  // отрисуем сразу
  if (state.user) {
    state.currentMessages = state.currentMessages || [];
    state.currentMessages.push({ role: "user", content: msg });
  } else {
    state.guestSession.push({ role: "user", content: msg });
  }
  renderMessages();

  // call api
  const r = await API.post("/api/chat", {
    message: msg,
    chatId: state.user ? state.activeChatId : null,
    mode: state.activeMode
  });

  if (!r.ok) {
    if (r.error === "DAILY_LIMIT") {
      toast("Лимит сообщений", `Сегодня лимит исчерпан. План: ${state.user?.plan || "FREE"}`);
      return;
    }
    if (r.error === "PRO_NOT_CONFIGURED") {
      toast("Pro не настроен", "На сервере нет OPENAI_API_KEY.");
      return;
    }
    if (r.error === "LLM_ERROR") {
      toast("LLM ошибка", "Проверь, запущен ли локальный сервер модели (LM Studio/Ollama).");
      return;
    }
    toast("Ошибка", r.error || "Не удалось получить ответ.");
    return;
  }

  const reply = r.reply || "…";

  if (state.user) state.currentMessages.push({ role: "assistant", content: reply });
  else state.guestSession.push({ role: "assistant", content: reply });

  renderMessages();

  // обновим профиль (лимиты)
  if (state.user) await refreshProfileSilent();
}

function openModal({ title, body, footer }) {
  elModalRoot.classList.remove("hidden");
  elModalRoot.innerHTML = `
    <div class="modal fadeIn">
      <div class="head">
        <h3>${escapeHtml(title || "")}</h3>
        <button class="btn ghost" data-close="1">✕</button>
      </div>
      <div class="body">${body || ""}</div>
      
  `;
  elModalRoot.querySelectorAll("[data-close]").forEach(b => b.onclick = () => closeModal());
  elModalRoot.onclick = (e) => { if (e.target === elModalRoot) closeModal(); };
}
function closeModal() {
  elModalRoot.classList.add("hidden");
  elModalRoot.innerHTML = "";
}

function showWelcome(name) {
  elWelcome.classList.remove("hidden");
  elWelcome.innerHTML = `
    <div class="welcomeCard fadeIn">
      <h2>Я Velora AI</h2>
      <div class="sub">
        Привет, <b>${escapeHtml(name || "друг")}</b> 👋<br/>
        Рад видеть тебя. Давай сделаем так, чтобы ты реально продвигался вперёд — спокойно, уверенно и без хаоса.
        Я сохраню твои чаты, настройки и прогресс — и буду рядом.
      </div>
      <div class="hr"></div>
      <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="btn" id="goChat">В чат</button>
        <button class="btn primary" id="goProfile">Открыть профиль</button>
      </div>
    </div>
  `;
  document.getElementById("goChat").onclick = () => { elWelcome.classList.add("hidden"); elWelcome.innerHTML=""; };
  document.getElementById("goProfile").onclick = () => { elWelcome.classList.add("hidden"); elWelcome.innerHTML=""; openProfile(); };
  elWelcome.onclick = (e) => { if (e.target === elWelcome) { elWelcome.classList.add("hidden"); elWelcome.innerHTML=""; } };
}

function openAuthModal() {
  const body = `
    <div class="sub">
      
      

    <div class="row">
      <input id="regName" class="input" placeholder="Имя пользователя" />
      <input id="regEmail" class="input" placeholder="Почта (Email)" />
    </div>
    <div class="row" style="margin-top:10px;">
      <input id="regPass" class="input" type="password" placeholder="Пароль (мин. 6 символов)" />
      <button class="btn primary" id="regBtn">Зарегистрироваться</button>
    </div>

    <div class="hr"></div>

    <div class="row">
      <input id="loginEmail" class="input" placeholder="Email" />
      <input id="loginPass" class="input" type="password" placeholder="Пароль" />
    </div>
    <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn" id="loginBtn">Войти</button>
      <button class="btn ghost" id="toggleVerify">У меня есть код</button>


    <div class="hr"></div>
    <div class="sub">Или:</div>
    <button class="btn" id="googleBtn" style="width:100%; margin-top:8px;">Войти через Google (скоро)</button>
  </div>
</div>

    `;



  openModal({ title: "Вход / Регистрация", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });
setTimeout(() => {
  const btn = document.getElementById("magicLinkBtn");

if (btn) {
  btn.onclick = async () => {
    if (btn.dataset.sending === "1") return;
    btn.dataset.sending = "1";
    btn.disabled = true;

    try {
      const email = document.getElementById("loginEmail")?.value?.trim();
      if (!email) {
        toast("Ошибка", "Введите email");
        return;
      }

      await sendMagicLink(email);

    } catch (e) {
      console.error(e);
      toast("Ошибка", e.code || e.message);
    } finally {
      btn.dataset.sending = "0";
      btn.disabled = false;
    }
  };
}
}, 0);
  
  document.getElementById("regBtn").onclick = async () => {
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPass").value;
  await register(email, password);
};

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;
  await login(email, password);
};
}

async function bootAfterAuth(source) {
  // 1) берем пользователя из Firebase
  const u = firebaseAuth.currentUser;
if (!u) return;

// ✅ обязательно: обновляем данные пользователя (emailVerified)
await u.reload();

if (firebaseAuth.currentUser && firebaseAuth.currentUser.emailVerified === false) {
  await signOut(firebaseAuth);
  toast("Подтверди почту", "Подтверди email из письма и зайди снова.");
  return;
}

  // 2) кладем в state.user так, как ожидает твой UI
  state.user = {
    id: u.uid,
    email: u.email,
    name: u.displayName || (u.email ? u.email.split("@")[0] : "user"),
    provider: u.providerData?.[0]?.providerId || "password",
  };

  // 3) дальше — твой текущий сценарий (чтобы не сломать кнопку “Профиль”)
  if (typeof refreshProfileSilent === "function") {
  await refreshProfileSilent();
}
  closeModal?.();

  // если у тебя тут создаётся “первый чат” — оставляй, как было
  if (!state.activeChatId && API?.post) {
    try {
      const c = await API.post("/api/chats/new", { title: "первый чат" });
      if (c?.ok) {
        state.activeChatId = c.chatId;
        state.currentMessages = [];
      }
    } catch {}
  }

  // ЭТО ГЛАВНОЕ: твой UI-переключатель
  showWelcome?.(state.user?.name || "друг");
  renderChat?.();
}

  

async function refreshProfileSilent() {
  if (!state.user) return;
  const r = await API.get("/api/profile");
  if (r.ok) state.profile = r;
}

function planLabel(plan) {
  if (plan === "FULL") return "Velora Full";
  if (plan === "PLUS") return "Velora+";
  return "Free Plan";
}

function openProfile() {
  if (!state.user) return openAuthModal();

  const p = state.profile?.profile;
  const user = p?.user || state.user;

  const usage = p?.usageToday || { msg_count: 0, img_count: 0 };
  const limits = p?.limits || { msgPerDay: 20, imgPerDay: 0, pro: false };

  const header = `
    <div class="h">
      <div>
        <h2>Профиль</h2>
        <div class="sub">Управляй подпиской, лимитами, чатами и настройками.</div>
      </div>
      <div class="pill"><span class="tag"></span> <b>${escapeHtml(planLabel(user.plan))}</b></div>
    </div>
    <div class="hr"></div>

    <div class="row">
      <div class="card" style="padding:12px;">
        <div class="h">
          <div>
            <h2>${escapeHtml(user.name)}</h2>
            <div class="sub">${escapeHtml(user.email)}</div>
          </div>
          <div class="pill">
            <span class="tag"></span>
            <b>${escapeHtml(planLabel(user.plan))}</b>
          </div>
        </div>
        <div class="hr"></div>
        <button class="btn primary" id="upgradeBtn" style="width:100%;">Upgrade</button>
      </div>

      <div class="card" style="padding:12px;">
        <div class="h"><h2>Лимиты</h2></div>
        <div class="sub" style="margin-top:6px;">
          Сообщения сегодня: <b>${usage.msg_count}</b> / <b>${limits.msgPerDay}</b><br/>
          Генерация фото: <b>${usage.img_count}</b> / <b>${limits.imgPerDay}</b>
        </div>
        <div class="hr"></div>
        <div class="sub">Лимиты обновляются ежедневно.</div>
      </div>
    </div>
  `;

  const body = `
    ${header}

    <div class="list" style="margin-top:12px;">
      <div class="item" data-go="history">
        <div class="check">🗂️</div>
        <p>История чатов <small>Сортировка по датам • Pin любимого чата</small></p>
      </div>

      <div class="item" data-go="stats">
        <div class="check">📈</div>
        <p>Статистика пользования <small>Сообщения/фото за всё время</small></p>
      </div>

      <div class="item" data-go="model">
        <div class="check">🧠</div>
        <p>Выбор модели / Подписки <small>Free / Velora+ / Velora Full</small></p>
      </div>

      <div class="item" data-go="ai">
        <div class="check">⚙️</div>
        <p>Настройки AI <small>Тон • Длина • Язык</small></p>
      </div>

      <div class="item" data-go="pay">
        <div class="check">💳</div>
        <p>Платежи <small>Текущий план • продление • история</small></p>
      </div>

      <div class="item" id="logoutItem">
        <div class="check">🚪</div>
        <p>Выйти <small>Завершить сессию</small></p>
      </div>
    </div>
  `;

  openModal({
    title: "Velora AI • Профиль",
    body,
    footer: `<button class="btn" data-close="1">Закрыть</button>`
  });

  document.getElementById("upgradeBtn").onclick = () => openModelPlans();
  document.getElementById("logoutItem").onclick = async () => {
    const r = await API.post("/api/auth/logout", {});
    if (r.ok) {
      state.user = null;
      state.profile = null;
      state.activeChatId = null;
      state.currentMessages = [];
      toast("Готово", "Вы вышли из аккаунта.");
      closeModal();
      renderChat();
    }
  };

  elModalRoot.querySelectorAll("[data-go]").forEach(x => {
    x.onclick = () => {
      const to = x.getAttribute("data-go");
      if (to === "history") openChatHistory();
      if (to === "stats") openStats();
      if (to === "model") openModelPlans();
      if (to === "ai") openAiSettings();
      if (to === "pay") openPayments();
    };
  });
}

async function openChatHistory() {
  const r = await API.get("/api/chats");
  if (!r.ok) return toast("Ошибка", "Не удалось загрузить историю.");

  const groups = groupChatsByDate(r.chats || []);

  const body = `
    <div class="sub">История чатов отсортирована по датам. Можно закрепить любимый чат.</div>
    <div class="hr"></div>
    <div class="list">
      ${Object.keys(groups).map(date => `
        <div class="card" style="padding:12px;">
          <div class="h"><h2>${escapeHtml(date)}</h2></div>
          <div class="hr"></div>
          <div class="list">
            ${groups[date].map(c => `
              <div class="item" data-open-chat="${c.id}">
                <div class="check">${c.pinned ? "📌" : "💬"}</div>
                <p>
                  ${escapeHtml(c.title)}
                  <small>${new Date(c.updated_at).toLocaleString()}</small>
                </p>
                <button class="btn ghost" data-pin="${c.id}" style="margin-left:auto;">${c.pinned ? "Unpin" : "Pin"}</button>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  openModal({ title: "История чатов", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });

  elModalRoot.querySelectorAll("[data-open-chat]").forEach(row => {
    row.onclick = async (e) => {
      // если нажали на кнопку pin — не открываем чат
      if (e.target && e.target.closest("[data-pin]")) return;
      const id = row.getAttribute("data-open-chat");
      closeModal();
      await loadChat(id);
    };
  });

  elModalRoot.querySelectorAll("[data-pin]").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-pin");
      const rr = await API.post(`/api/chats/${id}/pin`, {});
      if (!rr.ok) return toast("Ошибка", "Не удалось закрепить.");
      toast("Готово", rr.pinned ? "Чат закреплён." : "Чат откреплён.");
      openChatHistory();
    };
  });
}

function groupChatsByDate(chats) {
  const out = {};
  chats.forEach(c => {
    const d = new Date(c.created_at);
    const key = d.toLocaleDateString();
    out[key] = out[key] || [];
    out[key].push(c);
  });
  return out;
}

function openStats() {
  const p = state.profile?.profile;
  const t = p?.totals || { messages: 0, images: 0 };

  const body = `
    <div class="card" style="padding:12px;">
      <div class="h"><h2>Статистика пользования</h2></div>
      <div class="hr"></div>
      <div class="sub">
        Всего сообщений (user): <b>${t.messages}</b><br/>
        Всего фото: <b>${t.images}</b>
      </div>
      <div class="hr"></div>
      <div class="sub">Эта статистика помогает видеть ценность и прогресс.</div>
    </div>
  `;
  openModal({ title: "Статистика", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });
}

function openModelPlans() {
  const body = `
    <div class="sub">Выбери уровень. Free — быстрый чат. Velora+ / Full — Pro-модель, больше лимитов и возможностей.</div>
    <div class="hr"></div>

    <div class="row">
      ${planCard("Free Plan", "FREE", "0€", [
        "Free модель (Local)",
        "20 сообщений/день",
        "История чатов сохраняется",
        "Без генерации фото"
      ])}
      ${planCard("Velora+", "PLUS", "15€ / мес", [
        "Pro модель (GPT)",
        "200 сообщений/день",
        "30 фото/день",
        "Приоритет и быстрые ответы"
      ])}
      ${planCard("Velora Full", "FULL", "25€ / мес", [
        "Pro модель (GPT) + максимум лимитов",
        "500 сообщений/день",
        "100 фото/день",
        "Максимальная глубина и скорость"
      ])}
    </div>

    <div class="hr"></div>
    <div class="sub">Покупку/оплату подключим следующим шагом. Сейчас это витрина + логика доступа.</div>
  `;

  openModal({ title: "Подписки и модели", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });
  elModalRoot.querySelectorAll("[data-upgrade]").forEach(btn => {
    btn.onclick = () => toast("Скоро", "Оплата будет подключена отдельно.");
  });
}

function planCard(title, code, price, bullets) {
  return `
    <div class="card" style="padding:12px;">
      <div class="h">
        <h2>${escapeHtml(title)}</h2>
        <div class="pill"><span class="tag"></span> <b>${escapeHtml(price)}</b></div>
      </div>
      <div class="hr"></div>
      <div class="sub">
        ${bullets.map(x => `• ${escapeHtml(x)}`).join("<br/>")}
      </div>
      <div class="hr"></div>
      <button class="btn primary" data-upgrade="${code}" style="width:100%;">Upgrade</button>
    </div>
  `;
}

function openAiSettings() {
  const s = state.profile?.profile?.settings || { tone: "soft", length: "normal", language: "ru" };

  const body = `
    <div class="sub">Настрой поведение Velora AI под себя. Эти параметры сохраняются в твоём профиле.</div>
    <div class="hr"></div>

    <label class="sub">Тон</label>
    <select id="toneSel" class="input" style="margin-top:8px;">
      <option value="soft" ${s.tone==="soft"?"selected":""}>Мягко</option>
      <option value="neutral" ${s.tone==="neutral"?"selected":""}>Нейтрально</option>
      <option value="tough" ${s.tone==="tough"?"selected":""}>Жёстко</option>
    </select>

    <div style="height:10px;"></div>

    <label class="sub">Длина ответа</label>
    <select id="lenSel" class="input" style="margin-top:8px;">
      <option value="short" ${s.length==="short"?"selected":""}>Коротко</option>
      <option value="normal" ${s.length==="normal"?"selected":""}>Нормально</option>
      <option value="long" ${s.length==="long"?"selected":""}>Подробно</option>
    </select>

    <div style="height:10px;"></div>

    <label class="sub">Язык по умолчанию</label>
    <select id="langSel" class="input" style="margin-top:8px;">
      <option value="ru" ${s.language==="ru"?"selected":""}>Русский</option>
      <option value="en" ${s.language==="en"?"selected":""}>English</option>
      <option value="fr" ${s.language==="fr"?"selected":""}>Français</option>
    </select>

    <div class="hr"></div>
    <button class="btn primary" id="saveSettings" style="width:100%;">Сохранить</button>
  `;

  openModal({ title: "Настройки AI", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });

  document.getElementById("saveSettings").onclick = async () => {
    const tone = document.getElementById("toneSel").value;
    const length = document.getElementById("lenSel").value;
    const language = document.getElementById("langSel").value;

    const r = await API.post("/api/profile/settings", { tone, length, language });
    if (!r.ok) return toast("Ошибка", "Не удалось сохранить.");
    toast("Готово", "Настройки AI сохранены.");
    await refreshProfileSilent();
    closeModal();
  };
}

function openPayments() {
  const pay = state.profile?.profile?.payments || {};
  const history = pay.history || [];

  const body = `
    <div class="card" style="padding:12px;">
      <div class="h"><h2>Платёжная вкладка</h2></div>
      <div class="hr"></div>
      <div class="sub">
        Текущий план: <b>${escapeHtml(planLabel(state.user.plan))}</b><br/>
        Дата приобретения: <b>${pay.startsAt ? new Date(pay.startsAt).toLocaleString() : "—"}</b><br/>
        Дата окончания: <b>${pay.endsAt ? new Date(pay.endsAt).toLocaleString() : "—"}</b>
      </div>
      <div class="hr"></div>
      <button class="btn primary" id="renewBtn" style="width:100%;">Продлить (скоро)</button>
    </div>

    <div style="height:10px;"></div>

    <div class="card" style="padding:12px;">
      <div class="h"><h2>История платежей</h2></div>
      <div class="hr"></div>
      ${
        history.length
          ? `<div class="list">${history.map(h => `
              <div class="item">
                <div class="check">💳</div>
                <p>${escapeHtml(h.plan)} • ${h.amount_eur}€ <small>${new Date(h.created_at).toLocaleString()}</small></p>
              </div>
            `).join("")}</div>`
          : `<div class="sub">Пока платежей нет. Подключим оплату — и тут появится история.</div>`
      }
    </div>
  `;

  openModal({ title: "Платежи", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });
  document.getElementById("renewBtn").onclick = () => toast("Скоро", "Продление и оплаты подключим отдельным шагом.");
}

async function boot() {
  const me = await API.get("/api/me");
  state.user = me.user;

  if (state.user) {
    await refreshProfileSilent();
    // загрузим первый чат или создадим
    const list = await API.get("/api/chats");
    if (list.ok && list.chats?.length) {
      state.activeChatId = list.chats[0].id;
      await loadChat(state.activeChatId);
      return;
    }
    await createNewChat();
  }

  renderChat();
}

boot();
// ===== AUTH FUNCTIONS =====

async function register(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

    await sendEmailVerification(userCredential.user);
    toast("Успех", "Регистрация выполнена");
   toast("Проверь почту", "Мы отправили письмо. Подтверди email и только потом входи.");
await signOut(firebaseAuth);
return;
    console.log("Registered:", userCredential.user);
  } catch (error) {
    console.error(error);
    toast("Ошибка", error.message);
  }
}

async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const user = userCredential.user;

// 🚫 запрещаем вход если почта не подтверждена
if (!user.emailVerified) {
  await signOut(firebaseAuth);
  toast("Подтверди почту", "Сначала подтвердите email из письма.");
  return;
}
    toast("Успех", "Вход выполнен");
    await bootAfterAuth("firebase");
    console.log("Logged in:", userCredential.user);
  } catch (error) {
    console.error(error);
    toast("Ошибка", error.message);
  }
}

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const user = result.user;
    toast("успех", "Вход через Google выполнен");
await bootAfterAuth("firebase");
console.log("Google login:", result.user);
  } catch (error) {
    console.error(error);
    toast("Ошибка", error.message);
  }
}
// ===== AUTH STATE (авто-вход/выход) =====
onAuthStateChanged(firebaseAuth, async (user) => {
  try {
    if (!user) {
      state.user = null;
      // показываем UI как "гость", модалку НЕ обязаны открывать автоматически
      // (если хочешь автопоказ — можно сделать authModal.style.display = "flex";)
      return;
    }

    // user есть → грузим приложение
    await bootAfterAuth("firebase");
  } catch (err) {
    console.error("onAuthStateChanged error:", err);
  }
});
const openAuthBtn = document.getElementById("openAuthBtn");
const authModal = document.getElementById("authModal");

openAuthBtn?.addEventListener("click", () => {
  authModal.style.display = "flex";
});
document.getElementById("registerBtn")?.addEventListener("click", () => {
  const email = document.getElementById("authEmail")?.value || "";
  const password = document.getElementById("authPassword")?.value || "";
  register(email, password);
});

document.getElementById("googleBtn")?.addEventListener("click", () => {
  loginWithGoogle();
});
document.addEventListener("click", async (e) => {

  const logoutBtn = e.target.closest("#logoutBtn");
  if (!logoutBtn) return;

  console.log("LOGOUT CLICK ✅");

  try {

    console.log("signOut is:", typeof signOut);
    console.log("before:", firebaseAuth.currentUser?.email);

    await signOut(firebaseAuth);

    console.log("after:", firebaseAuth.currentUser);

    state.user = null;

    location.reload();

  }catch (err) {
    console.error("LOGOUT ERROR ❌", err);
  }
});