'use strict';

// Derive data/results.csv from the recorded TAP output. Usage:
//   node scripts/summarize-results.js > data/results.csv

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = [
  { dir: 'data/standalone', run: 'standalone', code: 'this repository', date: null },
  { dir: 'data/engine-runs/2026-09-10-c34cab8c', run: 'engine', code: 'engine c34cab8c', date: '2026-09-10' },
  { dir: 'data/engine-runs/2026-09-07', run: 'engine', code: 'engine snapshot', date: '2026-09-07' },
  { dir: 'data/host-mediation-branch', run: 'host-branch', code: null, date: '2026-09-11' }
];
// The host-branch logs name the engine commit they ran against.
const codeFromName = name => {
  const match = /(RED|GREEN)-at-([0-9a-f]{8})/.exec(name);
  return match ? 'engine ' + match[2] + ' (' + match[1] + ')' : '';
};

function counts(text) {
  const read = key => {
    const match = new RegExp('^# ' + key + ' (\\d+)$', 'gm');
    let total = 0, found = false, m;
    // A file holding several TAP streams (one per suite) reports one summary.
    while ((m = match.exec(text))) { total += Number(m[1]); found = true; }
    return found ? total : null;
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

const environment = fs.readFileSync(path.join(root, 'data/standalone/ENVIRONMENT.txt'), 'utf8');
const standaloneDate = (/^date (\d{4}-\d{2}-\d{2})/m.exec(environment) || [])[1] || '';

const rows = [['run', 'code', 'date', 'file', 'tests', 'pass', 'fail', 'skipped']];
for (const source of sources) {
  for (const name of fs.readdirSync(path.join(root, source.dir)).sort()) {
    if (!/\.(tap|txt|log)$/.test(name) || name === 'ENVIRONMENT.txt') continue;
    const c = counts(fs.readFileSync(path.join(root, source.dir, name), 'utf8'));
    if (c.tests === null) continue;
    rows.push([source.run, source.code || codeFromName(name), source.date || standaloneDate, path.posix.join(source.dir, name),
      c.tests, c.pass, c.fail, c.skipped]);
  }
}
process.stdout.write(rows.map(row => row.join(',')).join('\n') + '\n');
