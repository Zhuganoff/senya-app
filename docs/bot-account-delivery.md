# Verified Mini App delivery and release preparation

Read-only public HTTP checks on 23 September 2026:

| URL under `https://zhuganoff.github.io/senya-app/` | Observed result |
| --- | --- |
| `aisports/index.html` | 200, `text/html; charset=utf-8`, server `GitHub.com`, BUILD v126 |
| `aisports/version.json` | 200, `application/json`, v126 |
| `aisports/bot-account.js` | 404; the v128 candidate has not been published |
| `aisports/vendor/metamask-connect-2.1.1.js` | 404; not published |
| `qr.js` | 200, `application/javascript; charset=utf-8` |
| `aisports/qr.js` | 404; candidate corrects the old relative reference to `../qr.js` |

The public HTML has no Content-Security-Policy header or meta policy. Its observed SHA256 was `fbc97a72ac7a6d49e43b869f4ef6d1064ce6c2c01afe0d2df1980431a173492e`; the v126 version JSON SHA256 was `11b219f96f019897f5ef8578df0ced1012614e3dccf8c645d2446339f6a4a3ba`. These are public-host observations, not a claim that the current Telegram menu was queried.

The backend `MINI_APP.md` §2 identifies GitHub Pages as the public host and documents that Supabase `app_page` is storage only: its gateway returned text/plain and sandbox CSP. `ops/server_sync.sh:37–38` changes the server bot's APP_URL to the `/aisports/index.html` path. The generic source `senya_bot.py:34` and local `.senya_bot_menu_url` still name the sandbox root; they do not establish the current remote official bot menu. `APP_MIRROR_URL` is empty in current source, so the old githack mirror described in MINI_APP.md is disabled. Do not enable that mirror or move the Mini App to app_page as part of this release.

## Executable staging and publication plan

1. From this isolated frontend worktree, run `node tools/stage-bot-account-release.cjs /absolute/new/output-directory`. It copies the exact ten public files and writes a per-file SHA256 manifest. It does not contact a service or publish anything. The unchanged root `qr.js` is included; root `index.html` and other sports pages are not overwritten.
2. Install and verify the matching authenticated bot-account SQL and server worker first, with real execution disabled. Missing RPCs must not be covered by a frontend-only release.
3. For the separately authorized GitHub Pages release, use the complete frontend commit and its static files. Do not use the legacy `ops/build_pages.sh` against the old backend `webapp/index.html`: it generates a single-file page and does not copy these modules/vendor assets. Do not substitute `ops/deploy_app.sh`/app_page for Pages hosting.
4. Publish the HTML, `aisports/bot-account.js`, `aisports/wallet-connect.js`, vendor bundle and licenses, both version files, and existing root `qr.js` together. At the actual URL, `bot-account.js` and `wallet-connect.js` resolve within `/senya-app/aisports/`; the pinned SDK resolves within its `vendor/` directory. No new domain is needed.
5. After Pages finishes, verify every manifest URL is 200 with the expected SHA256 and MIME type, BUILD and both version files agree, and browser SRI accepts the vendor bundle. Open the official Mini App and confirm it loads the new build without copying its Telegram launch data to another URL. Physical extension/mobile QR and controlled transaction acceptance remain required before claiming those routes verified.

If a deployment later adds CSP, preserve the page's existing Telegram/API/inline-resource allowances and permit the local scripts, MetaMask relay `wss://mm-sdk-relay.api.cx.metamask.io`, data images and SDK inline modal styles. Add `https://polymarket.com` for the browser's region-availability check. Current public Pages has no CSP that must be changed; Telegram/device transport behavior is still a physical acceptance requirement.

## Contract review

UI uses canonical transfer kind `WITHDRAW`, `fee_units` (unknown blocks signature), `runtime_expires_at` (expired suppresses enabled state), `latest_decisions` (private reasons), and operation `match` (human-readable fixture). Execution result `FILLED` is not presented as a win; settled P&L comes from verified CLAIM projections. `position_value_units: null` remains “—”.

Before Enable, the browser checks `https://polymarket.com/api/geoblock` from the user's browser with credentials omitted and no referrer. Blocked, unavailable or malformed responses prevent the enable RPC. This is a client UX check, not server proof of user location. The new execution quote also calls the existing server `readonly_check.run` geoblock check indirectly; the server release must preserve its final pre-sign/send gates. No location bypass or alternative routing is provided.
