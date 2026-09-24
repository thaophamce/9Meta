'use strict';

const RECOVERABLE_NETWORK_ERRORS = new Set([-7, -21, -100, -101, -102, -105, -106, -118]);

class RecoveryController {
  constructor({ now = Date.now, schedule = setTimeout, cancel = clearTimeout, reload, log = () => {} } = {}) {
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.reload = reload || (() => {});
    this.log = log;
    this.state = 'online';
    this.reloadAttempts = 0;
    this.timer = null;
    this.stableTimer = null;
    this.online = true;
  }

  snapshot() {
    return { state: this.state, reloadAttempts: this.reloadAttempts, online: this.online };
  }

  setState(state, detail = {}) {
    if (this.state === state) return;
    this.state = state;
    this.log('connection-state', { state, ...detail });
  }

  networkChanged(online) {
    this.online = !!online;
    if (this.online) {
      if (this.timer) this.cancel(this.timer);
      this.timer = null;
      this.setState('online', { source: 'renderer-network' });
      return;
    }
    this.setState('degraded', { source: 'renderer-network' });
    if (this.timer) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      if (!this.online) this.setState('offline', { sustainedMs: 15_000 });
    }, 15_000);
  }

  mainFrameFailed(errorCode, description = '') {
    this.setState('reconnecting', { errorCode, description: String(description) });
    if (!RECOVERABLE_NETWORK_ERRORS.has(errorCode) || this.reloadAttempts >= 2 || this.timer) return false;
    const attempt = ++this.reloadAttempts;
    const delayMs = attempt === 1 ? 15_000 : 60_000;
    this.log('auto-reload-scheduled', { attempt, delayMs, errorCode });
    this.timer = this.schedule(() => {
      this.timer = null;
      if (!this.online) {
        this.log('auto-reload-deferred-offline', { attempt });
        return;
      }
      this.log('auto-reload-fired', { attempt });
      this.reload();
    }, delayMs);
    return true;
  }

  rendererGone(reason, exitCode) {
    this.setState('crashed', { reason, exitCode });
    if (reason === 'clean-exit' || reason === 'killed') return false;
    return this.mainFrameFailed(-100, `renderer:${reason || 'unknown'}`);
  }

  loaded() {
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    this.online = true;
    this.setState('online', { source: 'load' });
    if (this.stableTimer) this.cancel(this.stableTimer);
    this.stableTimer = this.schedule(() => {
      this.reloadAttempts = 0;
      this.log('recovery-reset', { stableMs: 300_000 });
    }, 300_000);
  }

  dispose() {
    if (this.timer) this.cancel(this.timer);
    if (this.stableTimer) this.cancel(this.stableTimer);
    this.timer = null;
    this.stableTimer = null;
  }
}

module.exports = { RecoveryController, RECOVERABLE_NETWORK_ERRORS };
