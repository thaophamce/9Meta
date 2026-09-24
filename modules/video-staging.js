const path = require('path');
const fs = require('fs');

const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

function isSupportedVideoPath(videoPath) {
  return SUPPORTED_VIDEO_EXTENSIONS.has(path.extname(String(videoPath || '')).toLowerCase());
}

// Never click page-wide controls: "file" also matches "profile".
const VIDEO_INPUT_EXPRESSION = `
  (function() {
    var composer = document.querySelector('#richInput, .chat-input [contenteditable="true"], [contenteditable="true"]');
    if (!composer || !composer.getClientRects().length) return null;
    var inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(function(input) {
      var accept = String(input.accept || '').toLowerCase();
      return !input.disabled && (!accept || accept.includes('*/*') || accept.includes('video/') || /\\.mp4|\\.mov|\\.webm|video/.test(accept));
    });
    inputs.sort(function(a, b) {
      var av = String(a.accept || '').toLowerCase().includes('video/') ? 2 : 1;
      var bv = String(b.accept || '').toLowerCase().includes('video/') ? 2 : 1;
      return bv - av;
    });
    return inputs[0] || null;
  })()
`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stageVideoWithDebugger(debuggerClient, videoPath, webContents = null) {
  const attachedHere = !debuggerClient.isAttached();
  const resolvedVideoPath = path.resolve(String(videoPath || ''));
  try {
    const stat = fs.statSync(resolvedVideoPath);
    if (!stat.isFile() || !Number.isFinite(stat.size) || stat.size <= 0) {
      return { ok: false, message: 'Video rỗng hoặc không hợp lệ, không thể đưa vào hội thoại.' };
    }
    if (attachedHere) debuggerClient.attach('1.3');
    await debuggerClient.sendCommand('DOM.enable');
    // DOM.requestNode needs a document root registered in this CDP session.
    await debuggerClient.sendCommand('DOM.getDocument', { depth: 0 });
    let evaluated = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      evaluated = await debuggerClient.sendCommand('Runtime.evaluate', {
        expression: VIDEO_INPUT_EXPRESSION,
        objectGroup: 'nhayen-video-picker',
      });
      if (evaluated?.result?.objectId) break;
      await wait(250);
    }
    const objectId = evaluated?.result?.objectId;
    if (!objectId) return { ok: false, message: 'Không tìm thấy vùng đính kèm video. Hãy mở một hội thoại Zalo rồi thử lại.' };
    const requestedNode = await debuggerClient.sendCommand('DOM.requestNode', { objectId });
    if (!requestedNode?.nodeId) return { ok: false, message: 'Không truy cập được vùng đính kèm video của Zalo.' };
    // Capture File metadata before the application's change handler clears its input.
    await debuggerClient.sendCommand('Runtime.callFunctionOn', {
      objectId, functionDeclaration: `function() {
        this.__nhayenVideoCapture = null;
        this.__nhayenVideoListener = () => {
          const f = this.files && this.files[0];
          if (f) this.__nhayenVideoCapture = { name: f.name, size: f.size };
        };
        this.addEventListener('input', this.__nhayenVideoListener, true);
        this.addEventListener('change', this.__nhayenVideoListener, true);
      }`,
    });
    try {
      await debuggerClient.sendCommand('DOM.setFileInputFiles', { files: [resolvedVideoPath], nodeId: requestedNode.nodeId });
      return await verifySelectedFile(debuggerClient, objectId, resolvedVideoPath, stat.size);
    } finally {
      await debuggerClient.sendCommand('Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function() {
          this.removeEventListener('input', this.__nhayenVideoListener, true);
          this.removeEventListener('change', this.__nhayenVideoListener, true);
          delete this.__nhayenVideoCapture;
          delete this.__nhayenVideoListener;
        }`,
      }).catch(() => {});
    }
  } catch (error) {
    return { ok: false, message: `Không thể đính kèm video: ${error.message || String(error)}` };
  } finally {
    if (debuggerClient.isAttached()) {
      await debuggerClient.sendCommand('Runtime.releaseObjectGroup', { objectGroup: 'nhayen-video-picker' }).catch(() => {});
    }
    if (attachedHere && debuggerClient.isAttached()) debuggerClient.detach();
  }
}

async function verifySelectedFile(debuggerClient, objectId, videoPath, expectedSize) {
  const evaluated = await debuggerClient.sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      const f = this.files && this.files[0];
      return this.__nhayenVideoCapture || (f ? { name: f.name, size: f.size } : null);
    }`,
    returnByValue: true,
  });
  const file = evaluated?.result?.value;
  if (!file || file.size !== expectedSize || file.name !== path.basename(videoPath)) {
    return { ok: false, message: 'Chưa xác nhận được video. Hãy kiểm tra vùng đính kèm trước khi thử lại.' };
  }
  return { ok: true };
}

module.exports = { isSupportedVideoPath, stageVideoWithDebugger, VIDEO_INPUT_EXPRESSION };
