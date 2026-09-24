// Offline Electron/CDP regression. Never loads app main, live profiles or clipboard.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('node:assert/strict');
const { stageVideoWithDebugger } = require('../modules/video-staging');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ny-video-probe-'));
app.setPath('userData', path.join(root, 'profile'));
app.setPath('sessionData', path.join(root, 'session'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.on('session-created', s => s.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*'] }, (_d, cb) => cb({ cancel: true })));
const timer = setTimeout(() => app.exit(2), 20000);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const file = path.join(root, 'fixture.mp4');
  fs.writeFileSync(file, Buffer.alloc(32, 1));
  const results = [];
  for (const scenario of ['normal', 'reset-input', 'delayed', 'no-input', 'no-composer']) {
    await w.loadURL('data:text/html,' + encodeURIComponent(`
      ${scenario === 'no-composer' ? '' : '<div id="richInput" contenteditable="true">fixture</div>'}
      <button onclick="window.navigationClicks++">Profile</button>
      <script>
        window.navigationClicks=0; window.received=0;
        function createInput() {
          const i=document.createElement('input');i.type='file';i.accept='video/*';document.body.append(i);
          i.onchange=e=>{window.received=e.target.files[0].size;${scenario === 'reset-input' ? "i.value='';" : ''}};
        }
        ${scenario === 'no-input' ? '' : scenario === 'delayed' ? 'setTimeout(createInput,350);' : 'createInput();'}
      </script>`));
    const result = await stageVideoWithDebugger(w.webContents.debugger, file, w.webContents);
    const observed = await w.webContents.executeJavaScript('({received, navigationClicks})');
    const shouldSucceed = !['no-input','no-composer'].includes(scenario);
    assert.equal(result.ok, shouldSucceed, scenario + ': ' + result.message);
    assert.equal(observed.received, shouldSucceed ? 32 : 0, scenario);
    assert.equal(observed.navigationClicks, 0);
    assert.equal(w.webContents.debugger.isAttached(), false);
    results.push({ scenario, ok: result.ok, received: observed.received });
  }
  console.log(JSON.stringify({ electron: process.versions.electron, offline: true, results }));
  w.destroy(); clearTimeout(timer); app.exit(0);
}).catch(e => { console.error(e.message); app.exit(1); });
