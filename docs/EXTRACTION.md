# Extraction notes

This repository is a standalone extraction of the byte authority from the ToolsEnabled engine. The engine source is identical at the three engine commits it was checked against: `c34cab8c` (where the per-suite results in `data/engine-runs/` were measured), `ca0e2f61` and `9922e98b`. Git blob hashes below were compared at all three.

The engine's directory layout is kept, so the authority and its tests run unmodified.

## Files copied without change

| File | Git blob | Change |
|---|---|---|
| `src/lib/region-holds/byte-authority.js` | `728f2d29` | none (875 lines) |
| `tests/byte-authority.test.js` | `c01bc3ad` | none |
| `tests/byte-authority-recovery.test.js` | `d2b237c9` | none |
| `tests/byte-authority-process.test.js` | `5549ec5c` | none |
| `tests/byte-authority-write.test.js` | `12b87fdc` | none |
| `tests/byte-authority-write-recovery.test.js` | `c85b357e` | none |
| `tests/helpers/byte-authority-fixture.js` | `309babfb` | none |
| `tests/helpers/byte-authority-child.js` | `3cade769` | none |
| `tests/helpers/byte-authority-v1-fixture.js` | `59927293` | none |

`git hash-object <file>` reproduces each hash.

## Files replaced by stand-ins

The authority requires two engine modules. Neither is needed in full.

**`src/lib/account-profile-boundary.js`.** The engine module (583 lines, blob `642db5bd`) confines paths to the Windows account that owns an installation. The authority and the test fixture call only `assertAccountProfilePath`. On POSIX the engine function evaluates `installationProfileRoot()` (the account's absolute home directory), requires a non-empty absolute path, and returns `path.resolve(value.trim())`; `requireOwnedProfile` has no effect there. The stand-in keeps exactly that, the `AgentConfinementRefusal` class and the POSIX branch of `installationProfileRoot`. Dropped: the Windows branch (profile-alias normalization, short-name resolution, the reparse-point walk, the foreign-profile refusal) and the environment-confinement helpers. On Windows the stand-in refuses with `AGENT_CONFINEMENT_PLATFORM_UNSUPPORTED` instead of running without that boundary. This extraction is POSIX-only.

**`src/lib/runtime-state-root.js`.** The engine module (627 lines, blob `4036322c`) chooses where the product writes state, and adopts legacy install state once. The authority calls `statePath('state', 'byte-coordination')` only when its caller passes no `stateRoot`; every test passes one. The stand-in resolves the root from `BYTE_MEDIATION_STATE_ROOT` (absolute), else `$XDG_STATE_HOME/byte-interval-mediation`, else `~/.local/state/byte-interval-mediation`, and creates a missing root with mode 0700 on Linux, as the engine does for its per-user root. Dropped: `TOOLSENABLED_STATE_ROOT`, the installed-payload test, the program-root fallback and legacy-state adoption.

## Design probes

`probes/design-probes.test.js` is the probe file first run on 2026-09-07 (`data/engine-runs/2026-09-07/design-probes.tap`), changed as follows:

- `require` paths point at `tests/helpers/` in this repository instead of absolute paths into an engine worktree.
- Probe 6 is removed. It tested an instruction-ledger module of the engine that has nothing to do with byte coordination. The other probes keep their numbers.
- The one-line probe bodies were reformatted onto several lines and given a comment each. Test names, statements and assertions are unchanged. `inspect` is imported at the top instead of inside probe 7.

## What is not extracted

- `src/lib/providers/repo-files.js`, the engine's reference integration (the `repo.read_file`, `repo.write_file` and `repo.patch_file` tools). It depends on the engine's audit ledger, tool registry, per-call capability and path-confinement modules. `docs/DESIGN.md` describes its adapters. The test fixture in `tests/helpers/byte-authority-fixture.js` is a complete, dependency-free set of the same four adapters.
- The engine's integration suites `repo-byte-transport`, `remote-byte-scope` and `fra-byte-mediation`. They exercise engine transports and cannot run standalone. Their recorded engine results are in `data/engine-runs/2026-09-10-c34cab8c/`.
