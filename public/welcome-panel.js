class WelcomePanel {
  constructor() {
    this.isVisible = false;
    this.overlay = null;
    this.panel = null;
    this.textEl = null;
    this.interval = null;
    this.fadeTimeout = null;

  this.phrases = [
  "Спасибо, что выбрали Velora. Мы рядом."
];

    this.currentPhraseIndex = 0;
  }

  createHTML() {
    return `
      <div class="welcome-overlay" id="welcomeOverlay">
        <div class="welcome-backdrop-glow"></div>

        <div class="welcome-panel">
          <div class="welcome-panel-border"></div>

          <div class="welcome-top">
            <div class="welcome-icon-wrap">
              <span class="welcome-icon">✦</span>
            </div>
            <h2 class="welcome-title">Добро пожаловать в Velora</h2>
          </div>

          <div class="welcome-text-wrap">
            <div class="welcome-text show" id="welcomeText">
              ${this.phrases[0]}
            </div>
          </div>

          <div class="welcome-actions">
            <button class="welcome-btn welcome-btn-primary" id="welcomeGoToChat" type="button">
              Перейти в чат
            </button>

            <button class="welcome-btn welcome-btn-secondary" id="welcomeSettings" type="button">
              Настройки
            </button>
          </div>
        </div>
      </div>
    `;
  }

  show() {
    if (this.isVisible) return;

    const container = document.createElement("div");
    container.innerHTML = this.createHTML();
    document.body.appendChild(container.firstElementChild);

    this.overlay = document.getElementById("welcomeOverlay");
    this.panel = this.overlay.querySelector(".welcome-panel");
    this.textEl = this.overlay.querySelector("#welcomeText");

    this.attachEventListeners();
   
    
    requestAnimationFrame(() => {
      this.overlay.classList.add("show");
    });

    this.isVisible = true;
  }

  hide(onAfterClose = null) {
    if (!this.isVisible || !this.overlay) return;

    

    this.overlay.classList.remove("show");
    this.overlay.classList.add("hide");

    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }

      this.overlay = null;
      this.panel = null;
      this.textEl = null;
      this.isVisible = false;

      if (typeof onAfterClose === "function") {
        onAfterClose();
      }
    }, 380);
  }

  startTextAnimation() {
    if (!this.textEl) return;

    this.currentPhraseIndex = 0;
    this.textEl.textContent = this.phrases[this.currentPhraseIndex];
    this.textEl.classList.add("show");

    this.interval = setInterval(() => {
      if (!this.textEl) return;

      this.textEl.classList.remove("show");

      this.fadeTimeout = setTimeout(() => {
        this.currentPhraseIndex =
          (this.currentPhraseIndex + 1) % this.phrases.length;

        if (!this.textEl) return;

        this.textEl.textContent = this.phrases[this.currentPhraseIndex];
        this.textEl.classList.add("show");
      }, 420);
    }, 3200);
  }

  stopTextAnimation() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
  }

  attachEventListeners() {
    const goToChatBtn = this.overlay.querySelector("#welcomeGoToChat");
    const settingsBtn = this.overlay.querySelector("#welcomeSettings");

    goToChatBtn?.addEventListener("click", () => {
      this.hide(() => {
        const chatInput =
          document.querySelector('textarea') ||
          document.querySelector('input[type="text"]');
        chatInput?.focus();
      });
    });

    settingsBtn?.addEventListener("click", () => {
      this.hide(() => {
        if (typeof window.openSettingsModal === "function") {
          window.openSettingsModal();
          return;
        }

        const settingsBtnOnPage =
          document.querySelector("[data-settings-btn]") ||
          document.querySelector("#settingsBtn");
        settingsBtnOnPage?.click();
      });
    });

    this.overlay?.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });
  }
}

window.welcomePanel = new WelcomePanel();