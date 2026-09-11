# History

Byte-interval mediation came out of a redesign of the ToolsEnabled coordination systems in late August 2026. This is a sanitized account taken from the internal design documents. Their measurements are not reproduced here and are not cited as results.

## Two questions, one substrate (2026-08-24)

The redesign split two questions that earlier work had treated as one:

| System | Question | Signal |
|---|---|---|
| GrepSaver | What should this agent read? | Co-read association: files read together |
| Filekeeper | What does this write put at risk? | Exact read inversion (who read the bytes being changed), then co-change for what nobody was recorded reading |

The two systems were kept apart because co-read and co-change measured different relations. They were given one substrate: a byte-interval region address and one read/write event log with two consumers.

**The region address.** Store byte extents; render line numbers. Intervals are half-open, and conflict is interval intersection. A region's identity is `(path, startByte, endByte)` plus a content hash, never a chunk index, which shifts whenever anything above it changes. The reasons recorded at the time: line-oriented round trips had altered files in the project's own repository, including files with mixed CRLF and LF endings, where a line-delta rebase cannot see a terminator rewrite; and byte offsets need no parser for any language. Hashes are taken over the bytes an agent actually touched, at the mediation point, never over repository blobs, because git's line-ending and export filters can make the two differ.

**Exact tier first.** An inverted read index answers "who read this region?" exactly wherever a read was recorded. It is a lookup, not a prediction. That leaves an estimator only the residual cases: reads before a claim, reads that bypass mediation, and the moment before an agent has read anything. The redesign calls the blast-radius estimator a cold-start mechanism for the read index. It enforces only on exact matches and treats ranked estimates as advice. The estimator is the subject of [Blast-Radius](https://github.com/JoshuaPinckard/co-read). This repository is the exact tier.

**Claims are mechanical.** The read set is accumulated by the system from the mediated calls an agent makes, as in optimistic concurrency control, not declared by the agent in advance. On invalidation the agent is told what to reread; the work is repaired, not aborted.

**Granularity by kind.** Source files get byte intervals. Lockfiles are treated whole-file, because their conflicts span the whole file. The redesign also recorded, from the start, that byte-disjoint edits can still be wrong together, and assigned that case to a test-verified integration gate rather than to granularity.

## The buildout (2026-08-25)

The build plan ordered the work: typed receipts at the mediation point, then a durable inverted read index, then exact region holds, then write-time validation with repair and an escalation budget, then dispatch admission. A receipt was specified as scope identity, canonical resource, half-open byte interval, SHA-256 of the exact materialized bytes, operation and outcome, and an append sequence with a schema version. A result whose receipt cannot be persisted is not released. Shell and subprocess effects are recorded as opaque events and never become claims. Default read-claim lifetime: 60 minutes while one reader holds the region, about one minute once a second reader arrives.

## What was built

The engine implementation is `src/lib/region-holds/byte-authority.js` (store schema v2). It is wired to `repo.read_file`, `repo.write_file`, `repo.patch_file` and the paired-desktop `workspace.read`. Against the plan:

- **Receipts and the read index:** built. Every mediated read produces a durable receipt, and observations are indexed by resource and interval.
- **Holds:** not built as holds. The plan's exact tier would hold a write until affected readers acknowledged. The implementation is optimistic instead: a writer with a current read set proceeds, the affected readers' observations are invalidated, and their next write refuses until they reread.
- **Write-time validation and repair:** built. A stale write refuses with the list of regions to reread. The escalation budget is not built.
- **Lease and lockfile defaults:** built as specified (60 minutes, 60 seconds under contention; whole-file policy for eight lockfile names).
- **Crash recovery and exclusive creation:** added during implementation. Neither design document specifies a publication journal or no-replace creation.
- **Dispatch admission, rosters, GrepSaver and the estimator:** not part of the authority. Scope bindings carry launch, lane and run fields that stay null until a real association exists.

## Review and probes (2026-09-07)

A design review ran the four core suites (58 tests, Node 22.19.0) and seven probes against the engine. Six probes concern the authority; they are P1 to P5 and P7 in `probes/`, and the recorded outputs are in `data/engine-runs/2026-09-07/`. The review recommended keeping the byte-accurate hashing, the lifetime lock, recoverable publication, no-replace creation and the stale-read refusals. It also recommended defining the read-set lifecycle (P1, P2, P5), making opaque versus coordinated publication explicit (P3) and bounding payload retention (P7). It classed P4 as the limitation the design had already assigned to integration testing.

## Deployment (ToolsEnabled 1.0.44)

In the 1.0.44 runtime the authority was effectively dormant. The `repo.*` tools work on the engine's own package root, which in an installed build is the installed payload, and generic writes there are refused. Agents edited their working clones through `host.read_file`, `host.write_file` and `host.exec`, and none of those were mediated: the host provider holds a whole-file write lock and records an audit entry, but never consults the authority. No production conflict data came from the authority.

## Current work

Host-file mediation is being implemented now. It routes `host.read_file`, `host.write_file` and a new `host.patch_file` through the same authority, in a store namespace separate from `repo.*`, with committed payloads pruned and an off switch. `host.write_file` is designed to replace an existing file only when the writing scope currently observes all of it. The branch had no test verdict when this was written. Its two preliminary measurements are in `data/host-mediation-preliminary/`. The first is a 100 KB read-and-write round trip of 266.01 ms median with mediation against 213.73 ms without. The second is store growth over 500 writes of 100 KB: 141,148,160 bytes with payloads kept against 4,931,584 bytes with them pruned.
