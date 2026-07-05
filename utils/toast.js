/**
 * Redirect Shield AI - Injected Toast alerts renderer
 * Constructs a secure Shadow DOM wrapper inside current webpage
 * to display frosted glass notifications when threats are blocked.
 * Compatible with Content Scripts and DOM execution contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const ToastRenderer = {
    container: null,

    /**
     * Initialized the parent container box for notifications
     * @private
     */
    _createContainer: function() {
      if (this.container) return;

      this.container = document.createElement('div');
      this.container.id = 'redirect-shield-toast-container';
      Object.assign(this.container.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: '2147483647', // Max z-index to sit above overlays
        pointerEvents: 'none'
      });
      document.body.appendChild(this.container);
    },

    /**
     * Renders a frosted notification
     * @param {string} url - Target URL blocked
     * @param {string} type - Event vector ('popup', 'redirect', 'overlay', 'deceptive')
     */
    show: function(url, type) {
      // Ensure running in DOM context
      if (typeof document === 'undefined') return;

      this._createContainer();

      let shadow = this.container.shadowRoot;
      if (!shadow) {
        shadow = this.container.attachShadow({ mode: 'closed' });
        
        const style = document.createElement('style');
        style.textContent = `
          .toast {
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(10, 15, 30, 0.82);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-left: 4px solid var(--accent-color, #00f5a0);
            color: #ffffff;
            padding: 12px 18px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13.5px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            pointer-events: auto;
            margin-top: 10px;
            opacity: 0;
            transform: translateX(100px) scale(0.9);
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2), opacity 0.4s ease;
            min-width: 280px;
            max-width: 380px;
          }
          .toast.show {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          .toast-popup { --accent-color: #00f5a0; --icon-bg: rgba(0, 245, 160, 0.12); }
          .toast-redirect { --accent-color: #00b2fe; --icon-bg: rgba(0, 178, 254, 0.12); }
          .toast-overlay { --accent-color: #ff9f00; --icon-bg: rgba(255, 159, 0, 0.12); }
          .toast-deceptive { --accent-color: #ef4444; --icon-bg: rgba(239, 68, 68, 0.12); }
          
          .icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: var(--icon-bg);
            border-radius: 50%;
            color: var(--accent-color);
            flex-shrink: 0;
            box-shadow: inset 0 0 6px rgba(255, 255, 255, 0.05);
            animation: pulse-icon 2s infinite alternate;
          }
          @keyframes pulse-icon {
            0% { transform: scale(1); filter: drop-shadow(0 0 1px var(--accent-color)); }
            100% { transform: scale(1.05); filter: drop-shadow(0 0 4px var(--accent-color)); }
          }
          .content {
            flex-grow: 1;
            overflow: hidden;
          }
          .title {
            font-weight: 700;
            margin-bottom: 2px;
            letter-spacing: -0.2px;
            font-size: 13px;
          }
          .url {
            color: #94a3b8;
            font-size: 11px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        `;
        shadow.appendChild(style);
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      
      const titleMap = {
        popup: 'Popup Blocked',
        redirect: 'Redirect Blocked',
        overlay: 'Overlay Removed',
        deceptive: 'Deceptive Warning'
      };
      
      const displayTitle = titleMap[type] || 'Redirection Intercepted';
      const cleanUrl = url ? String(url).substring(0, 100) : 'Local override';

      toast.innerHTML = `
        <div class="icon-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="content">
          <div class="title">${displayTitle}</div>
          <div class="url" title="${url}">${cleanUrl}</div>
        </div>
      `;

      shadow.appendChild(toast);

      // Trigger animated entry transition
      setTimeout(() => {
        toast.classList.add('show');
      }, 15);

      // Auto-dismiss alert after 3 seconds
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
        }, 450);
      }, 3000);
    }
  };

  // Export globally
  globalScope.RedirectShieldToast = ToastRenderer;
})();
