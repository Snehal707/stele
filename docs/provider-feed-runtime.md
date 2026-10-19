# Provider-feed runtime support

## Why Studio needed a separate transport

Studio does not implement EVM contract execution. An EVM CREATE attempt returned
`UnsupportedEvmDeployment`; changing gas cannot enable that missing runtime.
The official [Studio limitations](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio/limitations)
and [message documentation](https://docs.genlayer.com/developers/intelligent-contracts/features/messages)
explicitly distinguish native Intelligent Contract calls from EVM interaction.

Stele now supports two **explicit** feed transports:

| Enrollment `feed_kind` | Contract | Governor read | Runtime scope |
| --- | --- | --- | --- |
| `evm` (default) | `contracts/ProviderInvoiceFeed.sol` | `initialized()`, `is_sealed()`, `invoice_count()` | Requires EVM-capable network; not Studio |
| `native` | `contracts/provider_invoice_feed.py` | Native IC `snapshot()` | Studio Next / GenVM |

The native route is not a proof of EVM interoperability. No automatic fallback
changes the meaning of an enrolled feed address when a call fails.

## Corrected EVM interface

Solidity reserves `sealed`, so the former public field could not compile.
It is now `is_sealed`. `invoice_count()` is an alias for `invoiceCount`, matching
the Governor's ABI. The corresponding Governor interface uses `is_sealed()`.
This is a coordinated interface change; do not point an older Governor at the
new Solidity feed and assume compatibility. No existing live contract was
upgraded as part of this change.

## Native feed lifecycle

1. Provider deploys `provider_invoice_feed.py`; deployment sender becomes owner.
2. Provider calls `update_feed(root, count, period)`. Root is a 64-character,
   lowercase hexadecimal string without `0x`.
3. Provider calls `seal()`. This requires initialization and permanently prevents
   changes to the snapshot. Other senders cannot update or seal it.
4. Enroll with the existing `enroll_with_feed` parameters, nonzero premium, and
   the new trailing `feed_kind="native"` argument. The default remains `evm`.
5. `review(agent)` retrieves the snapshot itself and compares its count against
   the pinned VaultTwin payment count. Matching counts continue to normal mandate
   evaluation; they do not automatically mean ON_MANDATE. Mismatches produce
   EVIDENCE_CONFLICT. Uninitialized, unsealed, malformed or unreadable feeds
   produce REVIEW_FAILED. Both failure branches halt the vault.

`feed_kind_of` is appended after existing storage fields. Existing enrollments
default to the EVM path. The new optional argument is appended to the public
method; the existing positional argument order is unchanged.

## Trust and scope

This is provider-controlled evidence, not an independently authenticated invoice
oracle. Enrollment chooses the feed address; Stele does not certify arbitrary
feed code or ownership. A sealed count is a fixed-period snapshot: additional
payments can make it conflict. Rotation/renewal is not implemented by this change.
The invoice root and period are metadata, not verified invoice proofs.

## Reproducible checks

`tests/test_native_provider_feed_direct.py` checks ownership, seal immutability,
strict snapshot parsing, fail-closed dispatch, EVM getter alignment, and the
three review branches. Together with enrollment, freshness, and existing feed
helper tests, 20 direct tests passed on genlayer-test 0.29.2 / genlayer-py 0.16.3.
These tests mock cross-contract reads and judgment; they are not consensus proof.

`scripts/verify_native_provider_feed.mjs` uses the isolated v0.6-compatible SDK
selected by `STELE_TEST_SDK_DIR`. It requires Studio-dev chain 61997, creates an
in-memory wallet, uses simulator funding, deploys fresh contracts, and asserts
finalized execution and resulting state for each case. No saved wallet is read.
It stops on unexpected results, preserves each submitted transaction hash, and
does not change frontend addresses. Reports are saved under
`results/native-provider-feed-<timestamp>.json`; inspect `passed` and each case,
not merely whether a report file exists.

The script explicitly pins the previously working Studio runner
`py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
in deployed copies, recording both repository and deployed-source SHA-256 hashes.
It does not silently use `latest` or mutate the source dependency header.
