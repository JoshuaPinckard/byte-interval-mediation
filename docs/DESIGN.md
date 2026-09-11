# Design

The byte authority admits writes to shared files on the evidence of what each writer actually read. It sits between file tools and the filesystem. Tools hand it a host-issued scope, a canonical resource path and four private adapters; it records reads, decides whether a write may publish, and journals publication so a crash can be recovered. It infers nothing about meaning.

Source: `src/lib/region-holds/byte-authority.js`. Section references below name its functions.

## Model

**Scope.** A host-issued transport identity: `principal`, `runtimeScopeId`, `scopeKind` (`owner-host-session`, `standalone-mcp` or `paired-desktop`), and nullable launch, lane, run and roster references. Tool arguments cannot supply one. A scope binding is fixed on first use; a different binding under the same id refuses (`BYTE_SCOPE_MISMATCH`). A closed scope stays closed (`BYTE_SCOPE_CLOSED`).

**Resource.** An absolute canonical path, at most 512 KiB (`MAX_RESOURCE_BYTES`). The store records its version, SHA-256, length and presence. Missing and empty are different states.

**Read receipt.** Created by `observeRead` for exactly the bytes returned. It binds the scope, resource, half-open byte interval `[startByte, endByte)`, SHA-256 of the returned bytes, SHA-256 of the whole materialized file, resource version, lease expiry and the durable event sequence. Offsets count bytes, not characters or lines.

**Observation.** The live projection of a receipt: one or more intervals with the observed bytes, a version, an expiry and an optional stale reason (`MEDIATED_WRITE`, `UNMEDIATED_CHANGE`, `WHOLE_FILE_WRITE`).

**Conflict is interval intersection** (`intersects`). Non-empty spans `[a,b)` and `[c,d)` conflict when `a < d` and `c < b`, so adjacent spans do not. A point `p` (an insertion or an empty-file observation) conflicts with `[c,d)` when `c <= p < d`: inserting at the left edge of someone's span conflicts, inserting at its right edge does not. Two points conflict when equal.

**Leases.** An observation lasts 60 minutes. When another scope holds a live observation of the same resource, the new one lasts 60 seconds and every observation of that resource is capped at 60 seconds. Both values come from the buildout's defaults for read-claim lifetime (`docs/HISTORY.md`).

## Operations

Every operation runs inside one lifetime lock (`_locked`): an SQLite `BEGIN IMMEDIATE` transaction on `lock.sqlite`, held across the whole asynchronous operation and retried every 10 ms for up to 10 s (`BYTE_AUTHORITY_BUSY`). The operating system releases it if the process dies; nothing steals it by age. State lives in a separate `data.sqlite` with `synchronous=FULL`, so PREPARED is durable before publication while the lock is still held. Before admitting anything, the authority recovers pending operations on the target and on every resource the scope has read (`_recoverRelevant`).

**Read** (`observeRead`). Materialize the whole file through the adapter, check the window, run the caller's validation (the engine refuses windows that are not complete UTF-8), then record. A new observation replaces the scope's older observations that it covers or intersects, keeping their parts outside the new window. An observation marked `UNMEDIATED_CHANGE` or `WHOLE_FILE_WRITE` is replaced only by a whole-file read.

**Patch** (`applyPatch`). Admitted only if

1. every observation in the scope's read set, on every file, is unexpired and byte-equal to the current contents, and every file it names still exists (`_validateReadSet`); otherwise `BYTE_READ_SET_STALE`, with a list of regions to reread and no file content;
2. the changed span, derived by the caller's `derivePatch` from the current bytes, is covered by the live intervals of a single read receipt of the same scope (`_selectReceipt`); otherwise `BYTE_READ_REQUIRED`.

On commit, observations are rebased (`_rebaseReads`). With `[s,e)` replaced by `r` bytes and `delta = r - (e - s)`: observations starting at or after `e` shift by `delta`; observations ending at or before `s` are unchanged; an overlapping observation splits into its left part, the replaced middle and its shifted right part. The middle is marked `MEDIATED_WRITE` for other scopes; for the writer it becomes an observation of the replacement bytes. For lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `cargo.lock` and four others in `WHOLE_FILE_NAMES`), any patch invalidates every other scope's observations of the file, which then need a whole-file reread.

**Whole-file write** (`applyWrite`). Explicit blind replacement: no read of the target is required and none is created, not even for the writer. The scope's read set is still validated. A committed write marks every observation of the resource `WHOLE_FILE_WRITE`, the writer's included.

**Creation.** Writing a missing file requires two more adapters. `prepareCreate` writes the bytes to an exclusively created (`O_EXCL`), fsynced sibling named from the operation id; PREPARED records its device, inode, digest and length. Publication is a hard link from the stage to the target, which fails if anything is already there. Only the exact journaled stage may be unlinked afterwards. An interruption before PREPARED can leave an unreferenced stage; it is never adopted or swept by age or name.

**Publication** (`_publishOperation`). Insert PREPARED with a SHA-256 checksum over the operation record. Check the scope synchronously, call the publisher (which gets a synchronous check to run immediately before its rename or link), re-materialize and confirm the after-image (and, for creation, the staged identity), then commit: rebase or invalidate observations, bump the version and set COMMITTED in one transaction. A revocation after commit reports the write as committed (`BYTE_PUBLICATION_COMMITTED_SCOPE_REVOKED`), never as refused.

**Recovery** (`_recoverPendingLocked`). A pending operation is first validated: checksum, field consistency, scope binding and the recorded base version. Then the current bytes decide. Before-image: ABORTED (a pending no-op commits instead). After-image, plus the staged identity for creation: COMMITTED as recovered, with its read-set effects applied once. Anything else: UNKNOWN, refused with `BYTE_RECOVERY_UNRESOLVED`. That blocks the resource and the scopes that read it, not unrelated work.

**Unmediated change.** Whenever the authority materializes a resource whose presence, hash or length differs from the record, it bumps the version and marks every observation of the resource `UNMEDIATED_CHANGE` (`_resource`). No coordinate transform is known for such a change, so only a whole-file reread clears it.

**Closure** (`closeLaunch`). Marks the scope closed and deletes its observations. Receipts, operations and events remain.

## Guarantees

These hold when every writer of the covered files goes through the authority, the adapters are correct and processes fail by stopping.

1. **No lost update between mediated patches.** A patch publishes only if the bytes it replaces equal what its scope observed. A concurrent committed change to those bytes makes that observation stale, so the patch refuses.
2. **Cross-file read validity.** Any mediated write, patch or whole-file, publishes only if every observation of the writing scope is current, on every file it read.
3. **Exact receipts.** A receipt describes exactly the bytes released, and is durable before release. A failed validation creates no receipt.
4. **Disjoint work survives.** Byte-disjoint mediated edits both land, including when an earlier edit changed length and shifted the later one's coordinates.
5. **Observed drift invalidates.** An unmediated change visible at the next materialization invalidates every observation of the file and requires a whole-file reread.
6. **Blind writes are explicit.** A whole-file write is recorded as `blind-whole-file` intent, creates no receipt and invalidates every observation of the file.
7. **Creation never replaces.** A creation publishes by hard link from an exclusive, fsynced, journaled stage, and fails rather than replace a file that appeared meanwhile.
8. **Crash recovery by evidence.** After a process crash, a pending publication resolves to ABORTED or COMMITTED only when the bytes on disk prove which, and its read-set effects apply exactly once. Otherwise it stays UNKNOWN and quarantines only what depends on it. A missing or corrupt store refuses; it is not treated as empty history.
9. **Serialization.** One cross-process OS lock orders every operation, and a dead holder releases it.
10. **Scope binding.** A receipt from one scope cannot authorize another. Revocation is checked synchronously immediately before publication.

## Non-guarantees

Each of these is by design or known; probes P1 to P7 in `probes/` demonstrate the ones marked.

- **Semantic dependencies (P4).** Only observed bytes are protected. Two byte-disjoint edits can break an invariant that spans both regions.
- **Blind writes of stale bytes (P3).** A whole-file write needs no read of its target, so a writer holding bytes obtained outside mediation can erase a peer's committed patch.
- **Unmediated writers.** Editors, shells and other tools that bypass the authority are not fenced. Their changes are detected only when next observed, and a change that lands between the adapter's final comparison and its rename is not caught.
- **Scope continuity (P5).** A new scope starts with an empty read set. An agent resumed under a new scope carries context the authority never checks.
- **Liveness (P1, P2).** A deleted dependency blocks its scope's later writes until the file is restored and reread, or a new scope is used. Contention cuts leases to 60 seconds. No repair budget or escalation is implemented.
- **Retention (P7).** Operation records keep full replacement bytes after commit and after scope closure. There is no pruning or compaction.
- **Throughput.** One transaction serializes every operation across processes. Many-agent throughput has not been measured.
- **Durability scope.** This is process-crash recovery. It is not a guarantee against power loss or filesystem corruption beyond what fsync and SQLite provide.
- **Reading is not understanding.** A reread satisfies the mechanical check. It does not show that an agent reasoned about the change.

## Threat model

- **In scope.** Several cooperating but fallible agents, each holding a host-issued scope, reading and writing the same files concurrently; stale views and outdated context; process crashes at any point, including between PREPARED and COMMITTED; adapter exceptions; revocation arriving in an asynchronous gap.
- **Out of scope.** An agent with direct filesystem access that chooses to bypass the authority; a compromised host process; anyone able to write the SQLite store. The operation checksum detects corruption; it is not authentication. Network filesystems and hard-link aliases beyond refusal are not supported.

## Adapters

The authority does no file I/O of its own on the target. Callers supply:

- `materialize(resource)`: current bytes as a Buffer, or `{ present: false }` only when the file is known absent; an optional `identity` (`device:inode`).
- `publish(input)`: publish `after` atomically over `before` (or create-only), calling `input.assertCurrent()` synchronously immediately before the rename or link.
- `prepareCreate(input)` and `reconcileCreateStage(input)`: required only for creation and its recovery.

`tests/helpers/byte-authority-fixture.js` is a complete POSIX set. The engine's production adapters (`repo-files.js`, not included) add the following. Reads go through a descriptor opened with `O_NOFOLLOW`, bounded, and compared by device, inode, size, mtime and ctime before and after. Hard-link and symlink aliases are refused. Publication re-reads and compares the before-image both before and after writing an fsynced temporary, then renames under the engine's whole-file lock.
