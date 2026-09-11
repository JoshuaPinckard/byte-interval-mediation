# Byte-Interval Mediation

Read-receipt write admission for concurrent coding agents. When several agents edit the same files, a mediated patch is admitted only after its author has observed the span it changes and its read set passes freshness checks. This repository is the byte authority from the ToolsEnabled engine, extracted to run on plain Node, with its test suites, the design probes and the recorded results.

Principal investigator: Josh Pinckard.

## What it does

- Records a durable receipt for every mediated read: scope, file, exact byte interval, content and file SHA-256, version, sequence number.
- Admits a patch only when its scope has read the span it changes and everything that scope read, in every file, is still current.
- Rebases byte-disjoint reads when an edit changes length, and invalidates overlapping ones. An unmediated change forces a whole-file reread.
- Treats a whole-file write as explicit blind replacement, never as a read.
- Creates files exclusively (fsynced stage, hard-link publication) and journals every publication as PREPARED, then COMMITTED, so a crash resolves from the bytes on disk.

`docs/DESIGN.md` states the guarantees, the non-guarantees and the threat model. Freshness and expiry are admission checks, not continuous monitoring or publication deadlines. Cross-file byte freshness through publication assumes all writers of the observed resources use the same authority.

## Status

Implemented and green in its own tests. Here, standalone: 68 of 68 tests and 6 of 6 probes pass on Node 22.19.0. In the engine, the same five suites plus three transport suites pass one file per process at commit `c34cab8c`, 117 tests in all. The records are in `data/`.

It does not solve semantic conflicts. Two byte-disjoint edits can still break an invariant that spans both regions; probe P4 shows it.

In the inspected engine snapshot (`c34cab8c`), the agents' coding workflow bypassed it. This source/deployment observation is not an acceptance receipt for the final 1.0.44 cut. The mediated `repo.*` tools pointed at the installed payload, and agents edited through host file tools that were not mediated. Mediation of those host tools (`host.read_file`, `host.write_file` and a new `host.patch_file`) is now implemented on an engine branch and awaiting deployment. Its test logs and measurements are in `data/host-mediation-branch/`.

The 2026-09-11 review independently reran the 68 core tests and six original probes, compared the extracted files against engine `c34cab8c`, and added two boundary checks. See `review/2026-09-11.md`; run `npm run review:boundaries` to reproduce those separate checks.

## Relation to Blast-Radius

Blast-Radius, a companion research project that is not yet public, designs an estimator for which regions a change may invalidate when nobody was recorded reading them. This repository is the exact tier beneath it: where a read was recorded, the answer is a lookup, not a prediction. `docs/HISTORY.md` traces both back to one redesign.

## Run it

Node 22.13 or later. No dependencies.

    npm test          # the five suites, one file at a time
    npm run probes    # the six design probes

`scripts/record-results.sh` reruns everything one file per process and writes TAP to `data/standalone/`.

## Layout

| Path | Holds |
|---|---|
| `src/lib/region-holds/byte-authority.js` | The authority, byte-identical to the engine |
| `src/lib/*.js` | Stand-ins for the two engine modules it requires |
| `tests/` | The five engine suites and their helpers, byte-identical |
| `probes/` | Design probes P1 to P5 and P7 |
| `docs/` | `DESIGN.md`, `HISTORY.md`, `EXTRACTION.md` |
| `data/` | TAP output from standalone and engine runs, `results.csv`, preliminary host-mediation measurements |
| `paper/` | Preprint source and PDF |

## Limits

- POSIX only. The engine's Windows account confinement is not extracted.
- 512 KiB per file. One cross-process lock serializes every operation; many-agent throughput has not been measured.
- Committed writes keep their full payload in the store (P7).
- Recovery covers process crashes, not power loss.

## License and citation

MIT, Copyright (c) 2026 Joshua Pinckard. Cite with `CITATION.cff`. `NOTICE` carries the attribution statement.

Josh Pinckard · josh@toolsenabled.ai · https://toolsenabled.ai
