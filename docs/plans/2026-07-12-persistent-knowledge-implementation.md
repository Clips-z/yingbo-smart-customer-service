# Persistent Knowledge Base Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace in-memory mock knowledge data with durable SQLite CRUD and a professional operational UI.

**Architecture:** Add Sequelize entities and a backend knowledge service as the source of truth, expose validated REST endpoints, then replace renderer mock adapters with HTTP clients. Persist RAG sync state independently so indexing failure never loses user data.

**Tech Stack:** Electron, TypeScript, Express, Sequelize/SQLite, React, Chakra UI, React Query, Jest, ExcelJS.

---

### Task 1: Add durable knowledge entities

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/productKnowledge.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/storeKnowledge.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/ormconfig.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/knowledgeValidation.test.ts`

1. Define normalized input validators and failing tests.
2. Add entities, indexes, safe defaults, timestamps, and sync state.
3. Register entities before `sequelize.sync()`.
4. Verify a temporary SQLite database survives close/reopen.

### Task 2: Implement backend CRUD and pagination

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/knowledgeService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/knowledgeService.test.ts`

1. Add list/search/create/update/delete and batch methods.
2. Validate IDs, lengths, stages, and uniqueness at the backend boundary.
3. Return structured validation and conflict errors.
4. Add `/api/v1/knowledge/products` and `/api/v1/knowledge/store-qa` routes.

### Task 3: Replace renderer mock adapters

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/knowledge/productQA.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/knowledge/storeKB.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ProductQALibrary/index.tsx`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/StoreKnowledgeBase/index.tsx`

1. Remove generated demo arrays and local mutation.
2. Map existing UI types to REST request/response types.
3. Keep existing page behavior while making loading/errors truthful.
4. Run renderer tests and build.

### Task 4: Add sync state and retry

**Files:**
- Modify: knowledge entities and service.
- Modify: `src/main/backend/services/ragService.ts`
- Modify: knowledge pages.
- Test: `src/__tests__/services/knowledgeSync.test.ts`

1. Mark saved records pending before indexing.
2. Store synced/failed result without rolling back content.
3. Add retry endpoints and UI actions.
4. Restrict retrieval to enabled, synced records.

### Task 5: Refine the operational UI

**Files:**
- Modify: product and store knowledge pages.
- Modify: shared knowledge layout components as needed.

1. Add truthful summary counts and sync status filters.
2. Improve empty/error/loading states and destructive confirmations.
3. Standardize spacing, table density, status badges, and batch bar.
4. Verify at narrow and wide desktop widths.

### Task 6: Add previewed CSV/Excel import

1. Parse CSV/XLSX locally with explicit column mapping.
2. Preview valid/invalid rows before saving.
3. Submit valid rows in a transaction and return row-level errors.
4. Add import tests with Chinese text and duplicate identifiers.

### Task 7: Full verification

1. Run focused knowledge tests and full Jest.
2. Run main and renderer production builds.
3. Run `git diff --check`.
4. Verify restart persistence with a temporary database.
5. Confirm no mock data is injected into a new user database.
