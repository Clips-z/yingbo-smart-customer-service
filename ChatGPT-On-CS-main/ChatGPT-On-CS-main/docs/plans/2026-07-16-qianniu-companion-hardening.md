# Qianniu Companion Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Qianniu companion preserve trustworthy conversation history, expose collector progress and recovery, and avoid unnecessary OCR restarts without enabling real message sending.

**Architecture:** Add one pure recent-message sanitizer at the backend boundary, merge only same-conversation fallback history in the context tracker, and expose explicit collector phase/refresh APIs to the companion UI. Keep OCR as a persistent local worker and preserve the existing fingerprint short circuit.

**Tech Stack:** Electron, TypeScript, React, Chakra UI, React Query, Jest, Python/RapidOCR, PowerShell window capture.

---

### Task 1: Centralize recent-message sanitization

**Files:**
- Create: `src/main/backend/services/qianniuRecentMessages.ts`
- Create: `src/__tests__/services/qianniuRecentMessages.test.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`

**Steps:**
1. Write failing tests for system text, timestamps, prices, shipping cards, adjacent duplicates, blank input, and the latest-three limit.
2. Run `npm.cmd test -- --runInBand qianniuRecentMessages` and confirm failure.
3. Implement `sanitizeQianniuRecentMessages()` as a pure function.
4. Use its result for both companion context and model message history.
5. Run the focused test and confirm pass.

### Task 2: Preserve history only for the same customer

**Files:**
- Modify: `src/main/backend/services/qianniuContextTracker.ts`
- Modify: `src/__tests__/services/qianniuContextTracker.test.ts`

**Steps:**
1. Add failing tests showing an empty transient OCR result keeps the last non-empty history for the same platform/store/account/contact.
2. Add a failing test proving buyer B never receives buyer A history.
3. Implement same-identity fallback merging before observation identity is calculated.
4. Mark whether history was reused so the UI can label it.
5. Run tracker tests and confirm pass.

### Task 3: Expose collector phase and manual refresh

**Files:**
- Modify: `src/main/backend/services/qianniuHealth.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/backend.ts`
- Modify: `src/renderer/common/services/platform/platform.d.ts`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/__tests__/services/qianniuHealth.test.ts`

**Steps:**
1. Add failing health tests for warming, scanning, ready, duration, degraded, and stopped states.
2. Implement phase tracking without changing reply-mode safety.
3. Add `requestRefresh()` that clears only scan cache/backoff state.
4. Add `POST /api/v1/compat/qianniu/refresh` and the renderer controller call.
5. Run health and backend type/build checks.

### Task 4: Improve companion status and stale-state safety

**Files:**
- Modify: `src/renderer/companion-window/App.tsx`

**Steps:**
1. Query collector health every two seconds.
2. Display warming/scanning/ready/degraded/stopped with concise Chinese guidance and last-success age.
3. Add a refresh icon wired to the refresh endpoint.
4. Label reused history and disable fill unless context is stable, health is ready/running, mode is assist, and suggestion text is present.
5. Run renderer production build and visually inspect the 372px window.

### Task 5: Degrade stale context safely

**Files:**
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/__tests__/services/qianniuContextTracker.test.ts`

**Steps:**
1. Add tests for degraded context retaining readable draft/history while producing no delivery keys.
2. Mark context degraded when Qianniu stops or scanning fails.
3. Broadcast the changed context state so both main and companion windows update immediately.
4. Verify no auto-click or send path is introduced.

### Task 6: Full verification and commit

**Files:**
- Modify: `docs/DEVELOPMENT_HANDOFF.md`

**Steps:**
1. Run `npm.cmd test -- --runInBand` and expect all suites to pass.
2. Run `npm.cmd run build:main` and `npm.cmd run build:renderer`.
3. Run Python `-m py_compile scripts/qianniu_rapidocr.py scripts/qianniu-rapidocr-worker.py`.
4. Run `git diff --check` and inspect the final diff.
5. Build the unpacked test runtime and perform read-only live Qianniu verification.
6. Commit to `feature/qianniu-companion`; do not push unless explicitly requested.
