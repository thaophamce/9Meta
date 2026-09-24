'use strict';

const fs = require('node:fs');

function hostnameOnly(value) {
  try { return new URL(String(value || '')).hostname; } catch { return ''; }
}

function sanitizeDiagnosticRecord(record) {
  const clean = { ...record };
  if ('url' in clean) clean.url = hostnameOnly(clean.url) || String(clean.url || '').split(/[/?#]/)[0];
  if ('proxy' in clean) clean.proxy = clean.proxy ? '[configured]' : '[direct]';
  for (const key of ['token', 'cookie', 'cookies', 'authorization', 'password', 'message', 'text', 'body']) delete clean[key];
  return clean;
}

function selectRecentRecords(records, { now = Date.now(), windowMs = 10 * 60_000 } = {}) {
  const cutoff = Number(now) - Number(windowMs);
  return records.filter((record) => {
    const timestamp = Date.parse(record?.at || '');
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= Number(now) + 60_000;
  });
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function appendRuntimeRecord(filePath, record, { maxBytes = 5 * 1024 * 1024 } = {}) {
  fs.mkdirSync(require('node:path').dirname(filePath), { recursive: true });
  try {
    if (fs.statSync(filePath).size > maxBytes) {
      const recent = selectRecentRecords(readJsonLines(filePath), { windowMs: 24 * 60 * 60_000 });
      fs.writeFileSync(filePath, recent.map((item) => JSON.stringify(sanitizeDiagnosticRecord(item))).join('\n') + '\n', 'utf8');
    }
  } catch {}
  fs.appendFileSync(filePath, `${JSON.stringify(sanitizeDiagnosticRecord(record))}\n`, 'utf8');
}

module.exports = { appendRuntimeRecord, readJsonLines, sanitizeDiagnosticRecord, selectRecentRecords };
