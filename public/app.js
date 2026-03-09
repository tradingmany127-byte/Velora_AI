// ----- Firebase (Browser, no bundler) -----
import { 
  firebaseAuth, 
  googleProvider,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  signOut
} from "./firebase.js";

let loginTime = 0;

// Общая функция для получения авторизационных заголовков
async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  
  // Проверяем именно Firebase auth, а не state.user
  const user = firebaseAuth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (error) {
      console.error("Failed to get auth token:", error);
    }
  }
  
  return headers;
}

const API = {
  async get(url) {
    const headers = await getAuthHeaders();
    
    const r = await fetch(url, { 
      headers,
      credentials: "include" 
    });
    const data = await r.json();
    
    // Если Firebase user существует, а backend возвращает UNAUTHORIZED - это реальная ошибка
    if (data.error === "UNAUTHORIZED" && firebaseAuth.currentUser) {
      data.sessionExpired = true;
    }
    
    return data;
  },
  async post(url, body) {
    const headers = await getAuthHeaders();
    
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      credentials: "include"
    });
    const data = await r.json();
    
    // Если Firebase user существует, а backend возвращает UNAUTHORIZED - это реальная ошибка
    if (data.error === "UNAUTHORIZED" && firebaseAuth.currentUser) {
      data.sessionExpired = true;
    }
    
    return data;
  },
  async delete(url) {
    const headers = await getAuthHeaders();
    
    const r = await fetch(url, {
      method: "DELETE",
      headers,
      credentials: "include"
    });
    const data = await r.json();
    
    // Если Firebase user существует, а backend возвращает UNAUTHORIZED - это реальная ошибка
    if (data.error === "UNAUTHORIZED" && firebaseAuth.currentUser) {
      data.sessionExpired = true;
    }
    
    return data;
  }
};

const state = {
  user: null,
  profile: null,
  activeChatId: null,
  activeMode: "free", // free | pro
  guestSession: [], // не сохраняем в localStorage, только RAM
};

let elApp, elModalRoot, elToasts, elWelcome;

function initDOMElements() {
  elApp = document.getElementById("app");
  elModalRoot = document.getElementById("modalRoot");
  elToasts = document.getElementById("toasts");
  elWelcome = document.getElementById("welcome");
}

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

function updateModalToVerification() {
  elModalRoot.innerHTML = `
    <div class="modal fadeIn">
      <div class="head">
        <h3>Подтверждение email</h3>
        <button class="btn ghost" data-close="1">✕</button>
      </div>
      <div class="body">
        <div class="sub">
          Мы отправили письмо для подтверждения почты.
          Подтвердите email и нажмите "Я подтвердил — продолжить".
        </div>
        <div class="hr"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="resendVerifyBtn">Отправить письмо ещё раз</button>
          <button class="btn primary" id="checkVerifyBtn">Я подтвердил — продолжить</button>
        </div>
      </div>
    </div>
  `;
  elModalRoot.querySelectorAll("[data-close]").forEach(b => b.onclick = () => closeModal());
  elModalRoot.onclick = (e) => { if (e.target === elModalRoot) closeModal(); };
}

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
            <div class="modeBtn ${state.activeMode==="free"?"active":""}" data-mode="free">Velora Free</div>
            <div class="modeBtn ${state.activeMode==="pro"?"active":""}" data-mode="pro">Velora Pro</div>
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
  const brandHome = document.getElementById("brandHome");
  if (brandHome) brandHome.onclick = () => renderChat();

  if (!state.user) {
    const authBtn = document.getElementById("authBtn");
    if (authBtn) authBtn.onclick = () => openAuthModal();
  } else {
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) profileBtn.onclick = () => openProfile();
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) newChatBtn.onclick = () => createNewChat();
  }

  elApp.querySelectorAll("[data-mode]").forEach(b => {
    b.onclick = () => {
      const m = b.getAttribute("data-mode");
      state.activeMode = m;

      // Pro 
      if (m === "pro" && (!state.profile || !state.profile.profile?.limits?.pro)) {
        state.activeMode = "free";
        toast("Velora Pro", "Этот чат доступен только для пользователей с подпиской Velora Pro или Velora Ultra.");
      }
      renderChat();
      renderMessages();
    };
  });

  // send
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.onclick = () => sendMessage(input?.value || "");
  if (input) input.onkeydown = (e) => {
    if (e.key === "Enter") sendMessage(input?.value || "");
  };

  renderMessages();
}

  
function renderMessages() {
  const log = document.getElementById("chatLog");
  if (!log) return;
  
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
  // Если пользователь не авторизован в Firebase, создаем локальный гостевой чат
  if (!firebaseAuth.currentUser) {
    state.guestSession = [];
    state.activeChatId = null;
    toast("Готово", "Новый гостевой чат создан.");
    renderChat();
    return;
  }

  // Для авторизованных пользователей создаем чат на сервере
  try {
    // Генерируем название чата по умолчанию
    const chatTitle = await generateChatTitle();
    
    const r = await API.post("/api/chats/new", { title: chatTitle });
    
    if (!r.ok) {
      if (r.error === "UNAUTHORIZED") {
        // Если получили UNAUTHORIZED, это проблема с токеном - не сбрасываем auth state
        toast("Ошибка авторизации", "Пожалуйста, обновите страницу и войдите снова.");
        return;
      }
      
      return toast("Ошибка", r.error || "Не удалось создать чат.");
    }
    
    state.activeChatId = r.chatId;
    state.currentMessages = [];
    toast("Готово", `Создан чат "${chatTitle}".`);
    renderChat();
    
  } catch (error) {
    console.error("Create chat error:", error);
    toast("Ошибка", "Не удалось создать чат. Попробуйте снова.");
  }
}

// Генерация названия чата по умолчанию
async function generateChatTitle() {
  if (!firebaseAuth.currentUser) return "Чат 1";
  
  try {
    const r = await API.get("/api/chats");
    if (r.ok && r.chats) {
      const existingTitles = r.chats
        .map(chat => chat.title)
        .filter(title => title.startsWith("Чат "))
        .map(title => {
          const num = parseInt(title.replace("Чат ", ""));
          return isNaN(num) ? 0 : num;
        });
      
      let nextNumber = 1;
      while (existingTitles.includes(nextNumber)) {
        nextNumber++;
      }
      
      return `Чат ${nextNumber}`;
    }
  } catch (error) {
    console.error("Failed to generate chat title:", error);
  }
  
  return "Чат 1";
}

async function loadChat(chatId) {
  // Проверяем наличие Firebase пользователя перед API вызовом
  if (!firebaseAuth.currentUser) {
    toast("Ошибка", "Загрузка чатов доступна после входа в аккаунт.");
    return;
  }

  try {
    const r = await API.get(`/api/chats/${chatId}`);
    
    if (!r.ok) {
      if (r.error === "UNAUTHORIZED") {
        // Если получили UNAUTHORIZED, это проблема с токеном - не сбрасываем auth state
        toast("Ошибка авторизации", "Пожалуйста, обновите страницу и войдите снова.");
        return;
      }
      
      return toast("Ошибка", r.error || "Не удалось открыть чат.");
    }
    
    state.activeChatId = chatId;
    state.currentMessages = (r.messages || []).map(x => ({
      role: x.role === "user" ? "user" : "assistant",
      content: x.content
    }));
    renderChat();
    
  } catch (error) {
    console.error("Load chat error:", error);
    toast("Ошибка", "Не удалось открыть чат. Попробуйте снова.");
  }
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
      toast("Velora Pro", "Этот чат доступен только для пользователей с подпиской Velora Pro или Velora Ultra.");
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
  // Блокируем скролл на body
  document.body.style.overflow = 'hidden';
  document.body.classList.add('no-scroll');
  
  elModalRoot.classList.remove("hidden");
  elModalRoot.innerHTML = `
    <div class="modal fadeIn">
      <div class="head">
        <h3>${escapeHtml(title || "")}</h3>
        <button class="btn ghost" data-close="1">✕</button>
      </div>
      <div class="body">${body || ""}</div>
    </div>
  `;
  elModalRoot.querySelectorAll("[data-close]").forEach(b => b.onclick = () => closeModal());
  elModalRoot.onclick = (e) => { if (e.target === elModalRoot) closeModal(); };
}

function closeModal() {
  // Возвращаем скролл body
  document.body.style.overflow = '';
  document.body.classList.remove('no-scroll');
  
  elModalRoot.classList.add("hidden");
  elModalRoot.innerHTML = "";
}

function showWelcome(name) {
  // Проверяем первый ли это визит
  const isFirstVisit = !localStorage.getItem('velora_welcome_seen');
  
  // Если пользователь уже видел приветствие - не показываем
  if (!isFirstVisit) {
    renderChat();
    return;
  }
  
  elWelcome.classList.remove("hidden");
  elWelcome.innerHTML = `
    <div class="welcomePanelPremium">
      <div class="welcomeGlow"></div>
      <h1>Добро пожаловать в Velora AI</h1>
      
      <div class="welcomeMessages">
        <div class="welcomeMessage" style="animation-delay: 0.6s">
          <strong>Здесь идеи превращаются в проекты,</strong><br/>
          а мысли — в реальные результаты.
        </div>
        <div class="welcomeMessage" style="animation-delay: 1.2s">
          <strong>Velora создана, чтобы помогать вам</strong><br/>
          думать быстрее, создавать больше и достигать целей легче.
        </div>
        <div class="welcomeMessage" style="animation-delay: 1.8s">
          <strong>Velora — это больше чем инструмент.</strong><br/>
          Это интеллектуальный помощник, который работает рядом с вами.
        </div>
        <div class="welcomeMessage" style="animation-delay: 2.4s">
          <strong>Каждый большой проект начинается</strong><br/>
          с одной идеи. Velora поможет вам превратить её во что-то большее.
        </div>
        <div class="welcomeMessage" style="animation-delay: 3.0s">
          <strong>Вы здесь не случайно.</strong><br/>
          Возможно именно сегодня начнётся ваш следующий большой проект.
        </div>
        <div class="welcomeMessage" style="animation-delay: 3.6s">
          <strong>Velora готова помочь.</strong><br/>
          Давайте создадим что-то по-настоящему интересное.
        </div>
      </div>
      
      <div class="welcomeButtons">
        <button class="welcomeBtnPrimary" id="startWithVeloraBtn">
          Начать с Velora
          <div class="welcomeBtnSubtext">Создать аккаунт и открыть все возможности</div>
        </button>
        
        <button class="welcomeBtnSecondary" id="justLookBtn">
          Пока просто посмотреть
          <div class="welcomeBtnSubtext">Открыть интерфейс и познакомиться с Velora</div>
        </button>
      </div>
    </div>
  `;
  
  // Обработчики кнопок
  document.getElementById("startWithVeloraBtn").onclick = () => {
    elWelcome.classList.add("hidden");
    elWelcome.innerHTML="";
    // Сразу сохраняем флаг первого визита
    localStorage.setItem('velora_welcome_seen', 'true');
    // Открываем модальное окно регистрации
    openAuthModal();
  };
  
  document.getElementById("justLookBtn").onclick = () => {
    elWelcome.classList.add("hidden");
    elWelcome.innerHTML="";
    // Сразу сохраняем флаг первого визита
    localStorage.setItem('velora_welcome_seen', 'true');
    // Открываем основной интерфейс в гостевом режиме
    renderChat();
  };
  
  // Закрытие по клику на фон
  elWelcome.onclick = (e) => {
    if (e.target === elWelcome) {
      elWelcome.classList.add("hidden");
      elWelcome.innerHTML="";
      // Сразу сохраняем флаг первого визита
      localStorage.setItem('velora_welcome_seen', 'true');
      renderChat();
    }
  };
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
    </div>

    <div class="hr"></div>
    <div class="sub">Или:</div>
    <button class="btn" id="googleBtn" style="width:100%; margin-top:8px;">Войти через Google</button>
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
  
  const regBtn = document.getElementById("regBtn");
  if (regBtn) {
    regBtn.onclick = async () => {
      const email = document.getElementById("regEmail")?.value?.trim();
      const password = document.getElementById("regPass")?.value;
      await register(email, password);
    };
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.onclick = async () => {
      const email = document.getElementById("loginEmail")?.value?.trim();
      const password = document.getElementById("loginPass")?.value;
      await login(email, password);
    };
  }
}

async function bootAfterAuth(source) {
  if (window._bootAfterAuthCompleted) return;
  
  // 1) берем пользователя из Firebase
  const u = firebaseAuth.currentUser;
  if (!u) return;

  // обязательно: обновляем данные пользователя (emailVerified)
  await u.reload();

  // 2) кладем в state.user так, как ожидает твой UI
  state.user = {
    id: u.uid,
    email: u.email,
    name: u.displayName || (u.email ? u.email.split("@")[0] : "user"),
    provider: u.providerData?.[0]?.providerId || "password",
  };

  // 3) Небольшая задержка для обновления токена на сервере
  await new Promise(resolve => setTimeout(resolve, 100));

  // 4) загружаем профиль пользователя
  if (typeof refreshProfileSilent === "function") {
    await refreshProfileSilent();
  }
  closeModal?.();

  // 5) Показываем основной интерфейс без автоматического создания чата
  renderChat?.();
  
  // ВАЖНО: Помечаем, что bootAfterAuth уже выполнен
  window._bootAfterAuthCompleted = true;
}

  

async function refreshProfileSilent() {
  if (!firebaseAuth.currentUser) return;
  try {
    const r = await API.get("/api/profile");
    if (r.ok) state.profile = r;
  } catch (error) {
    // Не показываем ошибку UNAUTHORIZED при первом входе
    console.log("Profile refresh silent error:", error);
  }
}

function planLabel(plan) {
  if (plan === "FULL") return "Velora Full";
  if (plan === "PLUS") return "Velora+";
  return "Free Plan";
}

function formatChatDate(dateString) {
  if (!dateString) return "";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return `${diffDays} дней назад`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "неделю" : weeks < 5 ? "недели" : "недель"} назад`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "месяц" : months < 5 ? "месяца" : "месяцев"} назад`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"} назад`;
  }
}

function openProfile() {
  if (!firebaseAuth.currentUser) return openAuthModal();

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

  const upgradeBtn = document.getElementById("upgradeBtn");
  if (upgradeBtn) {
    upgradeBtn.onclick = () => openModelPlans();
  }
  const logoutItem = document.getElementById("logoutItem");
  if (logoutItem) {
    logoutItem.onclick = async () => {
      const r = await API.post("/api/auth/logout", {});
      if (r.ok) {
        await signOut(firebaseAuth);
        state.user = null;
        state.profile = null;
        state.activeChatId = null;
        state.currentMessages = [];
        // Очищаем флаг bootAfterAuth при выходе
        window._bootAfterAuthCompleted = false;
        toast("Готово", "Вы вышли из аккаунта.");
        closeModal();
        renderChat();
      }
    };
  }

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
  // Если пользователь не авторизован в Firebase, показываем гостевое состояние
  if (!firebaseAuth.currentUser) {
    const body = `
      <div class="chatHistoryHeader">
        <div class="sub">Войдите в аккаунт, чтобы сохранять и просматривать историю чатов.</div>
        <button class="btn primary" id="registerFromHistoryBtn" style="margin-top:12px;">
          📝 Создать аккаунт
        </button>
      </div>
      
      <div class="hr"></div>
      
      <div class="emptyState" style="text-align:center; padding:40px; color:var(--muted);">
        <div style="font-size:48px; margin-bottom:16px;">👤</div>
        <div style="font-size:18px; margin-bottom:8px;">Гостевой режим</div>
        <div style="font-size:14px;">Войдите в аккаунт чтобы сохранять историю чатов</div>
      </div>
    `;

    openModal({ 
      title: "История чатов", 
      body, 
      footer: `<button class="btn" data-close="1">Закрыть</button>`,
      size: "large"
    });

    const registerBtn = document.getElementById("registerFromHistoryBtn");
    if (registerBtn) {
      registerBtn.onclick = () => {
        closeModal();
        openAuthModal();
      };
    }
    return;
  }

  // Для авторизованных пользователей загружаем историю
  try {
    const r = await API.get("/api/chats");
    
    if (!r.ok) {
      if (r.error === "UNAUTHORIZED") {
        // Если получили UNAUTHORIZED, это проблема с токеном - не сбрасываем auth state
        toast("Ошибка авторизации", "Пожалуйста, обновите страницу и войдите снова.");
        return;
      }
      
      return toast("Ошибка", r.error || "Не удалось загрузить историю чатов.");
    }

    const chats = r.chats || [];

    // Сортируем: закреплённые вверху, потом по дате обновления
    const sortedChats = [...chats].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    const body = `
      <div class="chatHistoryHeader">
        <div class="sub">У вас ${chats.length} чатов. Закреплённые всегда вверху.</div>
        <div style="margin-top:12px;">
          <input id="chatSearchInput" class="input" placeholder="🔍 Поиск по названию чата..." style="width:100%;">
        </div>
        <button class="btn primary" id="createNewChatBtn" style="margin-top:12px;">
          ➕ Создать новый чат
        </button>
      </div>
      
      <div class="hr"></div>
      
      <div class="chatHistoryList" id="chatHistoryList">
        ${sortedChats.length === 0 ? `
          <div class="emptyState" style="text-align:center; padding:40px; color:var(--muted);">
            <div style="font-size:48px; margin-bottom:16px;">💬</div>
            <div style="font-size:18px; margin-bottom:8px;">Нет чатов</div>
            <div style="font-size:14px;">Начните общение с Velora AI</div>
          </div>
        ` : sortedChats.map(c => `
          <div class="chatHistoryItem" data-chat-id="${c.id}" data-pinned="${c.pinned}" data-title="${escapeHtml(c.title).toLowerCase()}">
            <div class="chatHistoryMain" data-open-chat="${c.id}">
              <div class="chatHistoryIcon">
                ${c.pinned ? "📌" : "💬"}
              </div>
              
              <div class="chatHistoryContent">
                <div class="chatHistoryTitle">
                  ${escapeHtml(c.title)}
                  <div class="chatHistoryActions">
                    <button class="chatHistoryMenuBtn" data-menu="${c.id}">⋮</button>
                  </div>
                </div>
                
                <div class="chatHistoryPreview">
                  ${c.last_message ? escapeHtml(c.last_message).substring(0, 100) + (c.last_message.length > 100 ? "..." : "") : "Нет сообщений"}
                </div>
                
                <div class="chatHistoryMeta">
                  <span class="chatHistoryDate">${formatChatDate(c.updated_at)}</span>
                  <span class="chatHistoryMessageCount">${c.message_count || 0} сообщений</span>
                </div>
              </div>
            </div>
            
            <div class="chatHistoryMenu" id="menu-${c.id}" style="display:none;">
              <button class="chatHistoryMenuItem" data-action="rename" data-chat-id="${c.id}">
                ✏️ Переименовать
              </button>
              <button class="chatHistoryMenuItem" data-action="pin" data-chat-id="${c.id}">
                ${c.pinned ? "📍 Открепить" : "📌 Закрепить"}
              </button>
              <button class="chatHistoryMenuItem danger" data-action="delete" data-chat-id="${c.id}">
                🗑️ Удалить
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    openModal({ 
      title: "История чатов", 
      body, 
      footer: `<button class="btn" data-close="1">Закрыть</button>`,
      size: "large"
    });

    // Добавляем поиск
    const searchInput = document.getElementById("chatSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll(".chatHistoryItem");
        
        items.forEach(item => {
          const title = item.dataset.title || "";
          if (title.includes(query)) {
            item.style.display = "block";
          } else {
            item.style.display = "none";
          }
        });
      });
    }

    // Обработчик создания нового чата
    const createNewChatBtn = document.getElementById("createNewChatBtn");
    if (createNewChatBtn) {
      createNewChatBtn.onclick = async () => {
        closeModal();
        await createNewChat();
      };
    }

    // Обработчики открытия чатов
    document.querySelectorAll("[data-open-chat]").forEach(item => {
      item.onclick = async (e) => {
        // Если клик на меню или кнопке меню - не открываем чат
        if (e.target.closest("[data-menu]") || e.target.closest(".chatHistoryMenu")) return;
        
        const chatId = item.getAttribute("data-open-chat");
        closeModal();
        await loadChat(chatId);
      };
    });

    // Обработчики меню
    document.querySelectorAll(".chatHistoryMenuBtn").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const chatId = btn.getAttribute("data-menu");
        const menu = document.getElementById(`menu-${chatId}`);
        
        // Закрываем все другие меню
        document.querySelectorAll(".chatHistoryMenu").forEach(m => {
          if (m !== menu) m.style.display = "none";
        });
        
        // Переключаем текущее меню
        menu.style.display = menu.style.display === "none" ? "block" : "none";
      };
    });

    // Обработчики действий в меню
    document.querySelectorAll(".chatHistoryMenuItem").forEach(item => {
      item.onclick = async (e) => {
        e.stopPropagation();
        const action = item.getAttribute("data-action");
        const chatId = item.getAttribute("data-chat-id");
        const chat = chats.find(c => c.id === chatId);
        
        // Закрываем меню
        document.getElementById(`menu-${chatId}`).style.display = "none";
        
        if (action === "rename") {
          await renameChat(chatId, chat.title);
        } else if (action === "pin") {
          await togglePinChat(chatId, !chat.pinned);
        } else if (action === "delete") {
          await deleteChat(chatId, chat.title);
        }
      };
    });

    // Закрытие меню при клике вне
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.chatHistoryItem')) {
        document.querySelectorAll('.chatHistoryMenu').forEach(menu => {
          menu.style.display = 'none';
        });
      }
    });
  } catch (error) {
    console.error("Chat history error:", error);
    toast("Ошибка", "Не удалось загрузить историю чатов. Попробуйте снова.");
  }
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
  const upgradeBtns = elModalRoot.querySelectorAll("[data-upgrade]");
  upgradeBtns.forEach(btn => {
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
    <div class="sub">Настрой поведения Velora AI под себя. Эти параметры сохраняются в твоём профиле.</div>
    <div class="hr"></div>

    <label class="sub">Тон</label>
    <div class="custom-dropdown" data-dropdown="tone">
      <div class="custom-dropdown-trigger" data-value="${s.tone}">
        <span>${s.tone === "soft" ? "Мягко" : s.tone === "neutral" ? "Нейтрально" : "Жёстко"}</span>
        <svg class="custom-dropdown-arrow" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </div>
      <div class="custom-dropdown-menu">
        <div class="custom-dropdown-option ${s.tone === "soft" ? "selected" : ""}" data-value="soft">Мягко</div>
        <div class="custom-dropdown-option ${s.tone === "neutral" ? "selected" : ""}" data-value="neutral">Нейтрально</div>
        <div class="custom-dropdown-option ${s.tone === "tough" ? "selected" : ""}" data-value="tough">Жёстко</div>
      </div>
    </div>

    <div style="height:10px;"></div>

    <label class="sub">Длина ответа</label>
    <div class="custom-dropdown" data-dropdown="length">
      <div class="custom-dropdown-trigger" data-value="${s.length}">
        <span>${s.length === "short" ? "Коротко" : s.length === "normal" ? "Нормально" : "Подробно"}</span>
        <svg class="custom-dropdown-arrow" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </div>
      <div class="custom-dropdown-menu">
        <div class="custom-dropdown-option ${s.length === "short" ? "selected" : ""}" data-value="short">Коротко</div>
        <div class="custom-dropdown-option ${s.length === "normal" ? "selected" : ""}" data-value="normal">Нормально</div>
        <div class="custom-dropdown-option ${s.length === "long" ? "selected" : ""}" data-value="long">Подробно</div>
      </div>
    </div>

    <div style="height:10px;"></div>

    <label class="sub">Язык по умолчанию</label>
    <div class="custom-dropdown" data-dropdown="language">
      <div class="custom-dropdown-trigger" data-value="${s.language}">
        <span>${s.language === "ru" ? "Русский" : s.language === "en" ? "English" : "Français"}</span>
        <svg class="custom-dropdown-arrow" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </div>
      <div class="custom-dropdown-menu">
        <div class="custom-dropdown-option ${s.language === "ru" ? "selected" : ""}" data-value="ru">Русский</div>
        <div class="custom-dropdown-option ${s.language === "en" ? "selected" : ""}" data-value="en">English</div>
        <div class="custom-dropdown-option ${s.language === "fr" ? "selected" : ""}" data-value="fr">Français</div>
      </div>
    </div>

    <div class="hr"></div>
    <button class="btn primary" id="saveSettings" style="width:100%;">Сохранить</button>
  `;

  openModal({ title: "Настройки AI", body, footer: `<button class="btn" data-close="1">Закрыть</button>` });

  // Initialize custom dropdowns
  initCustomDropdowns();

  const saveSettings = document.getElementById("saveSettings");
  if (saveSettings) {
    saveSettings.onclick = async () => {
      const tone = document.querySelector('[data-dropdown="tone"] .custom-dropdown-trigger').dataset.value;
      const length = document.querySelector('[data-dropdown="length"] .custom-dropdown-trigger').dataset.value;
      const language = document.querySelector('[data-dropdown="language"] .custom-dropdown-trigger').dataset.value;

      const r = await API.post("/api/profile/settings", { tone, length, language });
      if (!r.ok) return toast("Ошибка", "Не удалось сохранить.");
      toast("Готово", "Настройки AI сохранены.");
      await refreshProfileSilent();
      closeModal();
    };
  }
}

// Custom dropdown functionality
function initCustomDropdowns() {
  const dropdowns = document.querySelectorAll('.custom-dropdown');
  
  dropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector('.custom-dropdown-trigger');
    const menu = dropdown.querySelector('.custom-dropdown-menu');
    const options = dropdown.querySelectorAll('.custom-dropdown-option');
    
    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Close all other dropdowns
      document.querySelectorAll('.custom-dropdown-menu.show').forEach(otherMenu => {
        if (otherMenu !== menu) {
          otherMenu.classList.remove('show');
          otherMenu.closest('.custom-dropdown').querySelector('.custom-dropdown-trigger').classList.remove('active');
        }
      });
      
      // Toggle current dropdown
      menu.classList.toggle('show');
      trigger.classList.toggle('active');
    });
    
    // Select option
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const value = option.dataset.value;
        const text = option.textContent;
        
        // Update trigger
        trigger.dataset.value = value;
        trigger.querySelector('span').textContent = text;
        
        // Update selected state
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Close dropdown
        menu.classList.remove('show');
        trigger.classList.remove('active');
      });
    });
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown-menu.show').forEach(menu => {
      menu.classList.remove('show');
      menu.closest('.custom-dropdown').querySelector('.custom-dropdown-trigger').classList.remove('active');
    });
  });
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
  const renewBtn = document.getElementById("renewBtn");
  if (renewBtn) {
    renewBtn.onclick = () => toast("Скоро", "Продление и оплаты подключим отдельным шагом.");
  }
}

async function boot() {
  // 0. Инициализируем DOM элементы
  initDOMElements();
  
  // 1. Сначала проверяем welcome - ДО auth-логики
  const isFirstVisit = !localStorage.getItem('velora_welcome_seen');
  if (isFirstVisit) {
    showWelcome('гость');
    return; // Останавливаем, пока пользователь не выберет действие
  }
  
  // 2. Потом auth-логика - работает независимо от welcome
  onAuthStateChanged(firebaseAuth, async (user) => {
    // 🚨 Пропускаем, если bootAfterAuth уже выполнен
    if (window._bootAfterAuthCompleted) return;
    
    if (user) {
      await refreshProfileSilent();
      // загрузим первый чат или создадим
      const list = await API.get("/api/chats");
      if (list.ok && list.chats?.length) {
        state.activeChatId = list.chats[0].id;
        await loadChat(state.activeChatId);
        return;
      }
      if (list._silentAuthError) {
  console.warn("Silent auth error:", list._silentAuthError);
}
      await createNewChat();
    }
    
    // 3. Всегда показываем интерфейс (для авторизованных и гостей)
    renderChat();
  });
}

boot();
// ===== AUTH FUNCTIONS =====

async function register(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await sendEmailVerification(userCredential.user);
    toast("Успех", "Регистрация выполнена. Мы отправили письмо для подтверждения почты.");
    // Изменить модалку на сообщение о подтверждении
    updateModalToVerification();
    console.log("Registered:", userCredential.user);
  } catch (error) {
    console.error(error);
    let message = "Ошибка регистрации";
    switch (error.code) {
      case 'auth/email-already-in-use':
        message = "Этот email уже зарегистрирован. Попробуйте войти.";
        break;
      case 'auth/invalid-email':
        message = "Введите корректный email";
        break;
      case 'auth/weak-password':
        message = "Пароль слишком слабый";
        break;
      default:
        message = error.message;
    }
    toast("Ошибка", message);
  }
}

async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      toast("Подтверди почту", "Пожалуйста подтвердите почту");
      updateModalToVerification();
      return;
    }

    // Create server session via Firebase bridge
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Failed to create session");
    }

    toast("Успех", "Вход выполнен");
    loginTime = Date.now(); // Устанавливаем время входа
    await bootAfterAuth("firebase");
    console.log("Logged in:", userCredential.user);
  } catch (error) {
    console.error(error);
    let message = "Ошибка входа";
    switch (error.code) {
      case 'auth/invalid-credential':
        message = "Неверный email или пароль.";
        break;
      case 'auth/wrong-password':
        message = "Неверный пароль.";
        break;
      case 'auth/user-not-found':
        message = "Аккаунт с таким email не найден.";
        break;
      case 'auth/too-many-requests':
        message = "Слишком много попыток входа. Попробуйте позже.";
        break;
      case 'auth/network-request-failed':
        message = "Ошибка соединения. Проверьте интернет.";
        break;
      case 'auth/invalid-email':
        message = "Введите корректный email";
        break;
      default:
        message = error.message || "Ошибка входа";
    }
    toast("Ошибка", message);
  }
}

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const user = result.user;
    
    // Create server session via Firebase bridge
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });
    
    const sessionResult = await response.json();
    if (!sessionResult.ok) {
      throw new Error(sessionResult.error || "Failed to create session");
    }
    
    toast("Успех", "Вход через Google выполнен");
    await bootAfterAuth("firebase");
    console.log("Google login:", result.user);
  } catch (error) {
    console.error(error);
    let message = "Ошибка входа через Google";
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      message = "Вход через Google был отменён";
    }
    toast("Ошибка", message);
  }
}

const openAuthBtn = document.getElementById("openAuthBtn");
const authModal = document.getElementById("authModal");

if (openAuthBtn) {
  openAuthBtn.addEventListener("click", () => {
    const authModal = document.getElementById("authModal");
    if (authModal) {
      authModal.style.display = "flex";
    }
  });
}

const registerBtn = document.getElementById("registerBtn");
if (registerBtn) {
  registerBtn.addEventListener("click", () => {
    const email = document.getElementById("authEmail")?.value || "";
    const password = document.getElementById("authPassword")?.value || "";
    register(email, password);
  });
}

const googleBtn = document.getElementById("googleBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    loginWithGoogle();
  });
}

async function getOrLoginUser() {
  // 1) если уже залогинен — ок
  let user = firebaseAuth.currentUser;
  if (user) return user;

  // 2) пробуем взять email/pass из формы логина
  let email = document.getElementById("loginEmail")?.value?.trim();
  let pass  = document.getElementById("loginPass")?.value;

  // 3) если в логине пусто — берём из формы регистрации
  if (!email || !pass) {
    email = document.getElementById("authEmail")?.value?.trim();
    pass  = document.getElementById("authPassword")?.value;
  }

  if (!email || !pass) return null;

  // 4) логинимся
  await signInWithEmailAndPassword(firebaseAuth, email, pass);
  return firebaseAuth.currentUser;
}

document.addEventListener("click", async (e) => {

  // Отправить письмо ещё раз
  const resendBtn = e.target.closest("#resendVerifyBtn");
  if (resendBtn) {
    try {
      const user = await getOrLoginUser();
      if (!user) return toast("Ошибка", "Сначала войдите или зарегистрируйтесь");

      await sendEmailVerification(user);
      toast("Готово", "Письмо отправлено ещё раз");
    } catch (err) {
      console.error("RESEND VERIFY ERROR", err);
      toast("Ошибка", "Ошибка отправки письма");
    }
    return;
  }

  // Я подтвердил — продолжить
  const checkBtn = e.target.closest("#checkVerifyBtn");
  if (checkBtn) {
    try {
      const user = await getOrLoginUser();
      if (!user) return toast("Ошибка", "Сначала войдите или зарегистрируйтесь");

      await user.reload();

      if (firebaseAuth.currentUser?.emailVerified) {
        toast("Успех", "Почта подтверждена");
        await bootAfterAuth("firebase");
      } else {
        toast("Ошибка", "Почта ещё не подтверждена");
      }
    } catch (err) {
      console.error("CHECK VERIFY ERROR", err);
      toast("Ошибка", "Ошибка проверки подтверждения");
    }
    return;
  }

});

// ===== Вспомогательные функции для истории чатов =====

async function renameChat(chatId, currentTitle) {
  const newTitle = prompt("Введите новое название чата:", currentTitle);
  if (!newTitle || newTitle.trim() === "") return;
  
  const r = await API.post(`/api/chats/${chatId}/rename`, { title: newTitle.trim() });
  if (!r.ok) return toast("Ошибка", "Не удалось переименовать чат.");
  
  toast("Готово", "Чат переименован.");
  // Обновляем список чатов
  openChatHistory();
}

async function togglePinChat(chatId, pin) {
  const r = await API.post(`/api/chats/${chatId}/pin`, { pinned: pin });
  if (!r.ok) return toast("Ошибка", "Не удалось изменить закрепление.");
  
  toast("Готово", pin ? "Чат закреплён." : "Чат откреплён.");
  // Обновляем список чатов
  openChatHistory();
}

async function deleteChat(chatId, chatTitle) {
  const confirmed = confirm(`Вы уверены, что хотите удалить чат "${chatTitle}"?\n\nВсе сообщения будут удалены безвозвратно.`);
  if (!confirmed) return;
  
  const r = await API.delete(`/api/chats/${chatId}`);
  if (!r.ok) return toast("Ошибка", "Не удалось удалить чат.");
  
  toast("Готово", "Чат удалён.");
  
  // Если это был активный чат - создаём новый
  if (state.activeChatId === chatId) {
    state.activeChatId = null;
    state.currentMessages = [];
    await createNewChat();
  } else {
    // Обновляем список чатов
    openChatHistory();
  }
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