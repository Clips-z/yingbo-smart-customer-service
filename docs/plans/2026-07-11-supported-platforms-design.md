# WeChat and Qianniu Supported Platforms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver WeChat and Qianniu as the first two explicitly supported platforms, with safe reply defaults, observable failures, repeat-send protection, and repeatable release validation.

**Architecture:** Keep message collection and desktop automation in the existing sidecar/compat services, but introduce one common reply-safety policy at the service boundary. The policy makes `assist` the default, rejects autonomous sends unless the user has explicitly unlocked the capability for that platform, and records every delivery attempt with an idempotency key. Platform-specific adapters only report health, capture/OCR status, and delivery results.

**Tech Stack:** Electron, TypeScript, Sequelize/SQLite, Python sidecars, PowerShell desktop automation, Jest, electron-builder, GitHub Actions.

---

## Product boundary and acceptance standard

Only `win_wechat` and `win_qianniu` are labelled **supported** in the product and release notes. Every other adapter remains experimental and must not be selectable for unattended delivery.

| Mode | Expected behavior | Default | Send authority |
| --- | --- | --- | --- |
| Hint | Queue a suggestion only. | No | Never |
| Assist | Queue a suggestion; the user can inspect, edit, then request a fill action. | Yes | Never |
| Unattended | Automatically send only a policy-approved reply. | No | Requires a per-platform unlock, confirmation, healthy client, and a fresh idempotency key. |

No release can claim a platform is supported until each row in the manual acceptance matrix passes on a logged-in Windows client.

### Task 1: Central reply-safety policy

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/replySafetyPolicy.ts`
- Modify: `src/main/backend/entities/config.ts`
- Modify: `src/main/backend/services/baseSidecarService.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Test: `src/__tests__/services/replySafetyPolicy.test.ts`

1. Write tests for mode normalization, defaulting missing/legacy modes to `assist`, and rejecting unattended mode when the explicit unlock is false.
2. Add a configuration migration for `wechat_unattended_enabled` and `qianniu_unattended_enabled`, both defaulting to false. Preserve existing user configuration; do not silently enable autonomous sending during an upgrade.
3. Implement a policy API that accepts platform, requested mode, unlock state, collector health, and reply safety metadata. It must return a structured denial reason rather than only throwing generic errors.
4. Route both existing services through that API before mode changes, fill operations, and automatic sends.
5. Run `npm test -- replySafetyPolicy --runInBand` and then the whole test suite.

### Task 2: Durable delivery and duplicate protection

**Files:**
- Modify: `src/main/backend/entities/replySuggestion.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/baseSidecarService.ts`
- Modify: `src/main/backend/backend.ts`
- Test: `src/__tests__/services/deliveryGuard.test.ts`

1. Add a migration for a bounded idempotency/delivery record containing platform, message fingerprint, recipient, reply fingerprint, status, and timestamps.
2. Before a fill or send command, reserve a delivery key atomically. Reject duplicate or in-flight keys with a clear user-visible result.
3. Persist success, failure, timeout, and cancellation outcomes. A failed delivery remains retryable only after the platform state is healthy again.
4. Require the sidecar/PowerShell completion result to match the request ID before marking a delivery complete.
5. Add tests for repeated incoming events, process restart recovery, timeout, and a second click on the same suggestion.

### Task 3: Platform health and recoverable errors

**Files:**
- Modify: `src/main/backend/services/baseSidecarService.ts`
- Modify: `src/main/backend/services/qianniuCompatService.ts`
- Modify: `src/main/backend/services/platformRuntimeService.ts`
- Modify: `src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Test: `src/__tests__/services/platformHealth.test.ts`

1. Define normalized health reasons: `client_not_running`, `not_logged_in`, `window_not_found`, `ocr_unavailable`, `ocr_low_confidence`, `send_timeout`, and `send_failed`.
2. Preserve the existing retry/backoff behavior, but expose its next retry time and the recommended recovery action in the health response.
3. Prevent fill/send whenever the platform is not healthy; the UI must keep the suggestion and display a retry action rather than losing it.
4. For Qianniu, treat low OCR confidence as an assist-only event and never promote it to unattended sending.
5. Add focused tests for every normalized error, including the retry and no-send behavior.

### Task 4: Make the safety boundary understandable in the UI

**Files:**
- Modify: `src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Modify: `src/renderer/settings-window/components/Settings/GeneralSettings.tsx`
- Modify: `src/main/backend/backend.ts`
- Test: `src/__tests__/App.test.tsx` or a new ReplyWorkbench test

1. Show only WeChat and Qianniu as supported production platforms.
2. Default a newly configured platform to Assist mode.
3. Add a per-platform “allow unattended sending” setting that is off by default and requires a typed confirmation plus a visible risk explanation before the backend accepts it.
4. Keep a one-click emergency stop that immediately returns the mode to Assist and cancels queued unattended delivery reservations.
5. Verify no renderer-only state can bypass the backend policy endpoint.

### Task 5: Repeatable end-to-end acceptance

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/docs/acceptance/wechat.md`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/docs/acceptance/qianniu.md`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/scripts/acceptance/preflight.ps1`
- Modify: `scripts/smoke-auto-reply.js`

1. Add a preflight script that checks Windows version, installed client process, login/window state, Python sidecar, OCR worker, writable user-data directory, and backend health endpoints without sending a message.
2. Add manual acceptance cases for: receive, generate, edit, fill, user send; client closed; logged out; missing window; low OCR confidence; failed send; duplicate event; emergency stop; restart recovery.
3. Capture only redacted diagnostic output. Never include customer messages, tokens, or screenshots containing customer data in test artifacts.
4. Record the result with client version, app version, date, operator, and pass/fail status before declaring either platform supported.

### Task 6: Upgrade, packaging, and clean-machine verification

**Files:**
- Modify: `electron-builder.yml`
- Modify: `src/main/backend/entities/config.ts`
- Create: `scripts/backup-user-data.ps1`
- Create: `scripts/check-installation.ps1`
- Create: `docs/release-checklist.md`

1. Before schema migration, create a timestamped backup of the SQLite user-data database and report its location.
2. Package the required sidecar runtime and verify it before building; fail packaging if a required supported-platform asset is missing.
3. Add an installation verification script that checks install location, first launch, user-data migration, required native modules, and uninstall behavior without deleting user data by default.
4. Test upgrade from the current release data directory and a clean installation on a separate Windows user profile or VM.
5. Promote a release only after build, unit tests, WeChat acceptance, Qianniu acceptance, upgrade verification, and clean-machine verification all pass.

## Required real-client evidence

These checks cannot be truthfully automated in this workspace because they require the user’s logged-in WeChat and Qianniu desktop clients. Each needs a dedicated test account, a non-production conversation, and the operator’s confirmation before any unattended-send test. Until that evidence exists, the application must keep unattended delivery disabled.
