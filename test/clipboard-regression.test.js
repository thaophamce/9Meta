const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../renderer.js'), 'utf8');
function section(source, start, end) { const i=source.indexOf(start); assert.ok(i>=0); const j=source.indexOf(end,i+start.length); assert.ok(j>i); return source.slice(i,j); }
test('order copy waits for clipboard completion and handles denial without false success', async () => {
 const button={innerText:'Copy'}, code={innerText:'FIXTURE_ORDER'}; let resolve;
 const context={document:{getElementById:id=>id==='pancake-created-code'?code:button},pancakePopupMode:'success',ipcRenderer:{invoke:()=>new Promise(r=>resolve=r)},setTimeout:()=>{},copyTextSafely:undefined};
 const helperStart=renderer.indexOf('async function copyTextSafely(');
 if(helperStart>=0) vm.runInNewContext(section(renderer,'async function copyTextSafely(','\n// Clipboard helper end'),context);
 vm.runInNewContext(section(renderer,"document.getElementById('pancake-created-copy').onclick",'\n// Popup: nut Huy'),context);
 const pending=button.onclick(); assert.equal(button.innerText,'Copy'); resolve({ok:true}); await pending; assert.notEqual(button.innerText,'Copy');
 context.ipcRenderer.invoke=async()=>{throw new Error('DENIED')}; await button.onclick(); assert.equal(button.innerText,'Không sao chép được');
});
test('image paste supports asynchronous Electron ClipboardItem API and waits before paste', async()=>{
 let handler,finish,writes=0,pastes=0; const image={isEmpty:()=>false,toPNG:()=>Buffer.from('fixture')}; const sender={isDestroyed:()=>false,focus(){},sendInputEvent(){pastes++}};
 const context={ipcMain:{handle:(name,fn)=>handler=fn},browserViews:{p:{webContents:sender}},getWorkspaceState:()=>({data:{quickReplies:[{imagePath:'/fixture.png'}]}}),path,fs:{existsSync:()=>true,promises:{readFile:async()=>Buffer.from('fixture')}},sniffImageFormat:()=> 'png',isSupportedSourceFormat:()=>true,nativeImage:{createFromBuffer:()=>image},clipboard:{write:async(items)=>{writes++;assert.equal(items.length,1);await new Promise(r=>finish=r)}},ClipboardItem:class{constructor(data){this.data=data}},Blob,storeUnlocked:true,appLocked:false,activeProfileId:'p',Buffer};
 vm.runInNewContext(section(main,"  ipcMain.handle('quick-reply:paste-image'","  ipcMain.handle('active-chat:choose-video'"),context);
 const pending=handler({sender},'/fixture.png'); await new Promise(r=>setImmediate(r)); assert.equal(writes,1); assert.equal(pastes,0);finish();const result=await pending;assert.equal(result.ok,true);assert.equal(pastes,2);
});

test('native copy rejects embedded senders and invalid payloads, awaits write and returns failure', async () => {
  let handler, finish, writes = 0;
  const frame = {}, sender = { mainFrame: frame };
  const context = {
    ipcMain: { handle: (_, fn) => { handler = fn; } },
    mainWindow: { webContents: sender },
    clipboard: { writeText: async text => { assert.equal(text, 'FIXTURE'); writes++; await new Promise(r => { finish = r; }); } },
  };
  vm.runInNewContext(section(main, "  ipcMain.handle('app:copy-text'", "  ipcMain.handle('crm:login'"), context);
  for (const [event, text] of [[{sender:{}},'FIXTURE'], [{sender, senderFrame:{}},'FIXTURE'], [{sender,senderFrame:frame},''], [{sender,senderFrame:frame},{}]]) {
    assert.equal((await handler(event,text)).ok, false);
  }
  assert.equal(writes, 0);
  const pending = handler({sender,senderFrame:frame}, 'FIXTURE');
  assert.equal(writes, 1); finish(); assert.equal((await pending).ok,true);
  context.clipboard.writeText = async () => { throw new Error('denied'); };
  assert.equal((await handler({sender,senderFrame:frame},'FIXTURE')).ok,false);
});

test('video library stages with Windows file clipboard then Ctrl+V and never Enter', () => {
 const handler=section(main,"  ipcMain.handle('video-library:stage'","  ipcMain.handle('active-chat-insert-text'");
 assert.match(handler,/focusZaloComposerAndPasteFile/);
 assert.doesNotMatch(handler,/stageVideoWithDebugger|keyCode:\s*'Enter'/);
 const helper=section(main,'async function focusZaloComposerAndPasteFile','\nconst ZALO_URL');
 assert.match(helper,/copyFileToWindowsClipboard/);
 assert.match(helper,/keyCode:\s*'V'.*modifiers:\s*\['control'\]/s);
 assert.doesNotMatch(helper,/keyCode:\s*'Enter'|\.click\(/);
 const clipboardHelper=section(main,'function copyFileToWindowsClipboard','\nasync function focusZaloComposerAndPasteFile');
 assert.match(clipboardHelper,/SetFileDropList/);
 assert.match(clipboardHelper,/GetFileDropList/);
});

test('video clipboard transfers Unicode paths safely and does not expose PowerShell errors', () => {
 const clipboardHelper=section(main,'function copyFileToWindowsClipboard','\nasync function focusZaloComposerAndPasteFile');
 assert.match(clipboardHelper,/Buffer\.from\(path\.resolve\(filePath\),\s*'utf8'\)\.toString\('base64'\)/);
 assert.match(clipboardHelper,/NHAYEN_VIDEO_PATH_B64/);
 assert.match(clipboardHelper,/UTF8\.GetString\(\[System\.Convert\]::FromBase64String\(\$env:NHAYEN_VIDEO_PATH_B64\)\)/);
 assert.doesNotMatch(clipboardHelper,/param\(\[string\]\$filePath\)/);
 assert.doesNotMatch(clipboardHelper,/-Command',\s*script,\s*filePath/);
 assert.doesNotMatch(clipboardHelper,/message:\s*stderr\.trim\(\)/);
 assert.match(clipboardHelper,/Không thể sao chép video vào clipboard Windows\. Hãy thử lại\./);
});

