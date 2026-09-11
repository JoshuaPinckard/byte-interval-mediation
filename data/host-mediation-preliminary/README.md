# Preliminary host-mediation measurements

`bench-host-byte.json` is copied verbatim from the engine branch that is adding byte mediation to `host.read_file`, `host.write_file` and a new `host.patch_file` (base: engine `9922e98b`). The branch's benchmark script drives the engine's tool dispatcher and is not part of this repository.

- Measured 2026-09-11, 07:23:10Z to 07:27:42Z, Node v22.19.0, one machine that was running other work at the time.
- `latency`: milliseconds per `host.read_file` + `host.write_file` round trip on a 100 KB file, 100 interleaved iterations each, with mediation on (`mediated`) and off (`legacy`).
- `retentionUnpruned`, `retentionPruned`: store growth over 500 writes of 100 KB, keeping committed payloads versus pruning them at commit. `retentionSpread`: 500 writes spread over 50 files, then the store after the writing scope closed.

The branch had no test verdict when these were copied. They are reported as preliminary and are not results of this repository's code.
