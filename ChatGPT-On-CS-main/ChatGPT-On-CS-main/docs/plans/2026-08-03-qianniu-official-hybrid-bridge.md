# Qianniu Official Hybrid Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Remove continuous OCR from the realtime loop, use official Qianniu PCWW capabilities for conversation identity and draft insertion, and retain visual recognition only for changed message regions.

**Architecture:** The existing capture worker becomes a cheap screenshot/fingerprint stream. A warm persistent RapidOCR worker runs only when the chat fingerprint changes. An optional localhost Qianniu bridge receives official `imGetActiveUser`/`onImActiveContactChanged` observations and queues verified `imInsertText2Inputbox` commands; when the official bridge is unavailable, the existing coordinate action remains an explicit fallback.

**Tech Stack:** Electron, TypeScript, Express, Jest, PowerShell, Python/RapidOCR, Qianniu PCWW H5 JSSDK.

---

### Task 1: Remove OCR from the continuous capture loop

**Files:**
- Modify: `src/main/backend/services/qianniuCaptureWorker.ts`
- Modify: `src/main/backend/services/qianniuOcrWorker.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Test: `src/__tests__/services/qianniuCaptureWorker.test.ts`

1. Add a failing test that the resident capture arguments contain `-SkipOcr` and never contain `-WindowsOcrOnly`.
2. Export a pure argument builder and use it in `QianniuCaptureWorker`.
3. Add an explicit OCR worker warm-up entry point and mark it ready when Python emits its `ready` event.
4. Preserve an OCR input image outside the rotating capture-file pattern until recognition finishes.
5. Run the targeted Jest test, `pnpm.cmd typecheck`, and `git diff --check`.

### Task 2: Add the official bridge state machine

**Files:**
- Create: `src/main/backend/services/qianniuOfficialBridge.ts`
- Test: `src/__tests__/services/qianniuOfficialBridge.test.ts`

1. Write failing tests for heartbeat freshness, active-contact observations, command reservation, contact mismatch rejection, completion, and timeout.
2. Implement a single-client localhost bridge state machine using `securityUID + bizDomain` as the stable contact identity.
3. Keep commands idempotent and never expose an automatic-send command in this phase.
4. Run the targeted Jest test and typecheck.

### Task 3: Expose the PCWW bridge and prefer it for identity/fill

**Files:**
- Modify: `src/main/backend/backend.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Create: `src/main/backend/services/qianniuOfficialBridgePage.ts`
- Test: `src/__tests__/services/qianniuOfficialBridgePage.test.ts`
- Test: `src/__tests__/services/qianniuOfficialBridge.test.ts`

1. Serve a localhost-only bridge page that loads the official Qianniu JSSDK.
2. Register current-contact and contact-change observations and poll for pending fill commands.
3. Validate the observed `securityUID` before dispatching `imInsertText2Inputbox`.
4. Prefer official bridge identity/fill in `QianniuCompatService`; retain OCR/coordinate fallback with visible health reason.
5. Run targeted tests, full typecheck, and `git diff --check`.

### Task 4: Real-client gate

1. Configure the bridge callback in a Qianniu PCWW test application or preview account.
2. Verify 100 customer switches and 100 click-to-fill actions with zero wrong-contact actions.
3. Record P50/P95 switch, OCR-on-change, generation, and fill latency in the master plan.
4. Do not enable automatic sending until the real-client gate passes.

### Stop conditions

- If Qianniu requires an AppKey/test-account permission that is not available, finish the local bridge and stop at the external credential gate.
- Do not reuse DuoMai binaries, protocols, credentials, or packaged plugins.
- Do not modify or inject `AliWorkbench.exe` or `AliRender.exe`.

## 2026-08-03 implementation checkpoint

- Task 1: DONE and performance-corrected after live measurement. The resident loop uses `-WindowsOcrOnly -Watch -IntervalMs 150`; the PowerShell process skips OCR for unchanged fingerprints and reuses the last recognition. A changed frame runs one warm Windows OCR pass. RapidOCR remains a slow fallback only.
- Task 2: DONE. The bridge tracks heartbeat/contact state and exposes only contact-verified fill commands.
- Task 3: DONE in source. The page uses `getActiveUser`, `wangwang.active_contact_changed`, and `insertText2Inputbox`; its emitted JavaScript is syntax-tested. Packaged builds prefer `YINGBO_BACKEND_PORT`, defaulting to port `9999`, so the test application page can use:

  `http://127.0.0.1:9999/api/v1/compat/qianniu/official-bridge`

- Performance evidence: unchanged-frame samples were approximately 259–295ms with `ocrEngine=none`; warm Windows OCR passes were approximately 394–514ms. RapidOCR measured about 5.2s cold and 2.9s warm, so it was removed from the normal critical path.
- Recognition correctness: the latest incoming bubble is eligible even without a question mark; explicit acknowledgement-only messages are suppressed so an older question is not regenerated.
- Official bridge follow-up: contact events immediately publish the new buyer in `switching` state and clear the previous buyer's messages/product; both modern `my.qn.*` and legacy `QN.application` are supported. Runtime heartbeats are accepted only after a real QianNiu API is detected. Previously observed official identities can be opened with `openChat`, and fill commands are bound to `securityUID + bizDomain`.
- UIA evidence: the open `AliWorkbench 9.98.28N` reception window exposed no accessibility tree, so UIA cannot replace message OCR in this client build.
- Verification: 61 test suites / 226 tests passed; typecheck, production build, and `git diff --check` passed before the final diagnostic-label change. The final diagnostic-label change passed its targeted tests, typecheck, build, and diff check.
- Task 4: BLOCKED by the planned external credential gate. No Qianniu PCWW AppKey/test application configuration exists in this workspace. The official bridge cannot report connected until the page above is configured and opened by a Qianniu test application.
