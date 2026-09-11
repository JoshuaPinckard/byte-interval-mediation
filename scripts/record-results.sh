#!/bin/sh
# Run every suite and the probes, one file per process, and record the TAP
# output in data/standalone/. Set RUN_PREFIX to wrap each process, for example
# in a resource limiter: RUN_PREFIX="<wrapper> --" scripts/record-results.sh
set -u
cd "$(dirname "$0")/.." || exit 1
out=data/standalone
mkdir -p "$out"
{
  echo "node $(node --version)"
  echo "platform $(node -p 'process.platform + " " + process.arch')"
  echo "date $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$out/ENVIRONMENT.txt"
status=0
for file in tests/*.test.js probes/*.test.js; do
  name=$(basename "$file" .test.js)
  # shellcheck disable=SC2086
  ${RUN_PREFIX:-} node --test --test-reporter=tap "$file" > "$out/$name.tap" 2> "$out/$name.stderr.txt"
  code=$?
  echo "$name exit=$code" >> "$out/ENVIRONMENT.txt"
  [ "$code" -eq 0 ] || status=1
done
exit "$status"
