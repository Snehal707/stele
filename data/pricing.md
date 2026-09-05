# Off-chain pricing artifacts

- Pull date (UTC): 2026-09-04T21:14:23Z
- Raw dump: [DeFiLlama hacks API](https://api.llama.fi/hacks), saved as `data/defi/hacks_raw.json`
- Nexus sources: [claims history documentation](https://docs.nexusmutual.io/overview/claims-history), [public claims history](https://nexusmutualdao.io/claims-history), and [claims app](https://app.nexusmutual.io/claims)

## DeFiLlama slice

The raw technique field is `technique`. Its distinct values in this dump are:

`API Key Compromised`, `Address Poisoning`, `Admin Drain`, `Arbitrary External Call`, `Arithmetic Error`, `Backdoor Contract`, `Blind Signing`, `Borrow Logic Flaw`, `Bridge Logic Flaw`, `CDN Compromise`, `Caller Impersonation`, `Cross-Chain Message Spoofing`, `DNS Hijack`, `Database Breach`, `Decimal Miscalculation`, `Delegatecall Hijack`, `Deployer Key Compromised`, `Deposit Logic Flaw`, `Donation Attack`, `Exit Scam`, `First Depositor Attack`, `Flashloan Governance Attack`, `Forged Proof`, `Frontend Compromise`, `Funding Rate Arbitrage`, `Hash Collision`, `Hot Wallet Key Compromised`, `Impersonation Scam`, `Improper Access Control`, `Incomplete Signature Coverage`, `Incorrect Fee Accounting`, `Incorrect Share Accounting`, `Infinite Mint`, `Key Brute Forced`, `Key Leaked via Infrastructure`, `Key Stored Publicly`, `Liquidation Logic Flaw`, `Liquidity Rug`, `MEV Bot Drained`, `Malicious Proposal`, `Malware`, `Market Maker Bot Exploited`, `Merkle Proof Forgery`, `Missing Input Validation`, `Missing Slippage Check`, `Oracle Misconfiguration`, `Ownership Takeover`, `Phishing`, `Predictable Oracle Update`, `Private Key Compromised`, `Proof Verifier Bug`, `Proxy Upgrade Hijack`, `Read-Only Reentrancy`, `Redeem Logic Flaw`, `Reentrancy`, `Reward Logic Flaw`, `Risk Parameter Abuse`, `Rounding Error`, `Session Key Compromised`, `Signature Replay`, `Signature Verification Flaw`, `Signer Phishing`, `Social Account Takeover`, `Spoofed Event Log`, `Spot Price Manipulation`, `Staking Logic Flaw`, `Stale Oracle Price`, `Stale Price Arbitrage`, `Supply Chain Attack`, `Swap Logic Flaw`, `Token Approval Abuse`, `Treasury Misappropriation`, `Unbacked Cross-Chain Mint`, `Unbacked Mint`, `Uninitialized Proxy`, `Unknown`, `Validator Key Compromised`, `Vyper Compiler Bug`, `Weak Key Generation`, `Withdrawal Logic Flaw`.

The dump also has a `classification` field with these distinct values:

`Access Control`, `Bridge & Cross-Chain`, `Frontend & Infrastructure`, `Governance`, `Input Validation`, `Key Compromise`, `Market Manipulation`, `Oracle Manipulation`, `Protocol Logic`, `Reentrancy`, `Rugpull`, `Social Engineering`, `Token & Share Accounting`.

Because the requested concepts occur as exact category values in the printed set, filtering uses `classification` (recorded in the machine artifact as `technique_field`) with this allowlist only:

- Include: `Key Compromise`, `Access Control`, `Governance`.
- Exclude: `Oracle Manipulation`, `Rounding Error`, and every other classification. `Rounding Error` is present in the raw `technique` value set but is not an allowlisted classification.
- Keep only rows with numeric `amount` values for the USD statistics.

Results on 1,253 raw rows:

- `n`: 380
- Median loss: `$1,600,000`
- p95 loss: `$90,067,500` (linear interpolation)
- Dropped: 873 total — 865 rows outside the exact allowlist, plus 8 allowlisted rows with missing or non-numeric `amount` (Key Compromise 5, Access Control 2, Governance 1).

Suggested demo parameters are illustrative, not actuarial: a `$1,000,000` demo cap and a `250` bps premium basis (2.5% of the cap). These keep the slide/demo economics bounded despite the long-tailed slice.

DeFiLlama, CertiK Hack3D, and Immunefi use different methodologies; their headline totals disagree; we use only the DeFiLlama slice defined above

web2 (Moffatt CAD 812; Arup press ~HK$200M) is wording, not the loss triangle

## Nexus Mutual

Current public aggregate claims-paid amount and count: **unverified**. The current claims app reports that both totals could not be retrieved. The public history page does show an individual 2026 Morpho claim of `$3,060.88`, but that is not a verified current aggregate and is not used in the pricing statistics. Historical totals in older documentation are intentionally not reused.
