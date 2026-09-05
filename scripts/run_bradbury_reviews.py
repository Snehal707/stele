"""Run Stele writes and persist receipt-backed JSONL results."""

import json
import ast
import re
import secrets
import subprocess
import tempfile
import time
import atexit
from datetime import datetime, timezone
from pathlib import Path


CLI = "genlayer.cmd"
NETWORK = "testnet-bradbury"
RESULTS_PATH = Path("results/runs.jsonl")
WRITE_HELPER = Path(__file__).with_name("genlayer_write.mjs")
GOVERNOR = "0x6094F27540b99d0b949C00F0A47b6Da5c2E72257"
VAULTS = {
    "on-mandate": ("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "0x82D1f574D4b198A6922a5690BfDF8F43615170a1"),
    "strangers": ("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "0xDEe3ef5d6bD34eA89A385ECca867710f585048d3"),
    "burst": ("0xcccccccccccccccccccccccccccccccccccccccc", "0x0EBeFa92723f728fd2Ea61e7E84aacF96EFE3c9e"),
    "drain": ("0xdddddddddddddddddddddddddddddddddddddddd", "0x9E306c0f53DE0d4442AdD4D497B514B8BA55116a"),
}

_keystore_path: Path | None = None
_keystore_password: str | None = None


def _cleanup_keystore() -> None:
    if _keystore_path is not None:
        try:
            _keystore_path.unlink(missing_ok=True)
        except OSError:
            pass


atexit.register(_cleanup_keystore)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def append_result(*, network: str, governor: str, tx_hash: str | None,
                  timestamp: str | None, verdict: str | None,
                  reason: str | None, pinned: str | None,
                  latency: float | None, validator_votes: list[str] | None,
                  execution: str | None, method: str,
                  **extra: object) -> None:
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "network": network,
        "governor_address": governor,
        "transaction_hash": tx_hash,
        "timestamp": timestamp,
        "method": method,
        "verdict": verdict,
        "verbatim_reason": reason,
        "pinned_string": pinned,
        "latency": latency,
        "validator_votes": validator_votes,
        "txExecutionResultName": execution,
        **extra,
    }
    with RESULTS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _run(args: list[str]) -> tuple[str, float, float, int]:
    max_attempts = 5
    for attempt in range(max_attempts):
        started = time.perf_counter()
        proc = subprocess.Popen([CLI, *args], stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, bufsize=1)
        lines = []
        submitted_at = None
        assert proc.stdout is not None
        for line in proc.stdout:
            lines.append(line)
            if submitted_at is None and "Transaction Hash" in line:
                submitted_at = time.perf_counter()
        proc.wait()
        output = "".join(lines)
        if submitted_at is not None:
            return output, started, submitted_at, proc.returncode
        if "-32005" not in output:
            raise RuntimeError(f"No transaction hash emitted (exit {proc.returncode}):\n{output}")
        if attempt == max_attempts - 1:
            raise RuntimeError("Bradbury capacity error (-32005) after bounded exponential backoff")
        delay = min(60, 2 ** attempt)
        print(f"Bradbury capacity (-32005); queued retry {attempt + 1}/{max_attempts - 1} in {delay}s", flush=True)
        time.sleep(delay)
    raise RuntimeError("unreachable")


def _ensure_keystore() -> tuple[Path, str]:
    global _keystore_path, _keystore_password
    if _keystore_path is not None and _keystore_path.exists() and _keystore_password is not None:
        return _keystore_path, _keystore_password
    password = secrets.token_urlsafe(32)
    fd, name = tempfile.mkstemp(prefix="stele-genlayer-", suffix=".json")
    import os
    os.close(fd)
    path = Path(name)
    path.unlink(missing_ok=True)
    exported = subprocess.run(
        [CLI, "account", "export", "--output", str(path), "--password", password],
        text=True, capture_output=True, check=False,
    )
    if exported.returncode != 0:
        path.unlink(missing_ok=True)
        raise RuntimeError(f"Could not export the active account for genlayer-js:\n{exported.stdout}{exported.stderr}")
    _keystore_path, _keystore_password = path, password
    return path, password


def _run_genlayer_write(*, target: str, method: str, args: list[object], value: int,
                        address_indexes: list[int]) -> tuple[str, float, float, int]:
    keystore, password = _ensure_keystore()
    request = json.dumps({"address": target, "functionName": method, "args": args,
                          "value": str(value), "addressArgIndexes": address_indexes})
    review_deadline = time.monotonic() + 25 * 60 if method == "review" else None
    attempt = 0
    while True:
        started = time.perf_counter()
        proc = subprocess.run(
            ["node", str(WRITE_HELPER), str(keystore), password, request],
            text=True, capture_output=True, check=False,
        )
        output = proc.stdout + proc.stderr
        submitted_at = time.perf_counter()
        if proc.returncode == 0:
            tx = output.strip().splitlines()[-1] if output.strip() else ""
            if not re.fullmatch(r"0x[0-9a-fA-F]{64}", tx):
                raise RuntimeError(f"genlayer-js did not return a transaction hash:\n{output}")
            return f"Transaction Hash: {tx}\n", started, submitted_at, proc.returncode
        capacity_error = (
            "-32005" in output
            or "at capacity" in output
            or "node is at capacity" in output
        )
        transient_revert = "Transaction reverted: EVM tx" in output and not capacity_error
        if not capacity_error and not transient_revert:
            raise RuntimeError(f"genlayer-js write failed (exit {proc.returncode}):\n{output}")
        if review_deadline is None and transient_revert:
            raise RuntimeError("Bradbury submission reverted after capacity backoff")
        if review_deadline is not None and time.monotonic() >= review_deadline:
            raise RuntimeError("Bradbury review capacity remained unavailable for 25 minutes")
        delay = min(120, 2 ** min(attempt, 7))
        if review_deadline is None:
            print(f"Bradbury capacity (-32005); queued retry {attempt + 1}/4 in {delay}s", flush=True)
        else:
            remaining = int(review_deadline - time.monotonic())
            print(f"Bradbury review capacity unavailable; retry {attempt + 1} in {delay}s ({remaining}s remaining)", flush=True)
        time.sleep(delay)
        attempt += 1


def tx_hash(output: str) -> str:
    match = re.search(r"(?:(?:Write|Deployment)\s+)?Transaction Hash:\s*(0x[0-9a-fA-F]{64})", output)
    if match is None:
        raise RuntimeError(f"Could not parse transaction hash:\n{output}")
    return match.group(1)


def receipt(tx: str) -> tuple[str, float]:
    result = subprocess.run(
        [CLI, "receipt", tx, "--status", "ACCEPTED", "--retries", "180", "--interval", "5000"],
        text=True, capture_output=True, check=False,
    )
    output = result.stdout + result.stderr
    if "-32005" in output:
        raise RuntimeError("Bradbury capacity error (-32005); stopping without retry")
    if result.returncode != 0:
        raise RuntimeError(f"Receipt polling failed for {tx}:\n{output}")
    _poll_finalized_background(tx)
    return output, time.perf_counter()


def _poll_finalized_background(tx: str) -> None:
    """Start long FINALIZED polling without delaying the ACCEPTED result."""
    flags = 0
    if hasattr(subprocess, "DETACHED_PROCESS"):
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(
        [CLI, "receipt", tx, "--status", "FINALIZED", "--retries", "720", "--interval", "5000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
        close_fds=True,
    )


def votes(output: str) -> list[str]:
    match = re.search(r"validatorVotesName:\s*\[([^]]+)\]", output)
    return re.findall(r"'([^']+)'", match.group(1)) if match else []


def execution_name(output: str) -> str | None:
    match = re.search(r"txExecutionResultName:\s*'([^']+)'", output)
    return match.group(1) if match else None


def verdict(governor: str, agent: str) -> dict[str, str]:
    encoded_agent = agent[2:] if agent.startswith("0x") else agent
    result = subprocess.run([CLI, "call", governor, "latest_verdict", "--args", f"addr#{encoded_agent}"],
                            text=True, capture_output=True, check=True)
    output = result.stdout + result.stderr
    ruling = re.search(r"ruling:\s*'([^']+)'", output)

    def repr_field(field: str, next_field: str) -> str | None:
        pattern = rf"{field}:\s*((?:'(?:\\.|[^'])*'\s*\+\s*)*'(?:\\.|[^'])*')\s*,\s*{next_field}:"
        match = re.search(pattern, output, re.S)
        if match is None:
            return None
        parts = re.findall(r"'((?:\\.|[^'])*)'", match.group(1), re.S)
        return "".join(ast.literal_eval("'" + part + "'") for part in parts)

    reason = repr_field("reason", "ruling")
    pinned = repr_field("pinned_state", "raw_output")
    if not (ruling and reason is not None and pinned is not None):
        raise RuntimeError(f"Could not parse verdict:\n{output}")
    return {"ruling": ruling.group(1), "reason": reason, "pinned": pinned}


def run_and_record(*, network: str, governor: str, method: str,
                   target: str, args: list[object], agent: str | None = None,
                   value: int = 0,
                   address_indexes: list[int] | None = None,
                   extra: dict[str, object] | None = None) -> dict[str, object]:
    output, _started, submitted_at, _exit_code = _run_genlayer_write(
        target=target, method=method, args=args, value=value,
        address_indexes=address_indexes or []
    )
    tx = tx_hash(output)
    print(f"Transaction Hash: {tx}", flush=True)
    submitted_timestamp = _utc_now()
    receipt_output, completed_at = receipt(tx)
    item = {"ruling": None, "reason": None, "pinned": None}
    verdict_error = None
    if method == "review":
        if agent is None:
            raise ValueError("review requires agent")
        try:
            item = verdict(governor, agent)
        except subprocess.CalledProcessError as error:
            verdict_error = f"latest_verdict unavailable after receipt: exit {error.returncode}"
        except RuntimeError as error:
            verdict_error = str(error)
    latency = round(completed_at - submitted_at, 3)
    append_result(
        network=network, governor=governor, tx_hash=tx,
        timestamp=submitted_timestamp, verdict=item["ruling"],
        reason=item["reason"], pinned=item["pinned"], latency=latency,
        validator_votes=votes(receipt_output),
        execution=execution_name(receipt_output), method=method,
        **(extra or {}), **({"verdict_error": verdict_error} if verdict_error else {}),
    )
    return {
        "method": method, "transaction_hash": tx,
        "timestamp": submitted_timestamp, "verdict": item["ruling"],
        "verbatim_reason": item["reason"], "pinned_string": item["pinned"],
        "latency": latency, "validator_votes": votes(receipt_output),
        "txExecutionResultName": execution_name(receipt_output),
    }


def main() -> None:
    for name, (agent, _vault) in VAULTS.items():
        for run_number in range(1, 4):
            row = run_and_record(
                network=NETWORK, governor=GOVERNOR, method="review",
                target=GOVERNOR, args=[agent], agent=agent,
                extra={"case": name, "run": run_number},
            )
            print(json.dumps(row, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
