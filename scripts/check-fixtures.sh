#!/usr/bin/env bash
# Golden fixtures shared by backend and frontend must be byte-identical (see .claude/pipeline/PROTOCOL.md).
set -eu
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fail=0
pairs=(
  "backend/tests/fixtures/timer-cases.json frontend/tests/fixtures/timer-cases.json"
  "backend/tests/fixtures/duration-cases.json frontend/tests/fixtures/duration-cases.json"
  "backend/tests/fixtures/membership-end-cases.json frontend/tests/fixtures/membership-end-cases.json"
)
for pair in "${pairs[@]}"; do
  set -- $pair
  a="$root/$1"; b="$root/$2"
  if [ ! -f "$a" ] && [ ! -f "$b" ]; then continue; fi   # not created yet
  if [ ! -f "$a" ] || [ ! -f "$b" ]; then echo "fixture missing on one side: $1 / $2" >&2; fail=1; continue; fi
  if ! cmp -s "$a" "$b"; then echo "fixtures differ: $1 vs $2" >&2; fail=1; fi
done
exit $fail
