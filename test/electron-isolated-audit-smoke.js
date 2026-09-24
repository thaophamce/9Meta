// Offline, hidden Electron smoke. Never load main.js or touch the system clipboard.
const { app, BrowserWindow, WebContentsView, ipcMain, session, clipboard, ClipboardItem } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const root = process.env.NY_AUDIT_ROOT;
if (!root || !path.isAbsolute(root) || !path.basename(root).startsWith('ny-electron-fixture-')) throw new Error('Explicit isolated fixture root required');
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'user-data'));
app.setPath('sessionData', path.join(root, 'session-data'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.on('session-created', s => s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']}, (_d,cb)=>cb({cancel:true})));
const deadline=setTimeout(()=>app.exit(2),30000);
app.whenReady().then(async()=>{
 const results={electron:process.versions.electron,clipboardWritten:false,networkAllowed:false,errors:[],viewSamples:[]};
 ipcMain.on('get-settings',e=>{e.returnValue={quickReplies:[],blockSeen:false,blockTyping:false}});
 ipcMain.on('zalo-network-state',()=>{});
 const win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{sandbox:true}});
 const views=[];
 for(let i=0;i<3;i++){
  const view=new WebContentsView({webPreferences:{partition:`persist:audit-${i}`,preload:path.join(__dirname,'..','preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  view.webContents.on('preload-error',(_e,_p,err)=>results.errors.push(err.message));
  views.push(view);win.contentView.addChildView(view);view.setBounds({x:60,y:40,width:580,height:700});
  const start=performance.now();await view.webContents.loadURL('data:text/html,<html><body><input aria-label="Fixture input"></body></html>');
  const probe=await view.webContents.executeJavaScript('({bridge:!!window.messengerApp,node:typeof require})');assert.equal(probe.bridge,true);assert.equal(probe.node,'undefined');
  results.viewSamples.push({profile:i,fixtureLoadMs:Math.round((performance.now()-start)*100)/100});
 }
 assert.notEqual(views[0].webContents.session,views[1].webContents.session);
 // Inspect API only: write/read/clear never called.
 assert.equal(typeof clipboard.write,'function');assert.equal(typeof clipboard.writeText,'function');assert.equal(typeof ClipboardItem,'function');
 const item=new ClipboardItem({'image/png':new Blob([Buffer.from([137,80,78,71])],{type:'image/png'})});
 results.clipboardApi={write:typeof clipboard.write,writeText:typeof clipboard.writeText,writeImage:typeof clipboard.writeImage,itemTypes:item.types};
 const {computeViewGeometry}=require('../modules/popup-layout');
 results.layout=[];for(const width of [1920,1366,768,375]){const g=computeViewGeometry({contentWidth:width,sidebarWidth:60,popupWidth:560});assert(g.viewWidth>=0&&g.viewX+g.viewWidth<=width);results.layout.push({width,...g})}
 for(let n=0;n<20;n++){const v=views[n%3];win.contentView.removeChildView(v);win.contentView.addChildView(v)}
 for(const v of views){win.contentView.removeChildView(v);await new Promise(resolve=>{v.webContents.once('destroyed',resolve);v.webContents.close()})}
 assert(views.every(v=>!v.webContents || v.webContents.isDestroyed()));win.destroy();clearTimeout(deadline);
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));app.exit(results.errors.length?1:0);
}).catch(e=>{fs.writeFileSync(path.join(root,'failure.txt'),String(e.stack));app.exit(1)});
