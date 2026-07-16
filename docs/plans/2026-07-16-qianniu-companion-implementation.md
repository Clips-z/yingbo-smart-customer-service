# Qianniu Companion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a detachable Qianniu companion window that follows the stable store/customer/product context, restores per-conversation drafts, and prevents cross-context delivery.

**Architecture:** Add a typed context snapshot and persistent conversation-draft layer before creating the second renderer window. The Qianniu collector publishes stable context changes; the companion renderer selects the matching draft. All fill/send operations pass through a context guard that rechecks the live target.

**Tech Stack:** Electron 26, React 18, TypeScript, Express, Sequelize/SQLite, Chakra UI, Jest.

---

### Task 1: Add context and draft policy types

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/companionContext.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/companionContext.test.ts`

Steps:

1. Write table-driven tests for stable identity keys, message revisions, restoration, stale-message handling and product changes.
2. Run the focused test and confirm it fails because the module is absent.
3. Implement pure functions for `buildConversationKey`, `buildDraftKey`, `compareContext` and `decideDraftRestoration`.
4. Run the focused test and confirm all context cases pass.

### Task 2: Persist conversation-bound drafts

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replySuggestion.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/platform/platform.d.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/platform/controller.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/conversationDraft.test.ts`

Steps:

1. Add failing tests for storing edited text without overwriting the AI original, reloading after a customer switch, and rejecting draft updates with a mismatched revision.
2. Add nullable context fields and migration guards: store/account/contact/chat/product/message fingerprints, context revision, original AI reply, edited draft, draft state and draft update time.
3. Add GET/PATCH endpoints for one conversation draft and validate body size, revision and status transitions.
4. Update renderer types and API client.
5. Run entity/API tests and the main build.

### Task 3: Publish stable Qianniu context

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/scripts/qianniu-compat-capture.ps1`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuContextTracker.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/qianniuContextTracker.test.ts`

Steps:

1. Test switching, stable confirmation, rapid A→B→A changes, low confidence and late capture results.
2. Extend capture output with available store/account/chat/product evidence while keeping every field optional during staged rollout.
3. Require repeated compatible samples before publishing a stable context.
4. Broadcast switching/stable/degraded context events and expose a read-only current-context endpoint.
5. Run focused tests and collector diagnostics.

### Task 4: Create the companion Electron window

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/windows/companion-main/index.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/services/windowDockingService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/main.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/preload.ts`
- Modify renderer webpack entries to add `companion.html`.
- Create companion window lifecycle and docking tests.

Steps:

1. Test bounds calculation for right, left and detached modes across multiple monitors.
2. Create a narrow BrowserWindow that does not steal input focus when following Qianniu.
3. Add validated IPC for attach side, detach, collapse, hide and saved bounds.
4. Follow Qianniu move/minimize/restore events with polling fallback and stop timers on close.
5. Run main build and manual window smoke test.

### Task 5: Build the companion renderer

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/companion-window/index.tsx`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/companion-window/App.tsx`
- Create components for identity, product, incoming message, draft editor, knowledge evidence and mode bar.
- Create React tests for switching and restoration.

Steps:

1. Render switching, stable, degraded, disconnected, empty and error states.
2. Select drafts by conversation/draft key instead of one global editor state.
3. Debounce edited draft persistence and flush immediately before context switch/window close.
4. Restore edited text when returning to an unchanged conversation.
5. Show old drafts as history when a new buyer message or product revision exists.
6. Run renderer tests, build and screenshot verification.

### Task 6: Guard assist fill against live context

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/deliveryContextGuard.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/scripts/qianniu-compat-send.ps1`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/deliveryContextGuard.test.ts`

Steps:

1. Test exact match, customer mismatch, store mismatch, new incoming message, product change, stale revision and already-sent draft.
2. Re-capture target context immediately before selecting the contact.
3. Re-capture after selection and before fill.
4. Block on every mismatch and return a structured Chinese recovery message.
5. Confirm assist mode always returns `submitted=false`.

### Task 7: Verify the first release boundary

Steps:

1. Run all focused companion, context, draft and Qianniu safety tests.
2. Run `npm.cmd test -- --runInBand`.
3. Run `npm.cmd run build`.
4. Run rapid A→B→A manual switching with edited drafts and late AI responses.
5. Restart the application and confirm unsent drafts restore.
6. Confirm no automated test submits a real message.
7. Run `git diff --check` and review that runtime data and secrets are absent.

