# Playbook: Parse HTTP bodies once across Node and serverless adapters

## When to use this

Use this when the same handler runs behind Node HTTP and a serverless adapter that supplies `req.body`.

A stream-only JSON parser waits indefinitely if the adapter already consumed the body. Happy-path Node HTTP tests do not exercise this case. Catching JSON errors and returning `{}` also turns invalid input into unintended default mutations.

## Fixes

Read `req.body` when present and validate it through the same JSON-object and size checks used for raw streams. Otherwise consume the stream once and cache the parse promise. Return a safe 400 for malformed/non-object JSON and 413 for oversized input. Never return raw exception details through the outer serverless handler.

When a loopback test cannot listen, reject its setup promise on the server's `error` event. Otherwise a sandbox `listen EPERM` presents as a long, unhelpful timeout.

## Smoke test

```sh
node --test --test-name-pattern='malformed JSON|failures never expose' tests/room_authorization.test.js
```

The regression invokes the real `api/index.js` with object, string and Buffer bodies and an `on()` function that throws if the handler tries to consume the already-read stream. It also verifies generic error responses. These adapter cases were proven locally; live platform verification remains a separate gate.

*Provenance: ShareFridge/C-018, 2026-09 — audit found the missing parsed-body path; initial sandbox run exposed a listener setup timeout.*
