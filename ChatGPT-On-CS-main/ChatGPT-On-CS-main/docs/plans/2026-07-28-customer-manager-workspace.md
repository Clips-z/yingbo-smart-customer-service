# Customer Manager Workspace Implementation Plan

> **For Codex:** Implement task-by-task and verify the visible desktop result after each surface is complete.

**Goal:** Turn the product into a two-surface desktop workspace: the companion handles the current customer beside the platform window, while the main window manages stores, exceptions, knowledge, and reply quality.

**Architecture:** Keep all existing Electron IPC, collection, reply, knowledge, and persistence services. Reorganize only renderer navigation and presentation, exposing the existing per-platform left/right docking state as a primary control. The main window uses existing real queries and actions; no decorative or invented data is introduced.

**Tech Stack:** Electron 26, React 18, TypeScript, Chakra UI, React Query, Jest.

---

### Task 1: Companion as the primary execution surface

**Files:**
- Modify: `src/renderer/companion-window/App.tsx`
- Verify: `src/__tests__/services/windowDockingService.test.ts`

**Steps:**
1. Put left dock, right dock, and floating controls directly in the title area.
2. Keep automatic platform following available without expanding an advanced panel.
3. Make current customer, latest question, draft, and fill action the dominant vertical path.
4. Keep product, history, and diagnostic information secondary and collapsible.
5. Verify that the selected side continues to persist independently per platform.

### Task 2: Main navigation for management work

**Files:**
- Modify: `src/renderer/main-window/components/layout/AppSidebar.tsx`
- Modify: `src/renderer/main-window/components/layout/MainLayout.tsx`
- Modify: `src/renderer/main-window/components/layout/PageHeader.tsx`

**Steps:**
1. Replace feature-oriented navigation with customer-manager tasks.
2. Add a dedicated platform-and-store page instead of burying it below the dashboard.
3. Keep reply review and knowledge management as first-class destinations.
4. Demote reply rules, detailed analytics, and settings to management utilities.
5. Add a labeled companion action and a persistent service status in the header.

### Task 3: Operations-first dashboard

**Files:**
- Modify: `src/renderer/main-window/components/DashboardQualityOverview/index.tsx`
- Modify: `src/renderer/main-window/components/layout/MainLayout.tsx`

**Steps:**
1. Replace the large onboarding checklist with a compact conditional setup notice.
2. Show real actionable counts first: pending, overdue, failed, platform exceptions, and knowledge candidates.
3. Present reply adoption, edit rate, retrieval health, and seven-day trend as a secondary quality block.
4. Provide useful zero states with a single next action instead of blank cards.
5. Keep all existing navigation targets and notifications working.

### Task 4: Visual system and responsive behavior

**Files:**
- Modify: `src/renderer/common/styles/theme.ts`
- Modify: the components above

**Steps:**
1. Use a compact professional operations aesthetic with ink navigation, warm canvas, cobalt action, amber exception, and restrained borders.
2. Reduce card nesting and use continuous work surfaces with dividers.
3. Preserve keyboard focus, readable contrast, loading states, and narrow-window fallbacks.
4. Verify at 1280x800 and in the 372px companion width.

### Task 5: Verification and delivery

1. Run `pnpm typecheck`.
2. Run `pnpm exec jest --runInBand`.
3. Run production main and renderer builds.
4. Generate and inspect main and companion screenshots.
5. Build the unpacked Electron app.
6. Replace the active desktop runtime only after hash verification and retain a timestamped backup.
7. Commit and push the verified implementation.
