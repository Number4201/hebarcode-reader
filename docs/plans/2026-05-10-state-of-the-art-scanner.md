# State-of-the-Art Scanner Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn Hebarcode Reader into a professional, state-of-the-art warehouse barcode scanner by first making the scanner safe, deterministic, measurable, and hard to misuse.

**Architecture:** This is one sequential plan, not alternatives. The first wave fixes release health and creates a deterministic scan-commit pipeline in TypeScript. The second wave hardens the native Android scanner with stable coordinates, stable IDs, profiles, ROI ranking, and ML Kit backpressure safety. Every task is designed for TDD and subagent-driven implementation with spec review and code-quality review after each task.

**Tech Stack:** React Native 0.85.2, React 19.2.3, TypeScript, Jest, Android Kotlin, CameraX, ZXing-C++, ML Kit, GitHub Actions.

---

## Current Baseline

Repository: `/home/annak/hebarcode-reader`

Current HEAD while writing this plan: `a47630d Harden scanner pipeline and refresh docs`

Known verification state before implementation:

- PASS: `npm test -- --ci --runInBand`
- PASS: `npx tsc --noEmit`
- PASS: `npm run lint`
- PASS: `npm run benchmark:scanner`
- PASS: `cd android && ./gradlew assembleDebug`
- FAIL: `npm audit --package-lock-only`
  - `@babel/plugin-transform-modules-systemjs`
  - `fast-xml-builder`

Primary product rule for this plan:

> A wrong scan is worse than a missed scan. The scanner should only commit when it is confident, unambiguous, and recoverable via undo.

---

## Implementation Rules

1. Work sequentially. Do not parallel-edit the same files.
2. Use a fresh implementation subagent per task.
3. After each task, run two reviews:
   - Spec compliance review
   - Code quality/security review
4. Do not proceed while either review has open critical or important issues.
5. Use TDD for every code task:
   - Write failing test
   - Run it and verify failure
   - Implement minimal code
   - Run targeted test and verify pass
   - Run relevant regression tests
6. Commit only after a task is complete and reviewed.
7. Keep existing behavior unless the task explicitly changes it.
8. Do not push to GitHub until the final verification gate passes and the user approves.

---

## Phase 0 — Make the Repo Green and Enforce Scanner Gates

### Task 1: Fix npm audit vulnerabilities

**Objective:** Make CI green by fixing the current high-severity transitive dependency audit failures without using force or suppressions.

**Files:**
- Modify: `package-lock.json`

**Step 1: Run the audit fix**

Run:

```bash
cd /home/annak/hebarcode-reader
npm audit fix --package-lock-only
```

**Step 2: Verify audit is clean**

Run:

```bash
npm audit --package-lock-only
```

Expected: PASS, exit code 0.

**Step 3: Inspect the lockfile-only diff**

Run:

```bash
git diff -- package-lock.json
```

Expected:
- `@babel/plugin-transform-modules-systemjs` is no longer resolved to vulnerable `7.29.0`.
- `fast-xml-builder` is no longer resolved to vulnerable `1.1.5`.
- No package.json dependency change unless absolutely required.

**Step 4: Regression check**

Run:

```bash
npm test -- --ci --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package-lock.json
git commit -m "fix: clear dependency audit blockers"
```

---

### Task 2: Add reusable verification scripts

**Objective:** Make local, CI, and release verification call the same named scripts.

**Files:**
- Modify: `package.json`

**Step 1: Add scripts**

Add these scripts under `scripts`:

```json
"typecheck": "tsc --noEmit",
"verify:scanner": "npm run benchmark:scanner -- --min-decode-rate=1 --max-false-positives=0 --max-collapsed-instances=0 --max-duplicate-detections=0 --max-p95-latency-ms=500",
"verify:ci": "npm run audit && npm run typecheck && npm run verify:scanner && npm run lint && npm test -- --ci --runInBand"
```

Keep existing scripts.

**Step 2: Verify scripts individually**

Run:

```bash
npm run audit
npm run typecheck
npm run verify:scanner
npm run lint
npm test -- --ci --runInBand
```

Expected: all pass.

**Step 3: Verify combined script**

Run:

```bash
npm run verify:ci
```

Expected: PASS.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add scanner verification scripts"
```

---

### Task 3: Make scanner benchmark SLOs default

**Objective:** Enforce scanner excellence thresholds even when the raw benchmark script is run without explicit flags.

**Files:**
- Modify: `scripts/benchmark-scanner.js`
- Modify: `__tests__/scannerBenchmark.test.js`
- Modify: `README.md`

**Step 1: Update default thresholds**

In `scripts/benchmark-scanner.js`, set default thresholds to:

```js
const DEFAULT_THRESHOLDS = {
  maxCollapsedInstances: 0,
  maxDuplicateDetections: 0,
  maxFalsePositives: 0,
  maxP95LatencyMs: 500,
  minDecodeRate: 1,
};
```

If the file already has this object with different names/order, update it without changing unrelated logic.

**Step 2: Add benchmark threshold test**

In `__tests__/scannerBenchmark.test.js`, add a test proving the default threshold fails when p95 first-hit latency is above 500ms.

Expected behavior:
- A synthetic report with p95 latency `501` fails `assertThresholds` when using defaults.
- Existing explicit CLI threshold behavior remains unchanged.

**Step 3: Update README**

In the Scanner Benchmark section, document that the default gate is:

- decode rate: 100%
- false positives: 0
- collapsed same-payload physical instances: 0
- duplicate detections in a frame: 0
- p95 first-hit latency: <= 500ms

**Step 4: Verify**

Run:

```bash
npm run benchmark:scanner
npm test -- --runInBand __tests__/scannerBenchmark.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/benchmark-scanner.js __tests__/scannerBenchmark.test.js README.md
git commit -m "test: enforce scanner benchmark SLO defaults"
```

---

### Task 4: Add scanner excellence smoke fixture

**Objective:** Add a first benchmark dataset that covers multi-code, same-payload physical instances, and candidate-to-payload transition.

**Files:**
- Create: `benchmarks/scanner/scanner-excellence-smoke.json`
- Modify: `README.md`

**Step 1: Create fixture**

Create `benchmarks/scanner/scanner-excellence-smoke.json` with schema version 1 and at least these cases:

1. `multi-format-nearby-labels`
2. `same-payload-two-physical-labels`
3. `candidate-then-payload`

Requirements:
- Every expected barcode includes `format`, `text`, `firstVisibleAtMs`.
- Same-payload physical labels include distinct `instanceId` values.
- Every frame includes `timestampMs` and `detections`.
- Fixture passes current benchmark SLOs.

**Step 2: Verify fixture is auto-loaded**

Run:

```bash
npm run verify:scanner
```

Expected: PASS and dataset count increases by 1.

**Step 3: Update README**

Mention that all `benchmarks/scanner/*.json` fixtures are included by the scanner benchmark.

**Step 4: Commit**

```bash
git add benchmarks/scanner/scanner-excellence-smoke.json README.md
git commit -m "test: add scanner excellence benchmark smoke fixture"
```

---

### Task 5: Strengthen GitHub Actions quality gates

**Objective:** Make PR/main and release workflows fail before APK build if scanner quality gates fail.

**Files:**
- Modify: `.github/workflows/android-debug-apk.yml`
- Modify: `.github/workflows/android-release-arm64-apk.yml`

**Step 1: Update debug workflow**

After `Audit dependencies`, before `Run tests`, add:

```yaml
      - name: TypeScript check
        run: npm run typecheck

      - name: Run scanner benchmark
        run: npm run verify:scanner

      - name: Run lint
        run: npm run lint
```

**Step 2: Update release workflow**

Add the same three steps after audit and before tests/signing.

**Step 3: Verify YAML by local script execution**

Run:

```bash
npm run verify:ci
```

Expected: PASS.

**Step 4: Commit**

```bash
git add .github/workflows/android-debug-apk.yml .github/workflows/android-release-arm64-apk.yml
git commit -m "ci: gate builds on scanner quality checks"
```

---

### Task 6: Strengthen local release verification

**Objective:** Make `npm run verify:release` enforce the same pre-build gates as CI.

**Files:**
- Modify: `scripts/verify-release.sh`

**Step 1: Update sequence**

The script should run, in order:

```bash
npm run audit
npm run typecheck
npm run verify:scanner
npm run lint
npm test -- --ci --runInBand
```

Then keep existing signing env validation, arm64 release build, bundled JS verification, and output size display.

**Step 2: Update progress labels**

Use clear labels such as `[1/9] Audit dependencies`, `[2/9] TypeScript`, etc.

**Step 3: Verify non-signing portion**

Run:

```bash
npm run audit
npm run typecheck
npm run verify:scanner
npm run lint
npm test -- --ci --runInBand
```

Expected: PASS.

**Step 4: Commit**

```bash
git add scripts/verify-release.sh
git commit -m "ci: strengthen release verification gates"
```

---

## Phase 1 — Deterministic Scan Decision and Safe Commits

### Task 7: Create pure scan decision engine

**Objective:** Add a testable TypeScript module that ranks detections and decides when scanning is idle, ready, ambiguous, or duplicate-suppressed.

**Files:**
- Create: `src/scanner/scanDecision.ts`
- Create: `__tests__/scanDecision.test.ts`
- Modify only if necessary: `src/scanner/types.ts`

**Step 1: Write failing tests**

Create `__tests__/scanDecision.test.ts` covering:

- Empty detections => `idle`, `canCommit: false`
- Payload-less detections => `aiming`, `canCommit: false`
- Centered barcode ranks above off-center barcode
- Two near-equal candidates => `ambiguous`, `canCommit: false`
- Same logical key within cooldown => `duplicateSuppressed`
- Same logical key after cooldown => `ready`
- Manual selected barcode outranks automatic aim-zone candidate if still present

Run:

```bash
npm test -- --runTestsByPath __tests__/scanDecision.test.ts
```

Expected: FAIL because module does not exist.

**Step 2: Implement module**

Implement these exported types/functions:

```ts
export type ScanDecisionStatus =
  | 'idle'
  | 'aiming'
  | 'ready'
  | 'ambiguous'
  | 'duplicateSuppressed';

export type ScanCommitReason = 'manual' | 'aim-zone';

export type RecentScanCommit = {
  logicalKey: string;
  committedAtMs: number;
  barcode: DetectedBarcode;
};

export type RankedScanCandidate = {
  barcode: DetectedBarcode;
  logicalKey: string;
  score: number;
  aimZoneScore: number;
  distanceToAimCenter: number;
  areaScore: number;
  confidenceScore: number;
  recencyScore: number;
};

export type ScanCommitIntent = {
  logicalKey: string;
  barcode: DetectedBarcode;
  decidedAtMs: number;
  reason: ScanCommitReason;
};

export type ScanDecisionResult = {
  status: ScanDecisionStatus;
  primary: DetectedBarcode | null;
  ranked: RankedScanCandidate[];
  ambiguousCandidates: RankedScanCandidate[];
  message: string;
  canCommit: boolean;
  commitIntent: ScanCommitIntent | null;
};

export function decideScanTarget(input: ScanDecisionInput): ScanDecisionResult;
```

Use existing helpers where available:
- `buildLogicalBarcodeKey` from `src/scanner/barcodeIdentity.ts`
- `mapDetectionsToStage` from `src/scanner/overlay.ts`

Keep constants in the module.

**Step 3: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/scanDecision.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/scanner/scanDecision.ts __tests__/scanDecision.test.ts src/scanner/types.ts
git commit -m "feat: add deterministic scan decision engine"
```

---

### Task 8: Add expedition scan journal and undo model

**Objective:** Make every committed scan recoverable and auditable by storing a scan journal and adding undo.

**Files:**
- Modify: `src/app/models.ts`
- Modify: `src/app/expeditions.ts`
- Modify: `__tests__/expeditionModel.test.ts`

**Step 1: Write failing tests**

Add tests for:

- `recordExpeditionScan` creates a journal entry
- repeated scans create two journal entries and quantity 2
- undo decrements quantity from 2 to 1
- undo removes item when quantity reaches 0
- undo on empty expedition is a no-op
- old `ExpeditionRecord` without `scanJournal` can still receive scans safely

Run:

```bash
npm test -- --runTestsByPath __tests__/expeditionModel.test.ts
```

Expected: FAIL for missing journal/undo.

**Step 2: Extend models**

Add:

```ts
export type ExpeditionScanJournalEntry = {
  id: string;
  logicalKey: string;
  format: string;
  text: string;
  contentType: string;
  scannedAtMs: number;
  operation: 'add';
};
```

Extend `ExpeditionRecord`:

```ts
scanJournal?: ExpeditionScanJournalEntry[];
```

Use optional field for backwards compatibility.

**Step 3: Update expedition functions**

In `src/app/expeditions.ts`:

- Initialize `scanJournal: []` in new expedition records.
- Add journal entry on each successful scan.
- Add `undoLastExpeditionScan(expedition: ExpeditionRecord): ExpeditionRecord`.
- Normalize missing `scanJournal` to `[]` in helper code.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/expeditionModel.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/models.ts src/app/expeditions.ts __tests__/expeditionModel.test.ts
git commit -m "feat: add expedition scan journal and undo model"
```

---

### Task 9: Replace direct commit path with one commit function

**Objective:** Ensure manual and future automatic commits go through one guarded path with recent-commit tracking.

**Files:**
- Modify: `App.tsx`
- Modify: `__tests__/App.test.tsx`

**Step 1: Write failing tests**

Add App tests for:

- manual preview-card press commits exactly one scan
- repeated manual preview-card press deliberately increments quantity
- duplicate auto commit inside cooldown does not increment quantity
- different logical key commits immediately
- ambiguous decision does not mutate expedition

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx
```

Expected: FAIL until commit pipeline exists.

**Step 2: Implement central commit function**

In `App.tsx`, add:

- `recentCommits` state/ref, bounded to last 20 or last few seconds
- `commitScan(intent: ScanCommitIntent)`
- `handleManualBarcodePress(barcode: DetectedBarcode)` calls `commitScan({ reason: 'manual', ... })`

Rules:

- Manual commits preserve current deliberate double-tap behavior.
- Automatic/aim-zone commits obey duplicate cooldown.
- `recordExpeditionScan` is called only from `commitScan`.

**Step 3: Wire decision computation but do not auto-commit yet**

Use `decideScanTarget` to compute decision in `App.tsx`, but do not enable automatic commit in this task.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/scanDecision.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add App.tsx __tests__/App.test.tsx
git commit -m "feat: centralize scanner commit decisions"
```

---

### Task 10: Add scan feedback UI

**Objective:** Make successful, duplicate, ambiguous, and undone scan states obvious to operators.

**Files:**
- Modify: `src/app/models.ts`
- Modify: `App.tsx`
- Modify: `src/app/screens/ExpeditionScreen.tsx`
- Modify: `src/components/ScannerStage.tsx`
- Modify: `__tests__/App.test.tsx`
- Modify: `__tests__/ScannerStage.test.tsx`

**Step 1: Write failing tests**

Tests:

- committed scan renders a visible feedback message
- duplicate-suppressed scan renders duplicate feedback and does not increment quantity
- ambiguous decision renders an ambiguity hint
- feedback has accessible text

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/ScannerStage.test.tsx
```

Expected: FAIL until UI exists.

**Step 2: Add feedback type**

Add:

```ts
export type ScanFeedback = {
  kind: 'committed' | 'duplicate' | 'ambiguous' | 'undone';
  text: string;
  format?: string;
  quantity?: number;
  timestampMs: number;
};
```

**Step 3: Wire feedback**

- Set `committed` after successful commit.
- Set `duplicate` after suppressed automatic duplicate.
- Set `ambiguous` when decision is ambiguous.
- Pass feedback to `ExpeditionScreen` and/or `ScannerStage`.
- Render large, high-contrast feedback near scanner dock.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/ScannerStage.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/models.ts App.tsx src/app/screens/ExpeditionScreen.tsx src/components/ScannerStage.tsx __tests__/App.test.tsx __tests__/ScannerStage.test.tsx
git commit -m "feat: show scanner commit feedback"
```

---

### Task 11: Add undo button to expedition screen

**Objective:** Let operators recover from the last committed scan quickly.

**Files:**
- Modify: `App.tsx`
- Modify: `src/app/screens/ExpeditionScreen.tsx`
- Modify: `__tests__/App.test.tsx`

**Step 1: Write failing tests**

Tests:

- scan then press undo returns quantity to 0 or removes chip
- two scans then undo leaves quantity 1
- undo feedback renders
- undo button disabled/hidden when no journal entries exist

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx
```

Expected: FAIL until UI exists.

**Step 2: Wire undo handler**

In `App.tsx`:

- import `undoLastExpeditionScan`
- add `handleUndoLastScan`
- set `ScanFeedback` kind `undone`

In `ExpeditionScreen.tsx`:

- add “Zpět poslední” button in scanner dock
- disable when no undo is available
- add accessibility label

**Step 3: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/expeditionModel.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add App.tsx src/app/screens/ExpeditionScreen.tsx __tests__/App.test.tsx
git commit -m "feat: add undo for last expedition scan"
```

---

### Task 12: Render aim-zone and ambiguity states

**Objective:** Make the visual scanner guide correspond to the decision engine and block unsafe commits when multiple codes compete.

**Files:**
- Modify: `src/components/ScannerStage.tsx`
- Modify: `src/app/screens/ExpeditionScreen.tsx`
- Modify: `App.tsx`
- Modify: `__tests__/ScannerStage.test.tsx`
- Modify: `__tests__/App.test.tsx`

**Step 1: Write failing tests**

Tests:

- ready decision renders “Připraveno” or equivalent
- ambiguous decision renders “Vyber kód ručně” or equivalent
- ambiguous state still allows preview-card manual selection
- out-of-zone/non-primary cards are visually lower priority via testable props/text

Run:

```bash
npm test -- --runTestsByPath __tests__/ScannerStage.test.tsx __tests__/App.test.tsx
```

Expected: FAIL until state rendering exists.

**Step 2: Add props**

Add to `ScannerStage`:

```ts
decision?: ScanDecisionResult;
aimZoneEnabled?: boolean;
```

Render decision label and candidate state.

**Step 3: Pass decision from App**

Pass the computed decision down to expedition scanner UI.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/ScannerStage.test.tsx __tests__/App.test.tsx __tests__/scanDecision.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/ScannerStage.tsx src/app/screens/ExpeditionScreen.tsx App.tsx __tests__/ScannerStage.test.tsx __tests__/App.test.tsx
git commit -m "feat: show aim-zone scanner decision states"
```

---

### Task 13: Enable guarded automatic aim-zone commits

**Objective:** Allow fast operator flow only when the decision engine reports one unambiguous ready barcode.

**Files:**
- Modify: `App.tsx`
- Modify: `__tests__/App.test.tsx`
- Modify if needed: `src/scanner/scanDecision.ts`
- Modify if needed: `__tests__/scanDecision.test.ts`

**Step 1: Write failing tests**

Tests:

- ready decision commits once
- same ready decision does not commit repeatedly on rerender
- next frame same barcode inside cooldown does not commit
- next frame same barcode after cooldown can commit
- ambiguous decision never auto-commits
- manual press still commits immediately

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/scanDecision.test.ts
```

Expected: FAIL until auto-commit exists.

**Step 2: Add guarded effect**

In `App.tsx`:

- add `lastAutoCommitDecisionKeyRef`
- use `decision.commitIntent` only when:
  - screen is expedition
  - active expedition exists and is not finalized
  - decision.status is `ready`
  - decision.canCommit is true
  - decision.commitIntent.reason is `aim-zone`
  - commit key has not already been used

**Step 3: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/App.test.tsx __tests__/scanDecision.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add App.tsx __tests__/App.test.tsx src/scanner/scanDecision.ts __tests__/scanDecision.test.ts
git commit -m "feat: auto-commit unambiguous aim-zone scans"
```

---

## Phase 2 — Native Scanner Correctness and Robustness

### Task 14: Add native coordinate transformer

**Objective:** Emit ZXing and ML Kit points in one canonical display-frame coordinate space.

**Files:**
- Create: `android/app/src/main/java/com/hebarcode/reader/HebarcodeCoordinateTransformer.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeMlKitBarcodeMapper.kt`
- Modify if surfaced to JS: `src/native/HebarcodeScanner.ts`
- Modify if surfaced to JS: `__tests__/HebarcodeScannerBridge.test.ts`

**Step 1: Create transformer**

Create `HebarcodeCoordinateTransformer.kt` with:

- `FrameGeometry`
- `toDisplayPoint`
- `toDisplayRect`
- rotation normalization for 0/90/180/270

**Step 2: Use transformer in ZXing result mapping**

Replace direct `result.position.*.x/y` point emission with transformed points.

**Step 3: Use transformer in ML Kit mapper**

Pass geometry/transformer into ML Kit detection building and transform corner/bounding box points.

**Step 4: Add diagnostic metadata**

Emit optional fields:

- `coordinateSpace: "display-frame"`
- `imageRotationDegrees`
- `imageCropRect`

**Step 5: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/HebarcodeScannerBridge.test.ts
cd android && ./gradlew :app:compileDebugKotlin
cd android && ./gradlew :app:assembleDebug
```

Expected: PASS.

**Step 6: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeCoordinateTransformer.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeMlKitBarcodeMapper.kt src/native/HebarcodeScanner.ts __tests__/HebarcodeScannerBridge.test.ts
git commit -m "feat: normalize native scanner coordinates"
```

---

### Task 15: Add native stable detection tracker

**Objective:** Give physical barcode instances stable IDs across frames and engines.

**Files:**
- Create: `android/app/src/main/java/com/hebarcode/reader/HebarcodeDetectionTracker.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeMlKitBarcodeMapper.kt`
- Modify: `src/native/HebarcodeScanner.ts`
- Modify: `__tests__/HebarcodeScannerBridge.test.ts`
- Modify: `__tests__/nativeScanner.test.ts`

**Step 1: Add tracker class**

Tracker requirements:

- Monotonic `native-N` instance IDs
- TTL around 1200–1800ms
- Match by decoded signature and geometry
- Separate same-payload physical labels by spatial distance/IoU
- Track `ageMs`, `seenCount`, `lastSeenAtMs`, `trackingState`

**Step 2: Reset tracker on lifecycle boundaries**

Reset on successful new bind and unbind.

**Step 3: Route ZXing and ML Kit detections through tracker**

Use stable native `id` as the detection ID.

**Step 4: Update JS normalization**

Accept native `id`, `ageMs`, `seenCount`, `lastSeenAtMs` if present. Keep fallback ID generation for older native modules.

**Step 5: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/HebarcodeScannerBridge.test.ts __tests__/nativeScanner.test.ts __tests__/selection.test.ts
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: PASS.

**Step 6: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeDetectionTracker.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeMlKitBarcodeMapper.kt src/native/HebarcodeScanner.ts __tests__/HebarcodeScannerBridge.test.ts __tests__/nativeScanner.test.ts
git commit -m "feat: track stable native barcode instances"
```

---

### Task 16: Add ScannerProfile bridge

**Objective:** Let JS configure native scanner behavior through a safe, versioned profile payload.

**Files:**
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt`
- Modify: `src/native/HebarcodeScanner.ts`
- Modify: `__tests__/nativeScanner.test.ts`
- Modify: `__tests__/HebarcodeScannerBridge.test.ts`

**Step 1: Add native config data class**

First-wave fields:

- `detectionThrottleMs`
- `assistModeEnabled`
- `analyzerPreviewEnabled`
- `roiEnabled`
- `roiCenterWeight`
- `candidateTtlMs`
- `maxDetections`
- `preferDecoded`
- `mlKitEnabled`
- `deepScanEnabled`

**Step 2: Add safe parser**

Implement `setScannerProfileConfig(config: ReadableMap?)` with defaults and no crashes for missing keys.

**Step 3: Add React method**

In `HebarcodeScannerModule.kt`:

```kt
@ReactMethod
fun setScannerProfile(profile: ReadableMap, promise: Promise)
```

**Step 4: Add JS wrapper**

In `src/native/HebarcodeScanner.ts`, add `setNativeScannerProfile` and payload typing.

**Step 5: Surface status fields**

Add status fields:

- `scannerProfileName`
- `roiEnabled`
- `maxDetections`
- `mlKitEnabled`
- `deepScanEnabled`

**Step 6: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/nativeScanner.test.ts __tests__/HebarcodeScannerBridge.test.ts
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: PASS.

**Step 7: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt src/native/HebarcodeScanner.ts __tests__/nativeScanner.test.ts __tests__/HebarcodeScannerBridge.test.ts
git commit -m "feat: add native scanner profile bridge"
```

---

### Task 17: Add native ROI rank fields

**Objective:** Let native detections carry rank information based on ROI proximity, decoded status, confidence, area, and tracking stability.

**Files:**
- Create: `android/app/src/main/java/com/hebarcode/reader/HebarcodeDetectionRanker.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Modify: `src/native/HebarcodeScanner.ts`
- Modify: `__tests__/HebarcodeScannerBridge.test.ts`
- Modify if needed: `__tests__/frameFusion.test.ts`

**Step 1: Add ranker**

Ranker outputs:

- `rank`
- `rankScore`
- `roiScore`
- `areaRatio`
- `center`

**Step 2: Define ROI in display-frame space**

Default first-wave ROI:

- center rectangle in normalized frame coordinates
- safe default size: large enough not to hide useful codes

**Step 3: Apply ranker before emitting detections**

Sort descending by rank score, cap to `maxDetections`, and keep JS fallback logic intact.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/HebarcodeScannerBridge.test.ts __tests__/frameFusion.test.ts
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: PASS.

**Step 5: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeDetectionRanker.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt src/native/HebarcodeScanner.ts __tests__/HebarcodeScannerBridge.test.ts __tests__/frameFusion.test.ts
git commit -m "feat: rank native detections by scanner ROI"
```

---

### Task 18: Harden ML Kit ImageProxy/backpressure path

**Objective:** Prevent ML Kit from starving CameraX frame analysis or leaving stale busy state.

**Files:**
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Optional create: `android/app/src/main/java/com/hebarcode/reader/HebarcodeCloseGuard.kt`
- Modify: `src/native/HebarcodeScanner.ts`
- Modify: `__tests__/nativeScanner.test.ts`

**Step 1: Add diagnostics counters**

Add:

- `mlKitDroppedBecauseBusyCount`
- `mlKitTimeoutCount`
- `mlKitStaleResultCount`
- `mlKitLastGeneration`

**Step 2: Add close guard / timeout**

- Ensure retained `ImageProxy` closes exactly once.
- Add timeout around 1500ms.
- Stale ML Kit results must not mutate detection state.

**Step 3: Surface counters in JS status**

Update `src/native/HebarcodeScanner.ts` status normalization and tests.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/nativeScanner.test.ts __tests__/HebarcodeScannerBridge.test.ts
cd android && ./gradlew :app:compileDebugKotlin
cd android && ./gradlew :app:assembleDebug
```

Expected: PASS.

**Step 5: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeCloseGuard.kt src/native/HebarcodeScanner.ts __tests__/nativeScanner.test.ts
git commit -m "fix: harden ML Kit frame backpressure handling"
```

---

### Task 19: Add observable scanner state

**Objective:** Expose a deterministic scanner state for diagnostics without doing a risky full controller rewrite yet.

**Files:**
- Create: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerState.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt`
- Modify: `src/native/HebarcodeScanner.ts`
- Modify: `__tests__/nativeScanner.test.ts`

**Step 1: Add enum**

States:

- `IDLE`
- `WAITING_FOR_PERMISSION`
- `WAITING_FOR_PREVIEW`
- `BINDING`
- `BOUND_WAITING_FOR_FRAMES`
- `STREAMING`
- `RECOVERING`
- `STOPPING`
- `ERROR`

**Step 2: Add derived state first**

Implement `getScannerState()` from existing fields. Do not rewrite the whole controller state machine in this first task.

**Step 3: Surface in status**

Add `scannerState` to native status and JS normalization.

**Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath __tests__/nativeScanner.test.ts __tests__/HebarcodeScannerBridge.test.ts
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: PASS.

**Step 5: Commit**

```bash
git add android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerState.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt src/native/HebarcodeScanner.ts __tests__/nativeScanner.test.ts
git commit -m "feat: expose native scanner state"
```

---

## Phase 3 — Integration and Final Gate

### Task 20: Update docs and changelog

**Objective:** Document the authoritative verification gate and first scanner excellence wave.

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Update README verification section**

Recommended local command:

```bash
npm run verify:ci
```

Expanded commands:

```bash
npm run audit
npm run typecheck
npm run verify:scanner
npm run lint
npm test -- --runInBand
cd android && ./gradlew :app:assembleDebug
```

Mention that `npm run verify:scanner` is the CI/release scanner SLO gate.

**Step 2: Add changelog entry**

Add dated entry:

```md
## 2026-05-10

- Added scanner excellence verification gates for audit, TypeScript, lint, benchmark SLOs, tests, and release verification.
- Added deterministic scanner decision planning for aim-zone ranking, ambiguity handling, duplicate suppression, scan feedback, and undoable scan journals.
```

Adjust to fit existing changelog format.

**Step 3: Verify docs do not contradict scripts**

Run:

```bash
npm run verify:ci
```

Expected: PASS.

**Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document scanner excellence gates"
```

---

### Task 21: Full local integration verification

**Objective:** Prove the complete first implementation wave is clean locally.

**Files:**
- No code changes expected unless verification exposes issues.

**Step 1: Run full JS quality gate**

Run:

```bash
cd /home/annak/hebarcode-reader
npm run verify:ci
```

Expected: PASS.

**Step 2: Run Android debug build**

Run:

```bash
cd /home/annak/hebarcode-reader/android
./gradlew :app:assembleDebug
```

Expected: PASS.

**Step 3: Run whitespace/diff checks**

Run:

```bash
cd /home/annak/hebarcode-reader
git diff --check
git status --short
git log --oneline -n 10
```

Expected:
- `git diff --check` PASS.
- Only intentional commits present.
- No accidental uncommitted files.

**Step 4: Final integration review**

Dispatch final reviewer subagent with:

- Full diff since `a47630d`
- This plan file
- Verification results

Reviewer must check:

- All plan tasks implemented
- No overbuilt scope
- Wrong-scan risks reduced
- Tests meaningful
- Native changes backward-compatible
- CI/release gates correct

**Step 5: Fix review issues if any**

If reviewer requests changes, create a new task-specific fix commit and repeat full verification.

---

## Definition of Done

This plan is complete only when all of these are true:

1. `npm audit --package-lock-only` passes.
2. `npm run verify:ci` passes.
3. `cd android && ./gradlew :app:assembleDebug` passes.
4. GitHub workflows include audit, typecheck, scanner SLO benchmark, lint, tests, and APK build.
5. Scanner benchmark enforces default SLOs.
6. The app has a pure scan decision engine.
7. Center aim-zone ranking chooses the intended barcode.
8. Ambiguous frames do not mutate expedition data automatically.
9. Duplicate automatic commits are suppressed.
10. Manual commits remain deliberate and usable.
11. Successful, duplicate, ambiguous, and undone scan states are visible.
12. Every committed scan has a journal entry.
13. Last scan can be undone.
14. Native detections use canonical transformed coordinates.
15. Native detection IDs are stable across frames.
16. Native profile/ROI/rank fields are available.
17. ML Kit async path cannot permanently stall the analyzer.
18. Native scanner state is visible in diagnostics.
19. README and CHANGELOG describe the new gates and scanner behavior.
20. Final independent integration review approves.

---

## Important Non-Goals for This Plan

Do not do these in this wave:

- Do not rewrite the entire native controller into multiple files beyond the small classes listed.
- Do not add cloud services.
- Do not add encryption/export policy changes yet.
- Do not add full raw image/video benchmark infrastructure yet.
- Do not add hardware trigger support yet.
- Do not add full GS1 parser yet.
- Do not push without user approval.

Those are later waves after this foundation lands cleanly.
