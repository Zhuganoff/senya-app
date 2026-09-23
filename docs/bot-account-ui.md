# Private AISports account UI — v128

The official `aisports/index.html` now hosts the account flow. It calls authenticated POST RPCs; the public feed is not a source of private accounts or personal bets. The existing personal Polymarket view remains separate from the new account and its money.

`aisports/bot-account.js` exports the real `Controller` and DOM `mount` used by the page and tests. The injected boundaries are `rpc(name, parameters)`, `session()` (current raw initData in memory only), `wallet()` (EIP-1193 provider), `resolveWallet(address)` (existing public Gamma resolver), and `eligibility()` (a strict, fresh browser-side region check before Enable). `create`, `settings`, `enable`, `stop`, `prepare`, `signTransfer`, `openOperation`, `refresh`, and `connect` are the supported actions. Reads run on return to the page and every ten seconds; they never sign or submit automatically. Session changes discard private state and late responses.

## Server contract

All bot RPC responses require `api_version: 1`. Account and operation envelope fields are defined in `ops/trading_accounts.sql` in the matching backend release. Calls derive identity exclusively from `p_init_data`; the client never submits an account/user ID as authorization. Expected policy versions and idempotency keys accompany mutations.

- Canonical transfer kinds are `FUNDING` and `WITHDRAW`.
- Transfer amounts use decimal strings, balances use strings of micro-pUSD units, and policy stake limits use basis points (1–1000). No daily cap is added by this UI.
- A server-created immutable intent binds operation, account, owner, chain, token, amount, source, recipient, nonce and expiry. The personal signer must still be selected on Polygon immediately before and after signing.
- Funding accepts only the exact DepositWallet `Batch` containing one ERC20 pUSD transfer to the bot wallet, zero native value and no extra call. Withdrawal accepts only the agreed `AISportsWithdrawal` intent returning funds to the personal verified funding wallet.
- All EIP-712 uint256 values, especially the funding nonce, must be serialized as decimal strings to preserve precision in a browser.
- `operation.fee_units` is a verified fee in micro-pUSD or null. Null disables signing. Zero is displayed only when the worker supplies a verified sponsored result; the UI never estimates gas or infers sponsorship from calldata alone.
- Runtime readiness and `runtime_expires_at` come from the server. An expired check or a failed refresh suppresses the enabled label. STOP is shown from `reason: USER_STOP`; withdrawal pause and changed-policy reasons remain separate.
- History and recent rejection reasons are private. Actual fill price, settled P&L and position valuation remain absent/“—” unless supplied as verified facts.

The new flow never calls Session Keys grant RPCs, never redirects to `aisports-wallet-test/mm.html`, and never requests a main private key, seed phrase or exchange credentials. A returning OWNED personal signer reuses the proof. Pending ownership verification is resumed rather than signing a new challenge.

## Wallet transport

`aisports/wallet-connect.js` first uses an injected MetaMask provider (including EIP-6963). Otherwise it loads the local pinned `@metamask/connect-evm` 2.1.1 bundle and uses its EIP-1193 provider. Desktop without an extension uses the package's phone QR transport; mobile uses its universal link. No authenticated app URL is copied: wallet metadata contains the origin only. Analytics and debug logging are disabled.

This follows the [official MetaMask Connect EVM interface](https://github.com/MetaMask/connect-monorepo/tree/main/packages/connect-evm) and [transport documentation](https://github.com/MetaMask/connect-monorepo). Chrome extensions are not available inside Telegram Desktop; the UI explains the phone QR option instead. Physical Telegram/iOS/Android pairing has **not been observed in this worktree** and must be accepted on those devices before claiming verified support.

The actual bundle, upstream license, source integrity, dependency lock and build recipe are included. `aisports/vendor/metamask-connect-manifest.json` records SHA256 and SHA384 SRI; the loader enforces SRI. The deprecated SDK 0.34.0 is not a runtime or lockfile dependency. MetaMask's shipped license defines an active-user threshold of 10,000; review the included license before growth beyond that threshold.

Deployment CSP must allow `wss://mm-sdk-relay.api.cx.metamask.io`, `img-src data:` and the SDK's injected modal styles, plus the app's existing Polygon RPC and `https://polymarket.com` for the browser region check. No analytics endpoint is needed with analytics disabled. The frontend must publish `bot-account.js`, `wallet-connect.js` and the `vendor` files with the HTML in one release. Actual public hosting and a staging command are documented in [bot-account-delivery.md](bot-account-delivery.md).

## Reproducible checks

```sh
node --test tests/*.test.cjs
cd tools/wallet-sdk
npm ci --ignore-scripts
npm run build
```

Browser acceptance uses the real official HTML and real client functions, with every HTTP/WebSocket request intercepted and fake wallet responses. It cannot send a real transaction. A Playwright installation and Chromium are required:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node tests/bot-account-browser.cjs
```

It saves mobile/desktop screenshots and `artifacts/ui/result.json`. Tested: explicit custody creation, distinct wallets and balances, transfer review/sign/submit/poll, no public-feed private projection, A-to-B state clearing, no horizontal overflow, no browser errors, and successful loading/instantiation of the actual shipped MetaMask Connect package. Unit tests separately cover withdrawal binding, account/chain changes during signing, expiry, unknown fees, stale runtime, concurrency, lost responses, policy limits and ten isolated client sessions.

These client tests do not prove server RLS, ten real accounts, actual orders, payout, real wallet signatures or physical QR pairing. Those require the matching backend acceptance and controlled release checks.
