"""Print a Stele write transaction hash as soon as the CLI emits it."""

import re
import subprocess
import sys


proc = subprocess.Popen(
    ["genlayer.cmd", "write", *sys.argv[1:]],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
)
assert proc.stdout is not None
for line in proc.stdout:
    print(line, end="", flush=True)
    match = re.search(r"0x[0-9a-fA-F]{64}", line)
    if match and "hash" in line.lower():
        print(f"SUBMITTED_HASH={match.group(0)}", flush=True)
proc.wait()
raise SystemExit(proc.returncode)
