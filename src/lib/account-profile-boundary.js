'use strict';

// Standalone stand-in for the ToolsEnabled engine module
// src/lib/account-profile-boundary.js (583 lines, git blob 642db5bd).
//
// The byte authority and its test fixture call only assertAccountProfilePath.
// On POSIX the engine function reduces to the code below: it evaluates the
// installation profile root (the account's absolute home directory), requires
// a non-empty absolute path, and returns path.resolve(value.trim()). The
// requireOwnedProfile option has no effect on POSIX in the engine either.
//
// Not carried over: the Windows branch (profile-alias normalization, short-name
// resolution through the owner's metadata, the reparse-point walk and the
// foreign-profile refusal) and the environment-confinement helpers. Rather
// than run without that boundary, this stand-in refuses on Windows.
// docs/EXTRACTION.md records the change.

const os = require('node:os');
const path = require('node:path');

class AgentConfinementRefusal extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentConfinementRefusal';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

// POSIX branch of the engine's installationProfileRoot, unchanged.
function installationProfileRoot({ userInfo = os.userInfo } = {}) {
  let home = null;
  try {
    const user = userInfo();
    home = user && user.homedir;
  } catch (error) {
    throw new AgentConfinementRefusal(
      'AGENT_CONFINEMENT_ACCOUNT_PROFILE_UNAVAILABLE',
      'The operating-system account that owns this installation could not be established, so no agent session was prepared.',
      { cause: error && error.code ? String(error.code) : 'unknown' }
    );
  }
  if (typeof home !== 'string' || home.length === 0 || !path.isAbsolute(home)) {
    throw new AgentConfinementRefusal(
      'AGENT_CONFINEMENT_ACCOUNT_PROFILE_UNAVAILABLE',
      'The operating-system account that owns this installation has no absolute profile path, so no agent session was prepared.',
      {}
    );
  }
  return path.resolve(home);
}

function assertAccountProfilePath(value, {
  field = 'path',
  profileRoot = installationProfileRoot()
} = {}) {
  if (process.platform === 'win32') {
    throw new AgentConfinementRefusal(
      'AGENT_CONFINEMENT_PLATFORM_UNSUPPORTED',
      'This standalone extraction omits the Windows account-profile boundary; see docs/EXTRACTION.md.',
      { field }
    );
  }
  void profileRoot; // Evaluated for parity with the engine, which also ignores it on POSIX.
  const absolute = typeof value === 'string' && path.isAbsolute(value.trim());
  if (typeof value !== 'string' || value.trim().length === 0 || !absolute) {
    throw new AgentConfinementRefusal(
      'AGENT_CONFINEMENT_PROFILE_PATH_INVALID',
      `The ${field} path is not an absolute path, so no agent session was prepared from it.`,
      { field }
    );
  }
  return path.resolve(value.trim());
}

module.exports = Object.freeze({
  AgentConfinementRefusal,
  installationProfileRoot,
  assertAccountProfilePath
});
