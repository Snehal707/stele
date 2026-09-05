"""Resume the funded Bradbury rewrite arc without duplicating completed steps."""

import subprocess
import json
import re
import time
from pathlib import Path

from run_bradbury_reviews import run_and_record


STATE_PATH = Path("results/rewrite_deployment.json")
GOVERNOR = ""
VAULT = ""
AGENT = "0x434f6b35ccde8c02f07d9693958f4890d2954f41"
PROVIDER = "0x1111111111111111111111111111111111111111"


def valid_address(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]{40}", value) is not None


def save_state(state: dict[str, object]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def deploy(contract: str, args: list[str]) -> tuple[str, str]:
    contract_path = Path(contract).resolve()
    expected_header = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }'
    first_line = contract_path.read_text(encoding="utf-8").splitlines()[0]
    if first_line != expected_header:
        raise RuntimeError(f"Deployment source header mismatch in {contract_path}: {first_line!r}")
    deadline = time.monotonic() + 25 * 60
    attempt = 0
    while True:
        command = ["genlayer.cmd", "deploy", "--contract", str(contract_path)]
        if args:
            command += ["--args", *args]
        result = subprocess.run(command,
                                text=True, capture_output=True, check=False)
        output = result.stdout + result.stderr
        address = re.search(r"Contract Address[\s':]+(0x[0-9a-fA-F]{40})", output)
        tx = re.search(r"Deployment Transaction Hash:\s*(0x[0-9a-fA-F]{64})", output)
        execution_ok = "txExecutionResultName: 'FINISHED_WITH_RETURN'" in output
        if result.returncode == 0 and address and tx and execution_ok:
            return address.group(1), tx.group(1)
        if "-32005" not in output:
            if result.returncode == 0 and tx and not execution_ok:
                raise RuntimeError(f"Deployment accepted with execution error:\n{output}")
            raise RuntimeError(f"Deployment failed:\n{output}")
        if time.monotonic() >= deadline:
            raise RuntimeError("Bradbury deployment capacity remained unavailable for 25 minutes")
        delay = min(120, 2 ** min(attempt, 7))
        print(f"Bradbury deployment capacity unavailable; retry in {delay}s", flush=True)
        time.sleep(delay)
        attempt += 1


def view(method: str, *args: str) -> str | None:
    result = subprocess.run(
        ["genlayer.cmd", "call", GOVERNOR, method, "--args", *args]
        if method != "agent_state" else
        ["genlayer.cmd", "call", VAULT, method],
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        return None
    return result.stdout + result.stderr


def vault_state() -> str | None:
    result = subprocess.run(["genlayer.cmd", "call", VAULT, "agent_state"],
                            text=True, capture_output=True, check=False)
    return result.stdout + result.stderr if result.returncode == 0 else None


def has_latest_verdict() -> str | None:
    return view("latest_verdict", AGENT)


def run(method: str, target: str, args: list[object], *, agent: bool = False,
        address_indexes: list[int] | None = None, value: int = 0, step: str) -> None:
    row = run_and_record(
        network="testnet-bradbury", governor=GOVERNOR, method=method,
        target=target, args=args, agent=AGENT if agent else None,
        address_indexes=address_indexes, value=value,
        extra={"arc": "rewrite", "step": step},
    )
    print(row, flush=True)
    if row.get("txExecutionResultName") != "FINISHED_WITH_RETURN":
        raise RuntimeError(f"{step} did not finish successfully: {row}")


def main() -> None:
    global GOVERNOR, VAULT
    state = {}
    if STATE_PATH.exists():
        try:
            state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}

    if not valid_address(state.get("governor")):
        GOVERNOR, governor_tx = deploy("contracts/governor.py", [])
        state.update({"governor": GOVERNOR, "governor_deploy_tx": governor_tx})
        save_state(state)
        print({"step": "deploy_governor", "address": GOVERNOR, "transaction_hash": governor_tx}, flush=True)
    else:
        GOVERNOR = state["governor"]

    if not valid_address(state.get("vault")):
        VAULT, vault_tx = deploy("contracts/vault_twin.py", [
            "980", f"addr#{AGENT[2:]}", f"addr#{GOVERNOR[2:]}",
        ])
        state.update({"vault": VAULT, "vault_deploy_tx": vault_tx})
        save_state(state)
        print({"step": "deploy_vault", "address": VAULT, "transaction_hash": vault_tx}, flush=True)
    else:
        VAULT = state["vault"]

    enrolled = view("get_vault", AGENT)
    if enrolled is None or VAULT.lower() not in enrolled.lower():
        run("enroll_covered", GOVERNOR, [AGENT, VAULT,
            "This agent pays recurring infrastructure invoices to a small set of declared providers. Invoices arrive a few times a month in modest amounts.",
            [PROVIDER], 1800, 1800], address_indexes=[0, 1, 3], value=2000, step="enroll_covered")

    state = vault_state() or ""
    if "balance: 980" not in state or "spend_total: 20" not in state:
        run("seed_state", VAULT, [20, 1, 980, PROVIDER, "1", "20"], step="seed_normal")

    verdict = has_latest_verdict()
    if verdict is None or "balance: 980" not in verdict:
        run("review", GOVERNOR, [AGENT], agent=True, address_indexes=[0], step="review_v1_normal")

    state = vault_state() or ""
    if "balance: 0" not in state:
        run("seed_state", VAULT, [20, 1, 0, PROVIDER, "1", "20"], step="seed_drain")

    claim = view("get_last_claim", AGENT)
    if claim is None or "status: 'PAID'" not in claim:
        run("claim", GOVERNOR, [AGENT], address_indexes=[0], step="claim")

    version_two = view("get_mandate_version", AGENT, "2")
    if version_two is None or "status: 'active'" in version_two:
        run("propose_mandate", GOVERNOR, [AGENT], address_indexes=[0], step="propose_mandate")

    candidate_id = 2
    candidate = view("get_mandate_version", AGENT, str(candidate_id))
    if candidate is None or "status: 'active'" in candidate or "status: 'superseded'" in candidate:
        candidate_id = 3
        candidate = view("get_mandate_version", AGENT, str(candidate_id))
    promotion = view("get_promotion_result", AGENT)
    if candidate is not None and "status: 'dead_branch'" in candidate and (promotion is None or "PASSED" not in promotion):
        run("promote_mandate", GOVERNOR, [AGENT, candidate_id], address_indexes=[0], step="promote_mandate")

    state = vault_state() or ""
    verdict = has_latest_verdict()
    if "balance: 0" not in state:
        run("seed_state", VAULT, [20, 1, 0, PROVIDER, "1", "20"], step="reseed_drain")
    if verdict is None or "balance: 0" not in verdict:
        run("review", GOVERNOR, [AGENT], agent=True, address_indexes=[0], step="review_v2_drain")


if __name__ == "__main__":
    main()
