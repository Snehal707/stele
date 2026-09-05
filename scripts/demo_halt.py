"""Demonstrate Stele Governor halting and expiry on Bradbury."""

import os
import re
import subprocess
import time


CLI = "genlayer.cmd"
GOVERNOR = "0xC60323A650a418B8931C93EC0f7082db9E22fa6f"
VAULT = "0xbfc12A31F9DEcF1F42AD491A403374F8D2099Dd8"
AGENT = "0xcccccccccccccccccccccccccccccccccccccccc"
PROVIDER = "0x1111111111111111111111111111111111111111"
MANDATE = (
    "This agent pays recurring infrastructure invoices to a small set of declared "
    "providers. Invoices arrive a few times a month in modest amounts. It never "
    "pays a provider dozens of times in a short window, and never sends an amount "
    "that empties the vault in a single payment."
)


def cli(args: list[str], retries: int = 3) -> str:
    last = ""
    for _ in range(retries):
        result = subprocess.run([CLI, *args], text=True, capture_output=True)
        last = result.stdout + result.stderr
        if result.returncode == 0:
            return last
        time.sleep(2)
    raise RuntimeError(last)


def tx(output: str) -> str:
    match = re.search(r"(?:Write|Transaction) Transaction Hash:\s*\n?(0x[0-9a-fA-F]{64})", output)
    if not match:
        raise RuntimeError(output)
    return match.group(1)


def write(method: str, *args: str) -> str:
    return cli(["write", GOVERNOR if method == "review" or method == "enroll" else VAULT, method, "--args", *args])


def main() -> None:
    print("enroll", flush=True)
    write("enroll", AGENT, VAULT, MANDATE, f'["{PROVIDER}"]')
    for index in range(48):
        write_spend = cli(["write", VAULT, "spend", "--args", PROVIDER, "4"])
        if index % 8 == 7:
            print(f"payments={index + 1}", flush=True)

    print("review", flush=True)
    review_output = write("review", AGENT)
    review_tx = tx(review_output)
    cli(["receipt", review_tx, "--status", "ACCEPTED", "--retries", "120", "--interval", "5000"])
    print("halted_after_review", cli(["call", GOVERNOR, "is_halted", "--args", AGENT]).strip(), flush=True)

    rejected = subprocess.run(
        [CLI, "write", VAULT, "spend", "--args", PROVIDER, "1"],
        text=True, capture_output=True,
    )
    print("spend_while_halted", rejected.returncode, rejected.stdout + rejected.stderr, flush=True)

    for _ in range(2):
        time.sleep(30)
    time.sleep(5)
    print("halted_after_expiry", cli(["call", GOVERNOR, "is_halted", "--args", AGENT]).strip(), flush=True)
    succeeded = cli(["write", VAULT, "spend", "--args", PROVIDER, "1"])
    print("spend_after_expiry", succeeded[-1200:], flush=True)


if __name__ == "__main__":
    main()
