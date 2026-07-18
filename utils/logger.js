/**
 * Redirect Shield AI - Logging Utility
 * Provides structured, color-coded logging for debugging, errors, and diagnostics.
 * Compatible with Service Workers (background), Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  class Logger {
    constructor() {
      this.enabled = true;
      this.currentLevel = LOG_LEVELS.INFO; // Default logging level
    }

    /**
     * Set logging threshold level
     * @param {string} levelStr - Threshold level ('DEBUG', 'INFO', 'WARN', 'ERROR')
     */
    setLevel(levelStr) {
      const normalized = String(levelStr).toUpperCase();
      if (LOG_LEVELS[normalized] !== undefined) {
        this.currentLevel = LOG_LEVELS[normalized];
      }
    }

    enable() {
      this.enabled = true;
    }

    disable() {
      this.enabled = false;
    }

    _formatTime() {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    }

    _log(level, prefix, message, color, extraData) {
      if (!this.enabled || level < this.currentLevel) return;

      const timestamp = this._formatTime();
      const style = `color: ${color}; font-weight: bold;`;
      const resetStyle = 'color: inherit; font-weight: normal;';

      if (extraData !== undefined) {
        console.groupCollapsed(`%c[NexShield] [${timestamp}] [${prefix}] %c${message}`, style, resetStyle);
        console.log('Log details:', extraData);
        console.trace('Call stack trace:');
        console.groupEnd();
      } else {
        console.log(`%c[NexShield] [${timestamp}] [${prefix}] %c${message}`, style, resetStyle);
      }
    }

    debug(message, extraData) {
      this._log(LOG_LEVELS.DEBUG, 'DEBUG', message, '#8b5cf6', extraData);
    }

    info(message, extraData) {
      this._log(LOG_LEVELS.INFO, 'INFO', message, '#10b981', extraData);
    }

    warn(message, extraData) {
      this._log(LOG_LEVELS.WARN, 'WARN', message, '#f59e0b', extraData);
    }

    error(message, extraData) {
      this._log(LOG_LEVELS.ERROR, 'ERROR', message, '#ef4444', extraData);
    }
  }

  // Export globally across all execution contexts
  globalScope.RedirectShieldLogger = new Logger();
})();
