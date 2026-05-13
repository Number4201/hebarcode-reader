# State-of-the-Art Scanner Reliability Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Přestavět interní fungování skeneru tak, aby aplikace nikdy automaticky neuložila špatný kód a aby každý uložený scan měl měřitelnou důvěru, auditovatelnou stopu a opakovatelné regresní testy.

**Architecture:** Scanner bude oddělený na čisté vrstvy: frame acquisition → multi-engine decoding → geometry normalization → temporal fusion/tracking → confidence/risk gate → explicit trigger commit → audit log. UX zůstane jednoduché, ale interně bude commit povolený jen při stabilním, jednoznačném a ověřeném cíli. „0 chybovost“ nelze matematicky slíbit pro libovolnou kameru/papír, ale cílem je fail-closed: při nejistotě raději neuložit nic než uložit špatný kód.

**Tech Stack:** React Native, Android CameraX/ImageAnalysis, Kotlin native scanner bridge, ZXing/ML Kit/volitelný druhý dekodér, TypeScript decision engine, Jest unit tests, synthetic scanner benchmark, ADB device tests.

---

## Non-goals

- Nevracet se k automatickému ukládání bez spouště.
- Nezahlcovat UI rámečky, kartami a debug textem v běžném live režimu.
- Neslibovat absolutní 0 fyzikálních chyb; místo toho zavést měřené confidence gates a fail-closed chování.
- Nedělat ad-hoc heuristiky bez testů a benchmarků.

---

## Acceptance Criteria

1. Trigger uloží kód pouze když je jeden stabilní cíl v aim zóně.
2. Pokud je v aim zóně více kandidátů nebo se cíl třese, trigger neuloží nic a ukáže jasnou hlášku.
3. Každý kandidát má confidence score složené z geometrie, kvality obrazu, opakované detekce a decoder agreement.
4. Každý commit má audit metadata: text, format, frame id, confidence, stability window, source engines, bounding box, timestamp.
5. Test suite obsahuje případy pro blízké kódy, rozmazání, částečné překrytí, rotaci, duplicate suppression a nejednoznačné cíle.
6. Benchmark reportuje false positives = 0 na známém datasetu a explicitně měří rejected/ambiguous cases.
7. Reálný device test přes ADB má checklist a sbírá logcat + screenshoty.

---

## Task 1: Introduce explicit scanner confidence model

**Objective:** Přidat typy pro interní hodnocení kandidáta bez změny UI.

**Files:**
- Modify: `src/scanner/scanDecision.ts`
- Modify: `src/scanner/types.ts`
- Test: `__tests__/scanDecision.test.ts`

**Step 1: Write failing tests**

Add tests for:
- candidate in reticle has geometry score > outside candidate
- candidate without text cannot be committable
- ambiguous candidates return `status: 'ambiguous'`
- low confidence candidate returns `status: 'searching'` or non-committable state

**Step 2: Run RED**

Run:
`npm test -- --runInBand __tests__/scanDecision.test.ts`

Expected: FAIL because confidence fields/statuses do not exist yet.

**Step 3: Implement minimal model**

Add fields like:
- `geometryScore`
- `stabilityScore`
- `decodeScore`
- `imageQualityScore`
- `confidence`
- `riskFlags: string[]`
- `committable: boolean`

**Step 4: Run GREEN**

Run:
`npm test -- --runInBand __tests__/scanDecision.test.ts`

Expected: PASS.

---

## Task 2: Add temporal fusion / target tracker

**Objective:** Commit candidate musí být stabilní přes více snímků, ne jen jednorázová detekce.

**Files:**
- Create: `src/scanner/targetTracker.ts`
- Test: `__tests__/targetTracker.test.ts`
- Modify: `App.tsx` integration only after unit tests pass

**Step 1: Write failing tests**

Cases:
- same barcode in 3 consecutive frames becomes stable
- barcode jumping between two nearby codes stays ambiguous
- missing one frame does not immediately clear target
- different text under reticle resets stability

**Step 2: Run RED**

Run:
`npm test -- --runInBand __tests__/targetTracker.test.ts`

Expected: FAIL because tracker does not exist.

**Step 3: Implement minimal tracker**

Use a small sliding window keyed by logical barcode key and geometry proximity.

**Step 4: Run GREEN**

Run:
`npm test -- --runInBand __tests__/targetTracker.test.ts`

Expected: PASS.

---

## Task 3: Make trigger fail-closed

**Objective:** Trigger nikdy neuloží kandidáta, který není stable + committable.

**Files:**
- Modify: `App.tsx`
- Modify: `src/app/screens/ExpeditionScreen.tsx`
- Test: `__tests__/App.test.tsx`

**Step 1: Write failing tests**

Cases:
- trigger with low confidence does not add item
- trigger with ambiguous candidates does not add item
- trigger with stable high confidence candidate adds item
- feedback text explains why commit was rejected

**Step 2: Run RED**

Run:
`npm test -- --runInBand __tests__/App.test.tsx`

Expected: FAIL on new confidence gating behavior.

**Step 3: Implement minimal gating**

Only call `commitScan` when selected/primary target is `committable === true`.

**Step 4: Run GREEN**

Run:
`npm test -- --runInBand __tests__/App.test.tsx`

Expected: PASS.

---

## Task 4: Align native Kotlin ROI/ranker with JS confidence model

**Objective:** Native side and JS side must rank the same target area, otherwise reticle and selected object diverge.

**Files:**
- Modify: `android/app/src/main/java/com/hebarcode/reader/HebarcodeDetectionRanker.kt`
- Test: existing Kotlin if available, otherwise add JS parity tests around normalized ROI constants
- Modify: `src/scanner/scanDecision.ts`

**Step 1: Extract shared constants conceptually**

Define one authoritative ROI config in JS and mirror it in Kotlin with comments and tests.

**Step 2: Add parity test**

Test that reticle top/height/width ratios match expected Kotlin constants.

**Step 3: Verify**

Run:
`npm run typecheck && npm test -- --runInBand __tests__/scanDecision.test.ts`

Expected: PASS.

---

## Task 5: Add multi-engine decoder agreement gate

**Objective:** For high-risk cases, require agreement between fast decoder and deep/secondary decoder before commit.

**Files:**
- Modify: native scanner bridge files under `android/app/src/main/java/com/hebarcode/reader/`
- Modify: `src/scanner/types.ts`
- Test: `__tests__/nativeScanner.test.ts`

**Step 1: Write failing tests**

Cases:
- same text from fast and deep decoder increases confidence
- disagreement sets risk flag and blocks commit
- secondary decoder timeout does not crash scanner but lowers confidence

**Step 2: Implement minimal metadata propagation**

Pass decoder source/agreement metadata to JS frame events.

**Step 3: Verify**

Run:
`npm test -- --runInBand __tests__/nativeScanner.test.ts __tests__/scanDecision.test.ts`

Expected: PASS.

---

## Task 6: Add audit log for every committed scan

**Objective:** Každý uložený scan musí být zpětně vysvětlitelný.

**Files:**
- Modify: `src/app/models.ts`
- Modify: expedition model tests
- Test: `__tests__/expeditionModel.test.ts`

**Step 1: Write failing tests**

Assert scan journal stores:
- barcode text and format
- confidence
- frame timestamp
- stability frame count
- risk flags
- selected/trigger source

**Step 2: Implement model changes**

Keep backward compatibility for old records.

**Step 3: Verify**

Run:
`npm test -- --runInBand __tests__/expeditionModel.test.ts __tests__/App.test.tsx`

Expected: PASS.

---

## Task 7: Build adversarial scanner benchmark dataset

**Objective:** Měřit nejen úspěšné dekódování, ale hlavně false positives a wrong-target risk.

**Files:**
- Modify: `scripts/benchmark-scanner.js`
- Add fixtures under `benchmarks/scanner/`
- Test: `__tests__/scannerBenchmark.test.js`

**Dataset cases:**
- two barcodes 1–2 cm apart
- barcode above/below reticle
- blurry barcode
- rotated barcode
- partial barcode
- QR + CODE_128 nearby
- repeated same code on page
- low light / glare if fixture possible

**Metrics:**
- decode rate
- false positives
- wrong target selections
- ambiguous rejects
- p95 latency
- confidence distribution

**Verification:**
Run:
`npm run verify:scanner`

Expected:
- false positives = 0
- wrong target selections = 0
- ambiguous cases rejected, not committed

---

## Task 8: Device test harness through ADB

**Objective:** Udělat opakovatelný reálný test přes připojený telefon.

**Files:**
- Create: `scripts/device-scanner-smoke.sh`
- Create: `docs/testing/device-scanner-checklist.md`

**Script should:**
- detect Windows ADB path if WSL has no `adb`
- install demo APK
- clear logcat
- start app
- collect screenshots
- collect filtered logcat
- print package/activity/status

**Verification:**
Run:
`bash scripts/device-scanner-smoke.sh`

Expected:
- phone detected
- APK installed
- app launched
- screenshot saved
- no fatal exceptions in logcat

---

## Task 9: Add optional debug overlay mode

**Objective:** Běžné UI zůstane čisté, ale vývojář může zapnout interní confidence/debug overlay.

**Files:**
- Modify: settings model/UI
- Modify: `ScannerStage`
- Test: `__tests__/ScannerStage.test.tsx`

**Behavior:**
- default: no detection boxes/cards in live camera
- debug mode: show boxes, candidate IDs, confidence, risk flags

**Verification:**
Run:
`npm test -- --runInBand __tests__/ScannerStage.test.tsx __tests__/App.test.tsx`

Expected: PASS.

---

## Task 10: Full release verification

**Objective:** Gate before pushing APK.

**Commands:**

Run:
`npm run verify:ci`

Expected:
- 0 vulnerabilities
- typecheck OK
- scanner benchmark OK
- lint OK
- all Jest tests OK

Run:
`cd android && ./gradlew :app:assembleDemo -PreactNativeArchitectures=arm64-v8a`

Expected:
- BUILD SUCCESSFUL

Run device test:
`bash scripts/device-scanner-smoke.sh`

Expected:
- app launches on phone
- scanner screen visible
- no fatal logcat errors

Commit and push only after all gates pass.

---

## Implementation Order

1. Confidence model
2. Temporal tracker
3. Fail-closed trigger
4. Native/JS ROI parity
5. Multi-engine agreement
6. Audit log
7. Adversarial benchmark
8. ADB device harness
9. Debug overlay
10. Release verification

This order keeps the app usable after each step and prevents a messy rewrite.
