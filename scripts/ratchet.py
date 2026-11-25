#!/usr/bin/env python3
"""Keep a linter on in a codebase that already has findings: fail only on new ones.

    python3 scripts/ratchet.py NAME -- COMMAND...            # check
    python3 scripts/ratchet.py NAME --record -- COMMAND...   # write or shrink the record

Runs COMMAND, reads the warnings it prints (Scarb, Cargo and Clippy style: a `warning:` or
`warn:` line followed by ` --> file:line:col`), and compares them with `.ratchet/NAME.txt`.

- A warning that is not in the record fails the check.
- A recorded warning that no longer appears also fails, until the record is shrunk with
  --record. The record can therefore only get smaller.
- --record creates the record when none exists. Afterwards it only removes or lowers entries; it
  refuses to add new ones. Adding one is a deliberate hand edit of the record file.

Warnings are keyed by file and message, not by line, so moving code does not disturb the record.
After upgrading the linter, expect to refresh the record: reworded messages count as new.
"""

from collections import Counter
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
START = re.compile(r"(?:\x1b\[[0-9;]*m)*(warn|warning|error)(?:\[\w+\])?(?:\x1b\[[0-9;]*m)*: (.*)")
WHERE = re.compile(r"\s*--> (.+?):\d+:\d+")
COLOUR = re.compile(r"\x1b\[[0-9;]*m")


def findings(output, directory):
    """Count warnings as `file: message`, with paths relative to the repository root."""
    found, message = Counter(), None
    for line in output.splitlines():
        start, where = START.match(line), WHERE.match(COLOUR.sub("", line))
        if start:
            message = COLOUR.sub("", start.group(2)).strip() if start.group(1) != "error" else None
        elif message and where:
            path = (directory / where.group(1)).resolve()
            name = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path)
            found[f"{name}: {message}"] += 1
            message = None
    return found


def load(path):
    recorded = Counter()
    for line in path.read_text().splitlines() if path.is_file() else []:
        if line.strip() and not line.startswith("#"):
            count, key = line.split("\t", 1)
            recorded[key] = int(count)
    return recorded


def save(path, recorded, command):
    path.parent.mkdir(exist_ok=True)
    header = f"# Known findings of: {' '.join(command)}\n# count<TAB>file: message. Shrink only.\n"
    body = "".join(f"{count}\t{key}\n" for key, count in sorted(recorded.items()) if count > 0)
    path.write_text(header + body)


def main():
    arguments = sys.argv[1:]
    if "--" not in arguments or not arguments or arguments[0].startswith("-"):
        raise SystemExit(__doc__.split("\n\n")[1])
    split = arguments.index("--")
    name, options, command = arguments[0], arguments[1:split], arguments[split + 1 :]
    record = ROOT / ".ratchet" / f"{name}.txt"
    done = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if done.returncode != 0:
        print(done.stdout, end="")
        raise SystemExit(done.returncode)
    found, known = findings(done.stdout, Path.cwd()), load(record)
    new = found - known
    fixed = known - found
    if "--record" in options:
        if record.is_file() and new:
            print(f"ratchet {name}: refused to add {sum(new.values())} new finding(s)")
        refused = record.is_file() and bool(new)
        save(record, known - fixed if record.is_file() else found, command)
        print(f"ratchet {name}: record holds {sum(load(record).values())} finding(s)")
        raise SystemExit(1 if refused else 0)
    for key, count in sorted(new.items()):
        print(f"new    {count}x {key}")
    for key, count in sorted(fixed.items()):
        print(f"fixed  {count}x {key}")
    if new:
        print(f"ratchet {name}: {sum(new.values())} new finding(s). Fix them.")
    if fixed:
        print(f"ratchet {name}: {sum(fixed.values())} recorded finding(s) are gone. Shrink it:")
        print(f"  python3 scripts/ratchet.py {name} --record -- {' '.join(command)}")
    if new or fixed:
        raise SystemExit(1)
    print(f"ratchet {name}: {sum(found.values())} known finding(s), none new")


if __name__ == "__main__":
    main()
