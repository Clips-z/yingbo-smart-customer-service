# Qianniu Assist Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete a testable Qianniu receive-to-safe-fill loop while keeping automatic submission disabled.

**Architecture:** Preserve the current capture and PowerShell adapters, extract deterministic capture validation into a pure TypeScript boundary, expose Qianniu-specific health, and require structured fill results plus post-selection contact verification.

**Tech Stack:** Electron, TypeScript, Express, Sequelize/SQLite, Jest, PowerShell, RapidOCR.

---

### Task 1: Extract capture validation

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCapturePolicy.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/qianniuCapturePolicy.test.ts`

1. Write failing table-driven tests for accepted buyer messages and every rejection reason.
2. Implement a pure policy returning `{ accepted, message }` or `{ accepted, reasonCode }`.
3. Replace duplicated `scan()` guards with the policy while preserving confirmation capture for borderline OCR.
4. Run the focused test and main build.

### Task 2: Add Qianniu-specific health

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ReplyWorkbench/useReplyWorkbench.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/qianniuHealth.test.ts`

1. Add a deterministic health state model and focused tests.
2. Update scan start/success/failure/client-stop transitions.
3. Expose `GET /api/v1/compat/qianniu/health`.
4. Select Qianniu health in the renderer when Qianniu is active.
5. Run focused tests and renderer build.

### Task 3: Validate the structured fill result

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/scripts/qianniu-compat-send.ps1`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/qianniuCompatService.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/qianniuFillResult.test.ts`

1. Define and test result parsing for selection, fill, submit, and error codes.
2. Parse PowerShell stdout instead of treating exit code zero as sufficient.
3. Require `selected=true` for selection and `filled=true, submitted=false` for assist fill.
4. Preserve the existing post-selection OCR title verification.
5. Run focused tests and main build.

### Task 4: Improve workbench recovery UX

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ReplyWorkbench/useReplyWorkbench.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/App.test.tsx`

1. Show Qianniu reason code recovery text and retry time.
2. Disable duplicate fill while the delivery status is preparing.
3. Keep edited content visible after failure and offer retry.
4. Add an emergency-stop action without exposing unattended enablement.
5. Run UI tests and renderer build.

### Task 5: Verify the complete offline loop

1. Run all focused Qianniu and safety tests.
2. Run `npm.cmd test -- --runInBand`.
3. Run main and renderer production builds.
4. Run `git diff --check` and verify no generated runtime or secrets were added.
5. Confirm no test invoked PowerShell with `-Submit` and no real customer message was sent.
