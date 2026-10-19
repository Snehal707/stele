# Studio-dev provider-feed checks — 2026-10-19

Endpoint: `https://studio-dev.genlayer.com/api` (chain `61997`). Contracts were
deployed with runner `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`.

The matching-count case completed on-chain: sealed feed count `3` equaled the
VaultTwin count `3`; review finalized with `FINISHED_WITH_RETURN`, ruling
`ON_MANDATE`, halt `false`. Governor `0xaB9992D719E56a20B615AC8D29C24A704077D952`,
feed `0x43CAA75C914376799fE09a4E422eD7e38f6f49D9`, vault
`0x7fFa288f60d6e3b77ef581E97600e8370b1d67Bf`. Review transaction:
`0xe558c38c2434b95ca018f95a29d8b70bbad1896e6ad6306a8af5d30fb48fd241`.

The conflict case completed on-chain: sealed feed count `2` conflicted with
VaultTwin count `3`; review finalized as `EVIDENCE_CONFLICT`, halt was true, and
a spend attempt finalized with `FINISHED_WITH_ERROR`, the expected
`Vault is halted` reason, and unchanged vault state. Governor
`0x6d1023339b1c0B8848B45626C6C0a274C2031F53`, feed
`0x2741aD804D0B3623582945FF80E09Eb5212d2a8C`, vault
`0xCe2d9d68321cE421138BE2A67188fEB32D2B0DA6`.

An initial unsealed case finalized as `REVIEW_FAILED`, but was inspected after
its 30-minute test halt window had elapsed. It was repeated with a 24-hour
window. The second run returned `REVIEW_FAILED`, reported the vault halted, and
rejected a spend with `FINISHED_WITH_ERROR` / `Vault is halted`; state stayed
unchanged. Governor `0xDb0ff215a1BC798B15903Ba19f280c410ea34f10`, feed
`0x67E27036F18a046995bF0A6c005E0cBEF3Ee0569`, vault
`0x8C3Ae0402e7FBCc1f3aaBBB63862aE9851e31593`. Review transaction:
`0xfa9ab9d390eae5d51473e84a174cd5ca1c73a42e3f1261f66a766ceb98c86c8e`;
rejected spend transaction:
`0xef69b8eebbd8a347b89f49e735ad2da7ef37c9f318410cb39b53b73438dc8339`.

The direct suite passed: 20 tests, including mocked matching, conflict, and
unsealed branches. The Solidity feed compiled with solc 0.8.24; its ABI contains
the Governor's getters `initialized()`, `is_sealed()`, and `invoice_count()`.
The Vite production build passed.

This verifies the native Studio route. The Solidity/EVM route has not been
deployed or tested on an EVM-capable network. Neither the tested Governor nor
the feed has been wired into the frontend or substituted for the current live
Governor.
