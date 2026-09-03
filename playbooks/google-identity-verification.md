# Google Identity: verify credentials and bound certificate transport

## When to use this

Use when adding Google Identity Services to a room/PIN application. A browser profile is not evidence of identity. Use the official GIS button and verify its credential with Google's library before minting any application identity.

## Proven pitfalls

- `OAuth2Client` permits clock skew. After signature verification, enforce the application's own strict expiry requirement and exact audience/issuer, verified email and stable `sub`. Use a separate signing purpose for short-lived Google identity tokens so they cannot authorize room APIs. The room PIN is still mandatory.
- The SDK's certificate fetch supplies `retry:true` **and** `retryConfig` at the call site. Setting `transporterOptions.retry:false`, or overriding only `retry:false`, does not disable those retries. Override final request options with `retryConfig.retry:0` and `shouldRetry:()=>false`; apply an AbortSignal deadline to abort the underlying HTTP fetch. A Promise.race alone only stops the caller waiting.
- Certificate tests should replace certificate retrieval with local public keys and still execute the actual RSA verifier. A mocked verifier returning a hardcoded profile proves no signature checks. A separate local HTTP certificate endpoint proves no retry on 503 and actual abort on a stalled response.
- GIS popup close does not guarantee a callback. Keep the room form usable and explain retry/cancel; do not invent success. Route callback state to the active rendered button and invalidate it on cancel/unmount. Ignore a verification response arriving after cancel or session change.
- Clear pending identity on external session invalidation as well as the explicit logout button. Otherwise the old account can reappear on the auth screen after a 401 or cross-tab logout.

## Smoke tests

```sh
node --test --test-timeout=15000 tests/google_auth.test.js tests/app_initial_sync.test.js
npm run build
```

The tests prove local verification and UI state handling, not Google consent/origin configuration. Live acceptance still requires two real Google accounts on the authorized deployed origin.

References: [Google server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

*Provenance: ShareFridge C-022, 2026-09-03. The first actual certificate transport regression observed 3 requests instead of 2; overriding final retryConfig corrected it. See evidence/C-022/.*
