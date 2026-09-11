# Data

| Path | What | Produced by |
|---|---|---|
| `standalone/*.tap` | TAP output of this repository's five suites and the probes. One file per process, Node 22.19.0, Linux x64, 2026-09-11. | `scripts/record-results.sh`; on the recording machine each process also ran under a local thermal limiter |
| `standalone/ENVIRONMENT.txt` | Node version, platform, date and exit code per file | same |
| `engine-runs/2026-09-10-c34cab8c/*.txt` | Engine runs of all eight byte suites at engine commit `c34cab8c`, one file per process. The header lines are the run's own, except that the working directory is rewritten as `<workspace>`. | the engine's per-file test runner |
| `engine-runs/2026-09-07/byte-authority-four-suites.tap` | Four core suites (58 tests) against the engine snapshot reviewed on 2026-09-07, Node 22.19.0 | design review |
| `engine-runs/2026-09-07/design-probes.tap` | The original seven probes against the engine, 2026-09-07. Probe 6 tested an unrelated engine module (`docs/EXTRACTION.md`). | design review |
| `results.csv` | Test counts parsed from all of the above | `node scripts/summarize-results.js` |
| `host-mediation-branch/` | Test logs (RED at base, GREEN at tip) and latency and store-growth measurements from the engine branch that adds host-file mediation | that branch's test runner and benchmark script (see its README) |

A passing probe means the limitation it names was reproduced. Durations in the TAP files are wall-clock times of single runs on one machine, not benchmarks. Standard error was empty for every standalone run; the SQLite experimental-feature warning that Node prints appears inside the TAP streams.
