"""Deploy Stele's four vault twins and drive them into the review-state matrix."""

import argparse
import os
import re
import subprocess
import time


MANDATE = (
    "This agent pays recurring infrastructure invoices to a small set of "
    "declared providers. Invoices arrive a few times a month in modest amounts. "
    "It never pays a provider dozens of times in a short window, and never "
    "sends an amount that empties the vault in a single payment."
)
CLI = "genlayer.cmd" if os.name == "nt" else "genlayer"

AGENT = "0x434f6b35ccde8c02f07d9693958f4890d2954f41"
REVIEW_AGENTS = [
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "0xcccccccccccccccccccccccccccccccccccccccc",
    "0xdddddddddddddddddddddddddddddddddddddddd",
]
DECLARED = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
]
STRANGERS = [
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
]


def cli(args: list[str], password: str) -> str:
    last_output = ""
    for attempt in range(3):
        result = subprocess.run(
            [CLI, *args],
            input=password + "\n",
            text=True,
            capture_output=True,
            check=False,
        )
        last_output = result.stdout + result.stderr
        if result.returncode == 0:
            return last_output
        if attempt < 2:
            time.sleep(2)
    raise RuntimeError(
        f"GenLayer CLI failed after 3 attempts ({result.returncode}):\n{last_output}"
    )


def deploy(governor: str, password: str) -> str:
    output = cli(
        [
            "deploy",
            "--contract",
            "contracts/vault_twin.py",
            "--args",
            "1000",
            AGENT,
            governor,
        ],
        password,
    )
    match = re.search(r"Contract Address['\"]?: ['\"]?(0x[0-9A-Fa-f]{40})", output)
    if match is None:
        raise RuntimeError(f"Could not parse deployed vault address:\n{output}")
    return match.group(1)


def spend(vault: str, destination: str, amount: int, password: str) -> None:
    cli(
        [
            "write",
            vault,
            "spend",
            "--args",
            destination,
            str(amount),
        ],
        password,
    )


def enroll(governor: str, agent: str, vault: str, password: str) -> None:
    cli(
        [
            "write",
            governor,
            "enroll",
            "--args",
            agent,
            vault,
            MANDATE,
            str(DECLARED).replace("'", '"'),
        ],
        password,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--governor", required=True)
    parser.add_argument(
        "--password",
        default=os.environ.get("GENLAYER_KEYSTORE_PASSWORD"),
        help="Studio keystore password, or set GENLAYER_KEYSTORE_PASSWORD",
    )
    args = parser.parse_args()
    if not args.password:
        raise SystemExit("Provide --password or GENLAYER_KEYSTORE_PASSWORD")

    vaults = {}
    agents = {}
    for name, agent in zip(
        ("on-mandate", "strangers", "burst", "drain"), REVIEW_AGENTS
    ):
        vaults[name] = deploy(args.governor, args.password)
        agents[name] = agent
    for vault in vaults.values():
        name = next(key for key, value in vaults.items() if value == vault)
        enroll(args.governor, agents[name], vault, args.password)

    for destination, amount in zip(DECLARED, (100, 120)):
        spend(vaults["on-mandate"], destination, amount, args.password)
    for destination, amount in zip(STRANGERS, (100, 120)):
        spend(vaults["strangers"], destination, amount, args.password)
    for index in range(47):
        spend(vaults["burst"], DECLARED[0], 4, args.password)
    spend(vaults["burst"], DECLARED[0], 32, args.password)
    spend(vaults["drain"], DECLARED[0], 1000, args.password)

    for name, address in vaults.items():
        print(f"{name}\t{agents[name]}\t{address}")


if __name__ == "__main__":
    main()
