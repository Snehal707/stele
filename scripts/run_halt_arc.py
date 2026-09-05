"""Run the Bradbury halt arc with persistent deployment state."""

import json
import subprocess
import time
from pathlib import Path

from run_bradbury_reviews import run_and_record
from run_rewrite_arc import deploy, valid_address


STATE_PATH = Path("results/halt_deployment_full.json")
AGENT = "0x434f6b35ccde8c02f07d9693958f4890d2954f41"
PROVIDER = "0x1111111111111111111111111111111111111111"
DESTINATION = PROVIDER
EXPECTED_MANDATE = ("This agent pays recurring infrastructure invoices to a small set of declared providers. "
                    "Invoices arrive a few times a month in modest amounts. "
                    "It never pays a provider dozens of times in a short window, "
                    "and never sends an amount that empties the vault in a single payment.")


def call(governor: str, method: str, *args: str) -> str:
    result = subprocess.run(["genlayer.cmd", "call", governor, method, "--args", *args],
                            text=True, capture_output=True, check=False)
    return result.stdout + result.stderr


def assert_enrolled_mandate(governor: str) -> None:
    output = call(governor, "get_mandate_version", AGENT, "1")
    if EXPECTED_MANDATE not in output:
        raise RuntimeError(f"Enrolled mandate mismatch; expected exact full mandate in:\n{output}")
    print({"enrolled_mandate_assertion": "passed"}, flush=True)


def main() -> None:
    state = json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}
    if not valid_address(state.get("governor")):
        governor, tx = deploy("contracts/governor.py", [])
        state.update({"governor": governor, "governor_deploy_tx": tx})
        STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        print({"step": "deploy_governor", "address": governor, "transaction_hash": tx}, flush=True)
    governor = state["governor"]
    if not valid_address(state.get("vault")):
        vault, tx = deploy("contracts/vault_twin.py", [
            "1000", f"addr#{AGENT[2:]}", f"addr#{governor[2:]}",
        ])
        state.update({"vault": vault, "vault_deploy_tx": tx})
        STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        print({"step": "deploy_vault", "address": vault, "transaction_hash": tx}, flush=True)
    vault = state["vault"]

    def step(method: str, target: str, args: list[object], name: str,
             *, agent: bool = False, indexes: list[int] | None = None) -> dict:
        row = run_and_record(network="testnet-bradbury", governor=governor,
                             method=method, target=target, args=args,
                             agent=AGENT if agent else None,
                             address_indexes=indexes,
                             extra={"suite": "halt", "step": name})
        print(row, flush=True)
        return row

    step("enroll", governor, [AGENT, vault, EXPECTED_MANDATE,
         [PROVIDER], 1800, 1800], "enroll", indexes=[0, 1, 3])
    assert_enrolled_mandate(governor)
    step("seed_state", vault, [220, 1, 780, PROVIDER, "48", "220"], "seed_burst")
    review = step("review", governor, [AGENT], "review", agent=True, indexes=[0])
    print({"is_halted": call(governor, "is_halted", AGENT),
           "halt_expiry": call(governor, "get_halt_expiry", AGENT)}, flush=True)

    rejected = step("spend", vault, [DESTINATION, 1], "spend_rejected", indexes=[0])
    if rejected.get("txExecutionResultName") != "FINISHED_WITH_ERROR":
        raise RuntimeError(f"Expected halted spend rejection: {rejected}")
    print({"halted_spend_rejection": "inspect receipt trace for Vault is halted"}, flush=True)

    while "result:\ntrue" in call(governor, "is_halted", AGENT).lower().replace(" ", ""):
        print("Waiting for consensus-time halt expiry...", flush=True)
        time.sleep(60)
    print({"is_halted_after_expiry": call(governor, "is_halted", AGENT)}, flush=True)
    step("spend", vault, [DESTINATION, 1], "spend_after_expiry", indexes=[0])


if __name__ == "__main__":
    main()
