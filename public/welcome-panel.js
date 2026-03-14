// Premium Welcome Screen Module
class WelcomePanel {
  constructor() {
    this.isVisible = false;
    this.overlay = null;
    this.panel = null;
    this.textContainer = null;
    this.phrases = [
      "Иногда всё начинается с одного спокойного шага.",
      "Velora рядом, чтобы помочь тебе двигаться дальше.",
      "Без спешки. Просто двигайся к своей цели.",
      "Ты уже на правильном пути."
    ];
    this.currentPhraseIndex = 0;
    this.textAnimationTimeout = null;
  }

  // Проверяем, показывать ли welcome панель
  shouldShow() {
    const hasSeenWelcome = localStorage.getItem('velora_welcome_panel_seen');
    const shouldShowAfterSignup = localStorage.getItem('showWelcomeAfterSignup') === '1';
    
    console.log('WelcomePanel shouldShow check:', { hasSeenWelcome, shouldShowAfterSignup });
    
    return !hasSeenWelcome && shouldShowAfterSignup;
  }

  // Создаем HTML структуру с анимированным текстом
  createHTML() {
    return `
      <div class="welcome-overlay" id="welcomeOverlay">
        <div class="welcome-panel">
          <div class="welcome-title">✨ Добро пожаловать в Velora</div>
          <div class="welcome-text-container">
            <div class="welcome-text" id="welcomeText"></div>
          </div>
          
          <div class="welcome-buttons">
            <button class="welcome-primary-btn" id="welcomeGoToChat">
              <span class="btn-content">Перейти в чат</span>
            </button>
            <button class="welcome-secondary-btn" id="welcomeSettings">
              <span class="btn-content">Настройки</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Анимация текста с цикличным показом фраз
  startTextAnimation() {
    if (!this.textContainer) return;
    
    const showNextPhrase = () => {
      const textElement = this.textContainer;
      const phrase = this.phrases[this.currentPhraseIndex];
      
      // Fade out
      textElement.style.opacity = '0';
      textElement.style.transform = 'translateY(10px)';
      textElement.style.filter = 'blur(2px)';
      
      setTimeout(() => {
        // Меняем текст
        textElement.textContent = phrase;
        
        // Fade in
        textElement.style.opacity = '1';
        textElement.style.transform = 'translateY(0)';
        textElement.style.filter = 'blur(0)';
        
        // Следующая фраза
        this.currentPhraseIndex = (this.currentPhraseIndex + 1) % this.phrases.length;
        
        // Планируем следующую смену
        this.textAnimationTimeout = setTimeout(showNextPhrase, 3000);
      }, 300);
    };
    
    // Запускаем первую фразу
    setTimeout(showNextPhrase, 500);
  }

  // Останавливаем анимацию текста
  stopTextAnimation() {
    if (this.textAnimationTimeout) {
      clearTimeout(this.textAnimationTimeout);
      this.textAnimationTimeout = null;
    }
  }

  // Показываем панель
  show() {
    console.log('WelcomePanel.show() called, isVisible:', this.isVisible);
    
    if (this.isVisible) {
      console.log('WelcomePanel.show() early return: already visible');
      return;
    }

    console.log('WelcomePanel.show() - creating panel');

    // Создаем и добавляем HTML
    const container = document.createElement('div');
    container.innerHTML = this.createHTML();
    document.body.appendChild(container.firstElementChild);

    // Сохраняем ссылки на элементы
    this.overlay = document.getElementById('welcomeOverlay');
    this.panel = this.overlay.querySelector('.welcome-panel');
    this.textContainer = this.overlay.querySelector('#welcomeText');

    // Добавляем обработчики событий
    this.attachEventListeners();

    // Запускаем анимацию текста
    this.startTextAnimation();

    this.isVisible = true;
    console.log('WelcomePanel.show() - panel is now visible');
  }

  // Закрываем панель
  hide() {
    if (!this.isVisible) return;

    // Останавливаем анимацию текста
    this.stopTextAnimation();

    this.overlay.classList.add('hiding');

    // Удаляем после анимации
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.isVisible = false;
      this.overlay = null;
      this.panel = null;
      this.textContainer = null;
    }, 300);
  }

  // Добавляем обработчики событий
  attachEventListeners() {
    const goToChatBtn = document.getElementById('welcomeGoToChat');
    const settingsBtn = document.getElementById('welcomeSettings');

    if (goToChatBtn) {
      goToChatBtn.addEventListener('click', () => {
        this.handleGoToChat();
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.handleSettings();
      });
    }

    // Закрытие по клику на оверлей
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // Закрытие по ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  // Обработка кнопки "Перейти в чат"
  handleGoToChat() {
    // Помечаем, что пользователь видел welcome панель
    localStorage.setItem('velora_welcome_panel_seen', 'true');
    
    // Очищаем флаг регистрации
    localStorage.removeItem('showWelcomeAfterSignup');
    
    // Закрываем панель
    this.hide();
    
    // Фокус на поле ввода чата
    setTimeout(() => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.focus();
      }
    }, 300);
  }

  // Обработка кнопки "Настройки"
  handleSettings() {
    // Помечаем, что пользователь видел welcome панель
    localStorage.setItem('velora_welcome_panel_seen', 'true');
    
    // Очищаем флаг регистрации
    localStorage.removeItem('showWelcomeAfterSignup');
    
    // Закрываем панель
    this.hide();
    
    // Открываем настройки AI
    setTimeout(() => {
      if (typeof openAiSettings === 'function') {
        openAiSettings();
      }
    }, 300);
  }

  // Инициализация после загрузки DOM
  init() {
    // Проверяем, нужно ли показывать панель
    if (this.shouldShow()) {
      // Небольшая задержка для гарантии загрузки UI
      setTimeout(() => {
        this.show();
      }, 800);
    }
  }
}

// Создаем глобальный экземпляр
const welcomePanel = new WelcomePanel();

// Экспортируем для использования в основном коде
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WelcomePanel;
} else {
  window.WelcomePanel = WelcomePanel;
  window.welcomePanel = welcomePanel;
}
