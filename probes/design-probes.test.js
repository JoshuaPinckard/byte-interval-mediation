'use strict';

// Design probes. First run against the ToolsEnabled engine on 2026-09-07.
//
// Each probe PASSES when the limitation it names is present: the assertions pin
// current behaviour, they do not endorse it. docs/DESIGN.md discusses each one.
// P6 of the original set exercised an unrelated engine module and is not part
// of this repository; the numbering is kept so that P4 stays P4.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, binding, change, inspect } = require('../tests/helpers/byte-authority-fixture');

// P1, liveness: a deleted dependency blocks every later write by the same scope.
test('deleted obsolete dependency strands unrelated later writes in the same scope', async t => {
  const f = fixture(t), a = binding('a');
  const old = f.file('old-task.txt', 'done');
  await f.authority.observeRead({ binding: a, resource: old });
  fs.unlinkSync(old);
  await f.authority.observeRead({ binding: a, resource: f.resource });
  await assert.rejects(change(f.authority, a, f.resource, 0, 1, 'A'),
    e => e.code === 'BYTE_READ_SET_STALE' && e.details.repairs.some(r => r.reason === 'DEPENDENCY_ABSENT'));
});

// P2, liveness: a second reader shortens every lease on the resource to 60 s.
test('a second reader expires unchanged dependencies after 60 seconds', async t => {
  let now = 1000;
  const f = fixture(t, Buffer.from('abcdefghij'), { now: () => now });
  const a = binding('a'), b = binding('b');
  await f.authority.observeRead({ binding: a, resource: f.resource });
  await f.authority.observeRead({ binding: b, resource: f.resource });
  now += 60001;
  await assert.rejects(change(f.authority, a, f.resource, 0, 1, 'A'),
    e => e.code === 'BYTE_READ_SET_STALE' && e.details.repairs.some(r => r.reason === 'OBSERVATION_EXPIRED'));
});

// P3, lost update: a blind whole-file write of bytes obtained outside mediation
// erases a peer's committed patch.
test('a blind writer can overwrite a peer edit using stale bytes obtained outside mediated reads', async t => {
  const f = fixture(t), a = binding('a'), b = binding('b');
  const stale = fs.readFileSync(f.resource);
  await f.authority.observeRead({ binding: b, resource: f.resource });
  await change(f.authority, b, f.resource, 0, 1, 'B');
  await f.authority.applyWrite({ binding: a, resource: f.resource, bytes: stale });
  assert.equal(fs.readFileSync(f.resource, 'utf8'), 'abcdefghij');
});

// P4, semantics: two byte-disjoint edits both land although together they
// change a relation between the two regions ("1,1" becomes "0,0").
test('disjoint fresh byte claims do not enforce a cross-region semantic invariant', async t => {
  const f = fixture(t, Buffer.from('1,1')), a = binding('a'), b = binding('b');
  await f.authority.observeRead({ binding: a, resource: f.resource, startByte: 0, endByte: 1 });
  await f.authority.observeRead({ binding: b, resource: f.resource, startByte: 2, endByte: 3 });
  await change(f.authority, a, f.resource, 0, 1, '0');
  await change(f.authority, b, f.resource, 2, 3, '0');
  assert.equal(fs.readFileSync(f.resource, 'utf8'), '0,0');
});

// P5, identity: a new scope does not inherit its predecessor's read set, so a
// resumed agent's carried-over context is never checked.
test('a fresh scope with inherited unmediated context has no predecessor dependency check', async t => {
  const f = fixture(t), a = binding('before-resume'), b = binding('peer'), fresh = binding('after-resume');
  const dep = f.file('contract.txt', 'A');
  await f.authority.observeRead({ binding: a, resource: dep });
  await f.authority.closeLaunch({ binding: a, reason: 'transport-retired' });
  await f.authority.observeRead({ binding: b, resource: dep });
  await change(f.authority, b, dep, 0, 1, 'B');
  await f.authority.observeRead({ binding: fresh, resource: f.resource });
  await change(f.authority, fresh, f.resource, 0, 1, 'A');
  assert.equal(fs.readFileSync(f.resource, 'utf8'), 'Abcdefghij');
});

// P7, retention: committed whole-file payloads stay in the store after the
// writing scope closes.
test('committed whole-file contents remain in the coordination database after scope closure', async t => {
  const f = fixture(t), a = binding('a');
  await f.authority.applyWrite({ binding: a, resource: f.resource, bytes: Buffer.from('private-project-content') });
  await f.authority.closeLaunch({ binding: a, reason: 'task complete' });
  const rows = inspect(f.authority, "SELECT operation_json FROM operations WHERE status='COMMITTED'");
  assert.equal(Buffer.from(JSON.parse(rows[0].operation_json).replacementBase64, 'base64').toString(), 'private-project-content');
  assert.equal(inspect(f.authority, 'SELECT * FROM reads').length, 0);
});
