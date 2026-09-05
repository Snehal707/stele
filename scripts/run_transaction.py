"""Submit one Stele write and append its receipt-backed JSONL record.

Use this for review, spend, claim, propose_mandate, or promote_mandate. The
review matrix runner imports the same ``run_and_record`` helper.
"""

import argparse
import json

from run_bradbury_reviews import NETWORK, run_and_record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", default=NETWORK)
    parser.add_argument("--governor", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--method", required=True,
                        choices=("review", "spend", "claim", "propose_mandate", "promote_mandate"))
    parser.add_argument("--agent")
    parser.add_argument("args", nargs="*")
    options = parser.parse_args()
    row = run_and_record(
        network=options.network,
        governor=options.governor,
        method=options.method,
        target=options.target,
        args=options.args,
        agent=options.agent,
    )
    print(json.dumps(row, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
