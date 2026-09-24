const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
test('test distribution isolates user data before single instance lock and disables updater', () => {
 assert.ok(source.indexOf("app.setPath('userData', testDataPath)") > 0);
 assert.ok(source.indexOf("app.setPath('userData', testDataPath)") < source.indexOf('app.requestSingleInstanceLock()'));
 assert.match(source, /function setupAutoUpdater\(\)\s*\{\s*if \(IS_TEST_DISTRIBUTION\) return;/);
 assert.match(source, /function checkForUpdates\(manual = false\)\s*\{\s*if \(IS_TEST_DISTRIBUTION\) return;/);
});
