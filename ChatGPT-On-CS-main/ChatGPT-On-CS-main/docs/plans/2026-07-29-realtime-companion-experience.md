# Realtime Companion Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the companion react to the selected customer and store quickly enough for day-to-day customer service, while allowing a deliberate automatic-send mode.

**Architecture:** Replace slow independent UI polling with a single real-time companion snapshot broadcast. The collector publishes context transitions immediately, cancels obsolete reply work by context revision, and sends a fast local candidate before the full AI draft. The companion window subscribes to broadcasts and renders a visible pipeline state rather than waiting on repeated REST polling.

**Tech Stack:** Electron, TypeScript, Express/Socket.IO dispatch broadcasts, React Query, Windows PowerShell capture helper, RapidOCR.

---

### Task 1: Make companion context changes observable and measurable

**Files:**
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/qianniuHealth.ts`
- Test: `src/__tests__/services/qianniuCompatService.test.ts`

**Step 1:** Add explicit scan phases (`detecting`, `recognizing`, `generating`, `ready`, `failed`) and publish each phase with the active context revision.

**Step 2:** Add a fast-path refresh request that schedules an immediate scan and records whether a scan is already in progress.

**Step 3:** Test that a newer context revision supersedes an older pending generation state.

### Task 2: Reduce detection latency and eliminate stale generation

**Files:**
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/companionContextTracker.ts`
- Test: `src/__tests__/services/companionContext.test.ts`

**Step 1:** Reduce foreground context detection to a sub-second scheduler while retaining a lower-frequency full OCR path for unchanged windows.

**Step 2:** When the selected conversation fingerprint changes, publish `switching` immediately, invalidate the previous generation token, then perform OCR only for the new target.

**Step 3:** Before saving or broadcasting a draft, verify that its context revision is still current; discard obsolete output.

**Step 4:** Test A → B switching so A's delayed output cannot appear in B's companion panel.

### Task 3: Serve fast reply candidates before full AI generation

**Files:**
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/dispatchService.ts`
- Modify: `src/main/backend/entities/replySuggestion.ts`
- Test: `src/__tests__/services/companionContext.test.ts`

**Step 1:** Persist a pending suggestion as soon as the new inbound message is stable and broadcast it with `draft_state: generating`.

**Step 2:** Use the existing knowledge/keyword reply path for an immediate candidate when available, then replace it only if the matching full AI request completes for the current context.

**Step 3:** Emit timing metadata for detect, OCR, retrieval and generation so slow stages are visible in the UI and diagnostics.

### Task 4: Replace companion polling with real-time updates

**Files:**
- Modify: `src/renderer/companion-window/App.tsx`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/main/backend/backend.ts`
- Test: `src/renderer/companion-window/companionSelection.test.ts`

**Step 1:** Subscribe the companion to context, health and suggestion broadcasts.

**Step 2:** On a foreground/platform transition, immediately invalidate only the affected query keys and request a priority refresh; do not wait for 1–4 second polling intervals.

**Step 3:** Render a compact pipeline status (`识别客户`, `读取对话`, `检索知识`, `生成回复`) with elapsed time and retry action.

### Task 5: Expose true automatic send

**Files:**
- Modify: `src/renderer/companion-window/App.tsx`
- Modify: `src/main/backend/services/replySafetyPolicy.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Test: `src/__tests__/services/replySafetyPolicy.test.ts`

**Step 1:** Remove the UI-only disabled state for `unattended` mode.

**Step 2:** Add an explicit confirmation at mode change time, not per message, and persist the selected mode per platform.

**Step 3:** In automatic mode, send a completed reply directly for the same current context; expose sent/failed feedback in the panel.

### Task 6: Validate the real customer-service loop

**Files:**
- Modify: `scripts/diagnose-collector.js`
- Modify: `docs/releases/V2.5.0.md` or a new development note if release scope changes

**Step 1:** Add a latency report for detection, OCR, draft creation and stale-output suppression.

**Step 2:** Run unit tests, typecheck, renderer build and the local collector diagnostic against a live supported client.

**Step 3:** Manually validate: switch A → B → A, switch shops, toggle automatic mode, and confirm no stale draft or reply is sent to the wrong customer.
