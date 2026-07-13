# Reply Safety and Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make assist mode the safe default, prevent duplicate delivery, and expose recoverable platform failures without sending real customer messages during verification.

**Architecture:** Keep platform automation in the existing sidecar services and enforce one backend policy before every mode change or delivery. Reuse reply suggestions as the durable audit boundary, with stable incoming-message fingerprints and explicit delivery outcomes.

**Tech Stack:** Electron, TypeScript, Express, Sequelize/SQLite, Jest, Python sidecars, PowerShell automation.

---

### Task 1: Establish the safety-policy baseline

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/replySafetyPolicy.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/config.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/replySafetyPolicy.test.ts`

1. Add failing tests for missing, unknown, and legacy modes normalizing to `assist` on WeChat and Qianniu.
2. Run `npm.cmd test -- replySafetyPolicy --runInBand` and confirm the new cases fail.
3. Implement `normalizeReplyMode` and require an explicit per-platform unlock for `unattended`.
4. Verify new schema columns default to false and migrations preserve existing rows.
5. Run the focused test until it passes.

### Task 2: Enforce the policy at every backend entry point

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/baseSidecarService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/replySafetyPolicy.test.ts`

1. Trace every mode-change, fill, and automatic-send entry point.
2. Add tests proving renderer/API input cannot bypass the policy.
3. Apply normalized mode during startup and persist corrections from unsafe legacy values.
4. Return structured denial codes and readable Chinese messages.
5. Run focused tests and `npm.cmd run build:main`.

### Task 3: Make incoming-message deduplication durable

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/incomingMessageFingerprint.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replySuggestion.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/incomingMessageFingerprint.test.ts`

1. Add failing tests for whitespace normalization, repeated OCR events, and same text from different buyers/chats.
2. Add or verify a unique indexed incoming fingerprint on persisted suggestions.
3. Reserve/create suggestions atomically and treat uniqueness conflicts as duplicates.
4. Ensure restart recovery reads persisted state instead of relying only on memory.
5. Run the focused tests.

### Task 4: Guard fill and delivery transitions

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replySuggestion.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/baseSidecarService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/deliveryGuard.test.ts`

1. Write failing tests for double click, duplicate event, timeout, mismatched request ID, restart recovery, and retry after a recorded failure.
2. Implement atomic reservation and explicit `prepared`, `sent`, `failed`, `cancelled`, and timeout transitions using the smallest schema change possible.
3. Reject in-flight and completed duplicate keys with a structured result.
4. Require matching request IDs before marking completion.
5. Run focused tests.

### Task 5: Normalize platform health and emergency stop

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/platformRuntimeService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/baseSidecarService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/platformHealth.test.ts`

1. Add failing tests for client not running, not logged in, missing window, unavailable/low-confidence OCR, timeout, and failed delivery.
2. Expose a stable reason code, next retry time, and recovery action.
3. Block fill/send while unhealthy and retain the suggestion.
4. Implement emergency stop as an atomic return to assist plus cancellation of queued unattended work.
5. Run focused tests.

### Task 6: Full verification

**Files:**
- Modify only files required to fix failures caused by Tasks 1-5.

1. Run `npm.cmd test -- --runInBand` and record the exact result.
2. Run `npm.cmd run build:main` and fix introduced failures.
3. Run `npm.cmd run build:renderer` and fix introduced failures.
4. Review `git diff --check` and the final diff for accidental generated files, secrets, or unrelated edits.
5. Confirm no command or test sent a real customer message and unattended mode remains off by default.
