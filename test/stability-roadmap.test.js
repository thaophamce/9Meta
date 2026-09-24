const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('recovery policy waits for sustained offline state and bounds reload attempts', () => {
  const { RecoveryController } = require('../modules/recovery-controller');
  const scheduled = [];
  const controller = new RecoveryController({
    now: () => 10_000,
    schedule: (fn, delayMs) => { scheduled.push({ fn, delayMs }); return scheduled.length; },
    cancel: () => {},
    reload: () => {},
    log: () => {},
  });

  controller.networkChanged(false);
  assert.equal(controller.snapshot().state, 'degraded');
  assert.equal(scheduled[0].delayMs, 15_000);
  controller.networkChanged(true);
  assert.equal(controller.snapshot().state, 'online');

  controller.mainFrameFailed(-105, 'NAME_NOT_RESOLVED');
  assert.equal(controller.snapshot().state, 'reconnecting');
  assert.equal(controller.snapshot().reloadAttempts, 1);
  scheduled.at(-1).fn();
  controller.mainFrameFailed(-105, 'NAME_NOT_RESOLVED');
  scheduled.at(-1).fn();
  controller.mainFrameFailed(-105, 'NAME_NOT_RESOLVED');
  assert.equal(controller.snapshot().reloadAttempts, 2);
});

test('diagnostic journal exports only the requested recent window and redacts secrets', () => {
  const { sanitizeDiagnosticRecord, selectRecentRecords } = require('../modules/runtime-diagnostics');
  const now = Date.parse('2026-09-15T10:10:00.000Z');
  const records = [
    { at: '2026-09-15T09:50:00.000Z', type: 'old' },
    { at: '2026-09-15T10:05:00.000Z', type: 'network', url: 'https://chat.zalo.me/?token=secret', proxy: 'u:p@127.0.0.1:9000' },
  ];
  const recent = selectRecentRecords(records, { now, windowMs: 10 * 60_000 });
  assert.equal(recent.length, 1);
  const clean = sanitizeDiagnosticRecord(recent[0]);
  assert.equal(clean.url, 'chat.zalo.me');
  assert.equal(clean.proxy, '[configured]');
  assert.doesNotMatch(JSON.stringify(clean), /secret|u:p/);
});

test('Electron shell uses WebContentsView and exposes safe diagnostics/cache operations', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(main, /WebContentsView/);
  assert.doesNotMatch(main, /\bnew BrowserView\b|\.setBrowserView\(/);
  assert.match(main, /contentView\.addChildView\(/);
  assert.match(main, /contentView\.removeChildView\(/);

  assert.match(main, /ipcMain\.handle\('diagnostics-export'/);
  assert.match(renderer, /ipcRenderer\.invoke\('diagnostics-export'/);
  assert.match(html, /id="modal-export-diagnostics"/);

  assert.match(main, /ipcMain\.handle\('profile-clear-cache-light'/);
  assert.match(main, /ipcMain\.handle\('profile-repair-cache-deep'/);
  const lightHandler = main.slice(
    main.indexOf("ipcMain.handle('profile-clear-cache-light'"),
    main.indexOf("ipcMain.handle('profile-repair-cache-deep'")
  );
  assert.match(lightHandler, /clearCache\(\)/);
  assert.match(lightHandler, /clearCodeCaches\(\{\}\)/);
  assert.doesNotMatch(lightHandler, /clearStorageData/);
  assert.match(renderer, /profile-repair-cache-deep/);
});

test('all account sessions remain persistent and runtime pressure is sampled', () => {
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(renderer, /return `persist:/);
  assert.match(main, /app\.getAppMetrics\(\)/);
  assert.match(main, /runtime-pressure/);
  assert.match(main, /const keepRealtime = profile\.platform === 'zalo'/);
  assert.match(main, /backgroundThrottling:\s*!keepRealtime/);
});
