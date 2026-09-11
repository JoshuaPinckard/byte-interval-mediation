# Host-file mediation branch

Records from the engine branch that adds byte mediation to `host.read_file`, `host.write_file` and a new `host.patch_file`. Base: engine `9922e98b`. Tip: `3c40a8d4`. The branch is ready for repackaging and not yet deployed. Its code is not part of this repository.

| File | What |
|---|---|
| `host-byte-mediation.RED-at-9922e98b.log` | The branch's new 11-test suite run against the base engine: 0 of 11 pass. Absolute paths in stack traces are rewritten as `<workspace>`. |
| `host-byte-mediation.GREEN-at-3c40a8d4.log` | The same suite at the tip: 11 of 11 pass. Verbatim. |
| `bench-host-byte.json` | Verbatim benchmark output: `latency` is milliseconds per `host.read_file` + `host.write_file` round trip on a 100 KB file, 100 interleaved iterations with mediation on (`mediated`) and off (`legacy`); `retentionUnpruned` and `retentionPruned` are store growth over 500 writes of 100 KB keeping or pruning committed payloads; `retentionSpread` spreads 500 writes over 50 files, then closes the writing scope. |

The benchmark ran on 2026-09-11 from 07:23:10Z to 07:27:42Z, on Node v22.19.0. The machine was running other work at the time, and absolute times include the engine's full tool-dispatch path.
