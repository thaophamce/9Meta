const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const installer = fs.readFileSync(path.join(__dirname, '../build/installer-access-code.nsh'), 'utf8');

test('assisted installer requires a masked shared installation code', () => {
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.include, 'build/installer-access-code.nsh');
  assert.match(installer, /!macro customPageAfterChangeDir/);
  assert.match(installer, /Page custom InstallCodePageCreate InstallCodePageLeave/);
  assert.match(installer, /\$\{NSD_CreatePassword\}/);
  assert.match(installer, /Mã cài đặt không đúng/);
  assert.match(installer, /Abort/);
});

test('installation code is checked by salted SHA-256 without embedding plaintext', () => {
  assert.match(installer, /SHA2-256/);
  assert.match(installer, /NhaYenHash::HashText/);
  assert.match(installer, /INSTALL_CODE_SALT "[a-f0-9]{32}"/);
  assert.match(installer, /INSTALL_CODE_SHA256 "[A-Fa-f0-9]{64}"/);
  assert.doesNotMatch(installer, /NYZ-[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3}/);
  assert.doesNotMatch(installer, /WriteReg|installationId|heartbeat|last_seen/i);
});

test('silent mode cannot bypass the installation code gate', () => {
  assert.match(installer, /!macro customInit/);
  assert.match(installer, /\$\{If\} \$\{Silent\}/);
  assert.match(installer, /SetErrorLevel 5/);
  assert.match(installer, /Quit/);
});