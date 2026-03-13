// Welcome Panel Module
class WelcomePanel {
  constructor() {
    this.isVisible = false;
    this.overlay = null;
    this.panel = null;
  }

  // Проверяем, показывать ли welcome панель
  shouldShow() {
    // Показываем только после успешной регистрации
    const hasSeenWelcome = localStorage.getItem('velora_welcome_panel_seen');
    const shouldShowAfterSignup = sessionStorage.getItem('showWelcomeAfterSignup') === '1';
    
    console.log('WelcomePanel shouldShow check:', { hasSeenWelcome, shouldShowAfterSignup });
    
    return !hasSeenWelcome && shouldShowAfterSignup;
  }

  // Создаем HTML структуру
  createHTML() {
    return `
      <div class="welcome-overlay" id="welcomeOverlay">
        <div class="welcome-panel">
          <div class="welcome-title">✨ Добро пожаловать в Velora</div>
          <div class="welcome-subtitle">AI поможет тебе достигать целей быстрее.</div>
          
          <div class="welcome-buttons">
            <button class="welcome-primary-btn" id="welcomeGoToChat">
              Перейти в чат
            </button>
            <button class="welcome-secondary-btn" id="welcomeSettings">
              Настройки
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Показываем панель
  show() {
    console.log('WelcomePanel.show() called, isVisible:', this.isVisible);
    
    if (this.isVisible || !this.shouldShow()) {
      console.log('WelcomePanel.show() early return:', { 
        isVisible: this.isVisible, 
        shouldShow: this.shouldShow() 
      });
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

    // Добавляем обработчики событий
    this.attachEventListeners();

    this.isVisible = true;
    console.log('WelcomePanel.show() - panel is now visible');
  }

  // Закрываем панель
  hide() {
    if (!this.isVisible) return;

    this.overlay.classList.add('hiding');

    // Удаляем после анимации
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.isVisible = false;
      this.overlay = null;
      this.panel = null;
    }, 250);
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
    sessionStorage.removeItem('showWelcomeAfterSignup');
    
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
    sessionStorage.removeItem('showWelcomeAfterSignup');
    
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
