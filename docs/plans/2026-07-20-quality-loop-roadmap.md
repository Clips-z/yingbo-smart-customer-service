# Quality Loop Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an auditable customer-service quality loop in P0, then improve the operator experience in P1 and add governed knowledge lifecycle and team capabilities in P2.

**Architecture:** SQLite remains the source of truth. Reply feedback, retrieval evidence, knowledge candidates, evaluation cases, versions, and audit events are stored as explicit relational records; RAG remains a derived searchable index. Automatic learning may create candidates, but only a human approval can publish knowledge. All knowledge stays searchable, fully viewable, editable, and manually exportable from the desktop application.

**Tech Stack:** Electron, React 18, TypeScript, Chakra UI, Express, Sequelize/SQLite, Jest, FastAPI, ChromaDB.

---

## Non-negotiable product invariants

1. No conversation-derived content is published to RAG without human approval.
2. Every published knowledge item can be searched, opened in full, edited, disabled, and exported manually.
3. Export supports UTF-8 CSV and JSON, includes active filters when requested, and never exports hidden secrets.
4. A reply can be traced to its model/prompt version, retrieval evidence, human edits, final action, and delivery result.
5. Low-confidence OCR, ambiguous conversation identity, weak retrieval, or high-risk intent cannot enter unattended delivery.
6. RAG is a derived index: SQLite data, versions, and audit history are the recoverable source of truth.

## P0 — quality loop

### Task 1: Quality-loop schema and migrations

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/knowledgeCandidate.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replyFeedback.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/retrievalEvidence.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/evaluationCase.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replySuggestion.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/ormconfig.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/qualityLoopPersistence.test.ts`

**Steps:** Write a failing persistence/reopen test; define models and indexes; add backward-compatible nullable fields to reply suggestions; initialize and migrate all models; rerun the focused test and existing persistence tests.

**Acceptance:** Existing databases upgrade without data loss; new records survive reopen; conversation text and evidence are not duplicated into logs.

### Task 2: Reply feedback capture and metrics

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/replyFeedbackService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/analyticsService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/platform/controller.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/replyFeedbackService.test.ts`

**Steps:** Test idempotent action capture and edit distance; implement feedback service and endpoints; record generated/draft/fill/copy/dismiss/restore/send/fail/transfer signals; add accept/edit/no-answer metrics; verify actions remain safe when feedback persistence fails.

**Acceptance:** Original and final text, action, edit ratio, timestamps, and failure category are queryable without changing delivery semantics.

### Task 3: Human-readable knowledge details and manual export

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/knowledgeExportService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/knowledgeService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/knowledge/storeKB.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/StoreKnowledgeBase/index.tsx`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ProductQALibrary/index.tsx`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/knowledgeExportService.test.ts`

**Steps:** Test complete UTF-8 CSV/JSON serialization; add filtered/full export endpoints with attachment headers; add full-detail drawer with edit action; expose export buttons and format/scope choices; verify multiline Chinese content round-trips.

**Acceptance:** Users can search, inspect full content, edit, disable, and manually export store and product knowledge in CSV or JSON.

### Task 4: Knowledge candidate generation and approval

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/knowledgeCandidateService.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/knowledge/candidates.ts`
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/KnowledgeCandidates/index.tsx`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/layout/AppSidebar.tsx`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/knowledgeCandidateService.test.ts`

**Steps:** Test frequency and repeated-human-edit candidate rules; implement deduplication and PII redaction; add candidate list/detail/edit/approve/reject/merge endpoints; publish approved candidates through KnowledgeService; verify rejection never changes RAG.

**Acceptance:** Candidate evidence and frequency are visible; only explicit approval publishes; duplicate candidates merge deterministically.

### Task 5: Retrieval evidence and safe fallback

**Files:**
- Modify: `rag-server/server.py`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/ragService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/dispatchService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/replySafetyPolicy.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/ReplyWorkbench/index.tsx`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/retrievalSafety.test.ts`

**Steps:** Preserve source/id/vector/rerank/updated metadata; store evidence per suggestion; classify no-hit, weak-hit, conflict, stale, and high-risk results; block unattended send where required; show evidence and a “not relevant” action in the workbench.

**Acceptance:** Every grounded suggestion exposes its sources; weak/unsafe suggestions visibly degrade to assist or transfer-to-human.

### Task 6: Real retrieval evaluation suite

**Files:**
- Create: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/evaluationService.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/backend.ts`
- Replace: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/common/services/knowledge/corpusTest.ts`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/renderer/main-window/components/CorpusTest/index.tsx`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/evaluationService.test.ts`

**Steps:** Add manually editable evaluation cases; run actual RAG search with expected knowledge IDs and risk expectations; calculate hit@k, no-hit precision, unsafe-pass count, and latency percentiles; export reports; remove simulated delays and character-overlap scoring from the production test screen.

**Acceptance:** Model/prompt/RAG changes produce a reproducible regression report over stored, exportable cases.

### Task 7: OCR confidence gate and diagnostics

**Files:**
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/services/replySafetyPolicy.ts`
- Modify: platform sidecar adapters under `ChatGPT-On-CS-main/ChatGPT-On-CS-main/scripts/`
- Modify: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/main/backend/entities/replySuggestion.ts`
- Test: `ChatGPT-On-CS-main/ChatGPT-On-CS-main/src/__tests__/services/ocrConfidenceGate.test.ts`

**Steps:** Normalize OCR confidence/evidence from adapters; persist confidence and reason codes; test per-platform thresholds and ambiguous-contact cases; block unattended delivery below threshold; expose diagnostic reason without retaining raw screenshots by default.

**Acceptance:** Low-confidence captures remain reviewable but cannot auto-send; duplicate and contact-mismatch rates are measurable.

## P1 — operator experience

### Task 8: Task-priority reply workbench

Add priority/SLA sorting, context and evidence panes, keyboard shortcuts, recoverable actions, and accessible focus states. Test sorting, shortcuts, draft safety, and narrow-window layout.

### Task 9: Actionable home dashboard

Replace empty-state-heavy status panels with pending, overdue, failed, degraded-platform, and knowledge-review cards. Each card deep-links to the filtered recovery action.

### Task 10: Guided onboarding and notifications

Add platform/LLM/RAG/test-message readiness steps, actionable retry controls, tray notifications for sustained failures or SLA breaches, and notification throttling.

## P2 — governed lifecycle and scale

### Task 11: Knowledge versions, expiry, merge, and rollback

Version every edit and publication, allow effective/expiry dates, identify duplicates/conflicts, support merge previews, and rebuild RAG from a selected version.

### Task 12: Scope, privacy, and audit governance

Add platform/shop/product/stage scopes, PII redaction policies, roles, immutable audit events, and exports that honor scope and redaction.

### Task 13: A/B comparison and platform replay

Persist model/prompt/knowledge variants, compare offline and live feedback metrics, and replay sanitized OCR/adapter fixtures after client updates.

### Task 14: Backup, migration, and disaster recovery

Create verified SQLite plus knowledge-version backups, import previews, schema/version checks, restore drills, and RAG rebuild from the restored source of truth.

## Verification gates

After every task run focused Jest tests. After every P-level run the full Jest suite, TypeScript production build, Python syntax checks, and UI screenshots for normal/empty/error states. Before final delivery, reopen a migrated SQLite database, export and re-import Chinese multiline knowledge, run an evaluation report, prove low-confidence auto-send is blocked, and inspect `git diff` for secrets or unrelated changes.
