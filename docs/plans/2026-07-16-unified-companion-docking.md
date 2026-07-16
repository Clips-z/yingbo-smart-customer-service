# Unified Companion Docking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the single companion panel so it safely follows Qianniu, WeChat, and WeCom while preserving per-conversation history and drafts.

**Architecture:** Replace the Qianniu-only window locator with a foreground-aware platform target locator and add a platform adapter layer around companion context, health, suggestions, modes, and fill actions. Reuse the existing WeChat and WeCom OCR sidecars, but report their current stable conversation snapshots to a shared backend context tracker.

**Tech Stack:** Electron, TypeScript, React, Chakra UI, Express, Sequelize, PowerShell Win32 probes, Python OCR sidecars, Jest.

---

### Task 1: Generalize target-window detection

**Files:**
- Create: `scripts/companion-target-window.ps1`
- Modify: `src/main/services/windowDockingService.ts`
- Modify: `src/__tests__/services/windowDockingService.test.ts`

**Steps:**
1. Add failing tests for platform-tagged targets, foreground preference, target stability, locked-platform fallback, minimized targets, and per-display bounds.
2. Run `npm.cmd test -- --runInBand windowDockingService` and confirm the new tests fail.
3. Implement `CompanionPlatformId`, `CompanionTargetWindow`, and a PowerShell Win32 probe returning `platformId`, `hwnd`, bounds, foreground state, and minimized state.
4. Keep the previous trusted platform while the foreground is the companion or main app; debounce new targets before committing them.
5. Run the focused test and commit with `feat: generalize companion window targeting`.

### Task 2: Add platform locks and per-platform dock preferences

**Files:**
- Modify: `src/main/services/windowDockingService.ts`
- Modify: `src/main/windows/companion-main/index.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/__tests__/services/windowDockingService.test.ts`

**Steps:**
1. Add failing tests for `follow`, `win_qianniu`, `win_wechat`, and `win_wecom` target modes, plus per-platform left/right state.
2. Extend `CompanionDockState` with `targetMode`, `activePlatformId`, and `sideByPlatform`.
3. Migrate the saved `qianniu-companion-state` value into `unified-companion-state` on first load.
4. Add IPC commands for target mode and platform-specific side changes.
5. Verify focused tests and commit with `feat: persist unified companion docking preferences`.

### Task 3: Normalize companion conversation contexts

**Files:**
- Create: `src/main/backend/services/companionContextTracker.ts`
- Create: `src/__tests__/services/companionContextTracker.test.ts`
- Modify: `src/main/backend/services/companionContext.ts`
- Modify: `src/renderer/common/services/platform/platform.d.ts`

**Steps:**
1. Add failing tests for stable switching, `A → B → A` restoration, cross-platform isolation, stale observations, and late-response rejection.
2. Define a platform-neutral `CompanionContext` and `CompanionObservation` with platform, account, contact, messages, confidence, revision, and state.
3. Implement deterministic keys as `platformId/accountId/contactId` and bounded per-conversation snapshots.
4. Reuse the existing draft key semantics and preserve Qianniu compatibility fields.
5. Run focused tests and commit with `feat: track unified companion conversations`.

### Task 4: Report active WeChat and WeCom context

**Files:**
- Modify: `scripts/wechat-sidecar.py`
- Modify: `scripts/wecom-sidecar.py`
- Modify: `src/main/backend/services/baseSidecarService.ts`
- Modify: `src/main/backend/backend.ts`
- Create: `src/__tests__/services/sidecarCompanionContext.test.ts`

**Steps:**
1. Add backend tests for accepting platform-scoped context observations and rejecting invalid or mismatched platform payloads.
2. Add `/api/v1/compat/wechat/context` and `/api/v1/compat/wecom/context` GET/POST routes.
3. Report the current stable conversation title and last three cleaned chat messages after each sidecar scan; do not trigger a model call solely because the foreground changed.
4. Expose context health and stale timestamps through `BaseSidecarService`.
5. Run Jest tests and `python -m py_compile scripts/wechat-sidecar.py scripts/wecom-sidecar.py`.
6. Commit with `feat: report active chat context from sidecars`.

### Task 5: Add the renderer platform adapter

**Files:**
- Create: `src/renderer/companion-window/platformAdapter.ts`
- Modify: `src/renderer/common/services/platform/controller.ts`
- Modify: `src/renderer/companion-window/companionSelection.ts`
- Modify: `src/__tests__/services/companionSelection.test.ts`

**Steps:**
1. Add failing tests for context/suggestion selection by active platform and for disabling fill on switching, stale, reused, or mismatched contexts.
2. Implement adapters for context, health, suggestions, reply mode, draft save, refresh, and fill.
3. Route Qianniu to existing endpoints and WeChat/WeCom to their existing fill/mode/health endpoints plus new context endpoints.
4. Add a pre-fill session-revision assertion.
5. Run focused tests and commit with `feat: adapt companion data per platform`.

### Task 6: Make the companion UI platform-aware

**Files:**
- Modify: `src/renderer/companion-window/App.tsx`
- Modify: `src/renderer/companion-window/companionSelection.ts`
- Modify: `src/__tests__/App.test.tsx`

**Steps:**
1. Add component assertions for platform labels, target lock menu, dynamic attach text, hidden product card outside Qianniu, and disabled fill during unsafe states.
2. Replace Qianniu-only query keys with platform-scoped keys and cancel obsolete requests on target revision changes.
3. Add platform colors and identity labels, adaptive product/history layout, target mode selector, and per-platform side control.
4. Preserve the three reply modes without enabling unattended mode.
5. Run renderer tests and commit with `feat: add multi-platform companion interface`.

### Task 7: Harden runtime and version checks

**Files:**
- Modify: `scripts/check-python-runtime.js`
- Modify: `scripts/check-package-artifacts.js`
- Modify: `src/__tests__/services/runtimePaths.test.ts`
- Verify: `src/renderer/main-window/components/layout/AppSidebar.tsx`

**Steps:**
1. Add failing checks for the target-window script, WeChat/WeCom sidecars, and all bundled runtime directories.
2. Implement the package checks without hardcoding an independent UI version.
3. Verify the sidebar receives `2.0.0` from Electron `app.getVersion()` in a packaged build.
4. Run focused tests and commit with `fix: validate unified companion runtime assets`.

### Task 8: Full verification and live acceptance

**Files:**
- Update: `docs/plans/2026-07-16-unified-companion-docking-design.md` only if implementation constraints changed.

**Steps:**
1. Run `npm.cmd test -- --runInBand` and require all suites to pass.
2. Run `npm.cmd run build:main` and `npm.cmd run build:renderer`.
3. Run Python compilation for the two sidecars and Qianniu OCR scripts.
4. Launch an unpacked local build and test follow/lock, left/right dock, minimize/restore, and three-platform switching.
5. Perform read-only `A → B → A` tests on each available platform; never send a real message.
6. Confirm the working tree contains only intentional source and documentation changes.
