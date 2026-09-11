'use strict';

// Standalone stand-in for the ToolsEnabled engine module
// src/lib/runtime-state-root.js (627 lines, git blob 4036322c).
//
// The byte authority calls statePath('state', 'byte-coordination') only when
// its caller passes no stateRoot; every test passes one. The engine resolves
// its root from TOOLSENABLED_STATE_ROOT, a per-user directory for an installed
// payload, or the program root for a source checkout, and adopts legacy
// payload state once. This stand-in keeps only the per-user rule, under its
// own variable and directory name:
//
//   1. BYTE_MEDIATION_STATE_ROOT, if set. It must be absolute.
//   2. $XDG_STATE_HOME/byte-interval-mediation, if XDG_STATE_HOME is absolute.
//   3. ~/.local/state/byte-interval-mediation.
//
// As in the engine on Linux, a root created here gets mode 0700. An existing
// root is never chmodded. docs/EXTRACTION.md records the change.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATE_ROOT_ENV = 'BYTE_MEDIATION_STATE_ROOT';
const PRODUCT_DIRECTORY = 'byte-interval-mediation';

function resolveStateRoot({ environment = process.env, homedir = os.homedir } = {}) {
  const raw = typeof environment[STATE_ROOT_ENV] === 'string' ? environment[STATE_ROOT_ENV].trim() : '';
  if (raw) {
    // A relative value would resolve against whatever cwd the process has.
    if (!path.isAbsolute(raw)) throw new Error(`${STATE_ROOT_ENV} must be an absolute path; received "${raw}".`);
    return path.resolve(raw);
  }
  const xdg = typeof environment.XDG_STATE_HOME === 'string' ? environment.XDG_STATE_HOME.trim() : '';
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, PRODUCT_DIRECTORY);
  return path.join(homedir(), '.local', 'state', PRODUCT_DIRECTORY);
}

function stateRoot() {
  const root = resolveStateRoot();
  fs.mkdirSync(root, { recursive: true, ...(process.platform === 'linux' ? { mode: 0o700 } : {}) });
  return root;
}

function statePath(...parts) {
  return path.join(stateRoot(), ...parts);
}

module.exports = { STATE_ROOT_ENV, resolveStateRoot, stateRoot, statePath };
