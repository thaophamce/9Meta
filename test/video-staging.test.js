const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSupportedVideoPath, stageVideoWithDebugger } = require('../modules/video-staging');

test('video staging accepts approved formats and rejects unrelated files', () => {
  assert.equal(isSupportedVideoPath('clip.MP4'), true);
  assert.equal(isSupportedVideoPath('clip.webm'), true);
  assert.equal(isSupportedVideoPath('payload.exe'), false);
});

test('video staging selects the Zalo file input without issuing a send action', async () => {
  const videoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nhayen-video-')), 'demo.mp4');
  fs.writeFileSync(videoPath, Buffer.alloc(1234));
  const commands = [];
  let attached = false;
  const debuggerClient = {
    isAttached: () => attached,
    attach: () => { attached = true; },
    detach: () => { attached = false; },
    sendCommand: async (name, params) => {
      commands.push({ name, params });
      if (name === 'Runtime.evaluate') {
        const expression = String(params?.expression || '');
        if (expression.includes('return file ?')) return { result: { value: { name: 'demo.mp4', size: 1234 } } };
        return { result: { objectId: 'video-input' } };
      }
      if (name === 'Runtime.callFunctionOn' && params.returnByValue) return { result: { value: { name: 'demo.mp4', size: 1234 } } };
      if (name === 'DOM.requestNode') return { nodeId: 42 };
      return {};
    },
  };

  const result = await stageVideoWithDebugger(debuggerClient, videoPath);

  assert.deepEqual(result, { ok: true });
  assert.ok(commands.findIndex(entry => entry.name === 'DOM.getDocument') >= 0);
  assert.ok(commands.findIndex(entry => entry.name === 'DOM.getDocument') < commands.findIndex(entry => entry.name === 'DOM.requestNode'));
  assert.equal(attached, false);
  assert.deepEqual(commands.find((entry) => entry.name === 'DOM.setFileInputFiles').params, {
    files: [videoPath],
    nodeId: 42,
  });
  assert.equal(commands.some((entry) => JSON.stringify(entry).includes('Enter')), false);
});

test('video staging detaches debugger after an attachment failure', async () => {
  const videoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nhayen-video-')), 'demo.mp4');
  fs.writeFileSync(videoPath, Buffer.alloc(1234));
  let attached = false;
  const debuggerClient = {
    isAttached: () => attached,
    attach: () => { attached = true; },
    detach: () => { attached = false; },
    sendCommand: async (name) => {
      if (name === 'Runtime.evaluate') return { result: {} };
      return {};
    },
  };

  const result = await stageVideoWithDebugger(debuggerClient, videoPath);

  assert.equal(result.ok, false);
  assert.match(result.message, /Không tìm thấy vùng đính kèm video/);
  assert.equal(attached, false);
});
const vm = require('node:vm');
const { VIDEO_INPUT_EXPRESSION } = require('../modules/video-staging');
test('video picker never searches or clicks global profile/navigation controls', () => {
  let clicks = 0;
  const video = { accept: 'video/*' };
  const scope = { querySelectorAll: () => [video] };
  const composer = { getClientRects: () => [1], closest: () => scope };
  const document = {
    querySelector: () => composer,
    querySelectorAll: () => [video],
  };
  assert.equal(vm.runInNewContext(VIDEO_INPUT_EXPRESSION, { document }), video);
  assert.equal(clicks, 0);
  assert.doesNotMatch(VIDEO_INPUT_EXPRESSION, /\.click\(/);
  scope.querySelectorAll = () => [video, { accept: '', disabled: false }];
  assert.equal(vm.runInNewContext(VIDEO_INPUT_EXPRESSION, { document }), video);
  document.querySelector = () => null;
  assert.equal(vm.runInNewContext(VIDEO_INPUT_EXPRESSION, { document }), null);
});

test('video verification reads exact input and rejects wrong size or name', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhayen-video-regression-'));
  const videoPath = path.join(dir, 'fixture.mp4');
  fs.writeFileSync(videoPath, Buffer.alloc(12));
  t.after(() => { fs.unlinkSync(videoPath); fs.rmdirSync(dir); });
  for (const file of [null, { name: 'fixture.mp4', size: 0 }, { name: 'other.mp4', size: 12 }, { name: 'fixture.mp4', size: 11 }, { name: 'fixture.mp4', size: 12 }]) {
    let attached = false;
    const client = {
      isAttached: () => attached, attach: () => { attached = true; }, detach: () => { attached = false; },
      async sendCommand(name, params) {
        if (name === 'Runtime.evaluate') return { result: { objectId: 'EXACT_INPUT' } };
        if (name === 'DOM.requestNode') return { nodeId: 9 };
        if (name === 'Runtime.callFunctionOn') {
          assert.equal(params.objectId, 'EXACT_INPUT');
          if (params.returnByValue) return { result: { value: file } };
        }
        return {};
      },
    };
    const result = await stageVideoWithDebugger(client, videoPath);
    assert.equal(result.ok, file?.name === 'fixture.mp4' && file?.size === 12);
    assert.equal(attached, false);
  }
});
