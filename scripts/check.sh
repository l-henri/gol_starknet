#!/bin/sh
# The one place this repository's checks are defined. The commit hook and CI call it.
# Usage: ./scripts/check.sh [--fast]    --fast skips the tests.
set -eu
cd "$(dirname "$0")/.."

# Cairo contracts (repository root; the formatter also covers spike/).
scarb fmt --check
# Not run yet: `scarb lint --test --deny-warnings` reports about 120 findings in the current
# contracts. Add it here once they are cleaned up.
scarb build

# Rust SDK workspace (crates/*).
cargo fmt --check
# Not run yet: `cargo clippy -- -D warnings` reports 6 findings in gol-sdk. Add it once fixed.
cargo build --locked --all-targets

# Web app.
(
    cd ui/game-of-life
    # CI starts without node_modules; locally an existing install is reused to keep commits fast.
    [ -d node_modules ] || npm ci
    npm run lint
    npx tsc --noEmit
)

if [ "${1:-}" = "--fast" ]; then
    exit 0
fi

# Run a test command, keep its exit status, and also fail when it ran no test at all.
# A pipe into tee would report tee's status, so a failing run would pass.
tested() {
    pattern=$1
    shift
    out=$(mktemp)
    status=0
    "$@" >"$out" 2>&1 || status=$?
    cat "$out"
    if [ "$status" -ne 0 ]; then
        rm -f "$out"
        exit "$status"
    fi
    if ! grep -Eq "$pattern" "$out"; then
        rm -f "$out"
        echo "check: '$*' ran no passing test" >&2
        exit 1
    fi
    rm -f "$out"
}

tested 'Tests: [1-9][0-9]* passed' snforge test
tested 'test result: ok\. [1-9]' cargo test --locked
# The web app has no automated tests yet.
