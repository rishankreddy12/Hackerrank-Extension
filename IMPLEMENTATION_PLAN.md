# HackerRank Problem-Setting Bulk Test-Case Extension

## 1. Executive summary

Build a small Chrome/Chromium Manifest V3 extension for authorized HackerRank problem setters. It should add a compact toolbar to the existing **Test Cases** page and remove the repetitive work of clicking and editing rows one by one.

The first version should provide:

1. **Select all test cases**.
2. **Clear the selection**.
3. **Select an inclusive range** by the displayed order number.
4. **Apply one score/strength value to the selected rows**.
5. A progress indicator and a clear result when the native HackerRank save succeeds or fails.

The extension should use the existing HackerRank controls and save behavior rather than inventing a second API client. That keeps it small, preserves the user's existing authentication and authorization, and reduces the risk of corrupting problem data when HackerRank changes its backend.

The recommended MVP interpretation of “assign scoring in range” is: select rows `start..end`, then assign the same score to every selected row. Automatic distribution of a total score across a range should remain a separate, explicitly designed feature; it should not be guessed in the MVP.

---

## 2. Current workspace and research status

The workspace currently contains only the supplied reference page:

```text
references/Reference-HTML-Page-Of-Hackerrank-problemsetting-page.txt
```

There is no existing extension scaffold, package manifest, build configuration, or test suite to preserve. The implementation should therefore start as a deliberately small vanilla JavaScript extension rather than introducing React, a bundler, or a framework.

The supplied document is a captured HackerRank page with placeholders for challenge, user, CSRF, and test-case identifiers. It is useful for identifying the page contract, but it is not a promise that every future HackerRank deployment will use the same classes or page architecture.

The unauthenticated live URL was also checked. It returned HackerRank's generic error/loading view rather than the protected problem-setting table, so authenticated verification against a real test problem is still required before implementation is considered complete.

---

## 3. Findings from the reference page

### 3.1 Page scope

The target route is:

```text
https://www.hackerrank.com/administration/challenges/edit/{challengeId}/testcases
```

The reference identifies the active tab as **Test Cases** (`data-tab="testcases"`) and wraps the content in `.challenge-testcases` (reference lines 915 and 931).

The page also appears to use client-side navigation/Backbone-style views. The extension must not assume that a full page reload occurs when the user changes tabs or HackerRank re-renders the test-case table.

### 3.2 Existing controls that the extension can reuse

The table has stable-looking semantic classes and data attributes:

| Purpose | Reference selector/attribute | Notes |
|---|---|---|
| Test-case page root | `.challenge-testcases` | Best insertion boundary for the toolbar. |
| Table rows | `.table-body > .row` | Each row also has `data-index` and `data-id`. |
| Row identity | `data-id` | Use this instead of array position when a row is re-rendered. |
| Displayed order | `.order`, `data-index` | The reference displays zero-based order (`0`, `1`, …). |
| Per-row score input | `.case-score-text[data-id]` | Existing text input; reference values include `0` and `10`. |
| Per-row selection | `input.testcase-selector[data-id]` | Existing checkbox; `data-score` mirrors the score at render time. |
| Save error | `.tick-save-error[data-id]` | Hidden error text is present per row. |
| Native add control | `.add-testcase` | Do not modify or intercept it. |
| Native upload control | `.upload-zip` | Do not modify or intercept it. |

The table header labels the score column **Strength** and explains that strength is used for score distribution (reference lines 996–1004). The extension uses the page's own **Strength** terminology.

### 3.3 Existing page behavior that must be preserved

The page includes existing controls for:

- Sample visibility.
- Additional/post-contest execution.
- Input and output downloads.
- Editing and deleting individual test cases.
- ZIP upload and adding a test case.

The extension must not change any of these controls, reorder rows, edit test-case content, or make decisions about Sample/Additional flags.

### 3.4 Backend clue, not an implementation contract

The public JavaScript asset referenced by the page defines an `Administration_TestCaseModel` whose model path is shaped like:

```text
/rest/administration/challenges/{challengeId}/test_cases/{testCaseId}
```

That confirms that HackerRank has a per-test-case model, but it does **not** confirm the update method, payload, CSRF handling, validation rules, rate limits, or whether that endpoint is stable for third-party automation. The first implementation should therefore drive the native DOM controls and let HackerRank perform its own save. Direct REST calls are a possible later optimization only after an authenticated network trace and explicit compatibility decision.

---

## 4. Goals and non-goals

### Goals for v1

- Work only on the HackerRank problem-setting Test Cases page.
- Make every test case selectable in one action.
- Make Select all/Clear all update both Select and Additional consistently.
- Select an inclusive range using the visible order numbers.
- Set a common score/strength for all selected rows with one user action.
- Keep the native page as the source of truth.
- Show enough progress and errors to prevent silent partial updates.
- Require no account, token, backend, or extension server.
- Request the smallest possible browser permissions.
- Be resilient to SPA-style re-rendering and duplicate initialization.

### Explicit non-goals for v1

- Creating, deleting, reordering, uploading, or downloading test cases.
- Editing inputs, outputs, tags, or Sample flags. Additional is changed only through an explicit bulk Additional action.
- Calling undocumented HackerRank APIs directly.
- Reading or storing test-case contents.
- Synchronizing data across users or devices.
- Supporting all HackerRank pages or arbitrary domains.
- Automatically distributing a total score unless that behavior is separately specified.

---

## 5. Minimal user experience

### 5.1 Toolbar placement

Insert one extension-owned toolbar immediately before the existing test-case table, inside `.challenge-testcases`. It should be visually compact and use a prefixed class namespace such as `hrx-bulk-*` so HackerRank CSS cannot accidentally style it.

Suggested layout:

```text
Test cases: 45    Selected: 0

[Select all] [Clear]
Range: [from] [to] [Select range]
Strength: [value] [Apply to selected]

Status: Ready
```

The controls should be native `<button>`, `<input type="number">`, and `<label>` elements. No popup or options page is needed for v1.

### 5.2 Range semantics

- Range values are **1-based and inclusive** because that is easier for users than the page's internal zero-based `data-index`.
- The toolbar should display the available range, for example `1–45`.
- `from > to`, blank values, non-integers, and out-of-bounds values should be rejected locally with an inline message.
- Selecting a range should add to the current selection; it must not silently clear earlier ranges.
- “Unselect range + Additional” should clear Select and turn Additional off only for the requested inclusive range.
- “Clear” should clear all selection using the same native checkbox interaction as the page.
- The single combined “Select Range” action should add the From/To range to selection and mark Additional for those same rows. “Unselect Range” should clear Select and turn Additional off for only that range.

### 5.3 Score semantics

- “Apply to selected” requires at least one selected test case.
- The score must be a finite, non-negative numeric value accepted by the page. The implementation should initially allow decimal values only if the native input accepts them during the authenticated spike; otherwise constrain the extension to the native integer format.
- The action should show a confirmation for destructive-looking bulk changes, for example: `Set score 10 on 44 selected test cases?` The confirmation can be an inline confirmation state rather than a browser `confirm()` dialog.
- “Score all” is achieved by `Select all` followed by `Apply to selected`; no duplicate one-off pathway is necessary.

### 5.4 Progress and partial failures

The user clicks once. The extension should prepare the selected inputs one at a time, then invoke HackerRank's native Save Changes button once; HackerRank has been observed batching the changed IDs into one PUT request. “All at once” means one user action, not direct requests from the extension.

During an update show:

```text
Updating 12/45…
```

Disable bulk controls while the operation is active. On completion show:

- `45 updated successfully`, or
- `42 updated; 3 failed. Review the highlighted rows.`

Never report success merely because the input value changed in the DOM. A row is successful only when the native save path has had time to complete and no row save error is visible.

---

## 6. Recommended technical architecture

### 6.1 File layout

```text
hackerrank-bulk-testcases/
├── manifest.json
├── content.js
├── content.css
├── references/
│   └── Reference-HTML-Page-Of-Hackerrank-problemsetting-page.txt
└── README.md
```

Keep the production extension to three runtime files. Do not add a background service worker unless a later requirement needs one.

### 6.2 Manifest V3 proposal

```json
{
  "manifest_version": 3,
  "name": "HackerRank Bulk Test Cases",
  "version": "0.1.0",
  "description": "Select and score HackerRank problem-setting test cases in bulk.",
  "content_scripts": [
    {
      "matches": [
        "https://www.hackerrank.com/administration/challenges/edit/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ]
}
```

Notes:

- Keep the match scope to `www.hackerrank.com` and the administration challenge-edit path.
- Runtime code must additionally check for `.challenge-testcases` and the expected Test Cases route/state before rendering.
- No `host_permissions`, `tabs`, `cookies`, `webRequest`, `scripting`, `storage`, or `activeTab` permission is needed for the static DOM-only MVP.
- Do not load scripts, CSS, fonts, or configuration from a remote server. This is consistent with Manifest V3's no remotely hosted code rule and makes the extension auditable.

### 6.3 DOM-first interaction model

Use the page's controls instead of private model objects:

1. Find all rows under the current `.challenge-testcases` table.
2. For each row, resolve its `data-id`, displayed order, checkbox, score input, and error element.
3. For selection, call the native checkbox's `.click()` only when its current state differs from the desired state. This preserves the page's own click handlers.
4. For scoring, locate the current input by `data-id`, focus it, set the value, dispatch the ordinary `input`/`change` lifecycle the page expects, and blur it so the page's existing save handler runs.
5. Wait for the page's save cycle, then inspect the row error element and any visible native error indicator.
6. Re-query the row after each save because a Backbone-style view may replace DOM nodes during a save.

Do not rely on changing only `checkbox.checked` or `input.value`; those changes can bypass the page's handlers and create a false appearance of success.

### 6.4 Page lifecycle and re-rendering

Implement a small idempotent installer:

- `findTestCaseRoot()` returns the current `.challenge-testcases` root.
- `collectRows(root)` returns a fresh row model from the current DOM.
- `ensureToolbar(root)` adds the toolbar once, marked with `data-hrx-bulk-toolbar="true"`.
- A `MutationObserver` watches the page content and schedules a debounced `ensureToolbar()` after a table or tab is rendered.
- When the challenge changes, discard stale row references and update the toolbar counts.
- If the root is removed during an in-flight operation, stop safely and tell the user that the page was re-rendered.

The observer must not continuously mutate the page or create duplicate toolbars.

### 6.5 Pure helper functions

Keep selection and validation logic separate from DOM and timing code. Suggested functions:

```text
parseRange(from, to, rowCount) -> {start, end} | validation error
getRows(root) -> TestCaseRow[]
selectRows(rows, start, end)
parseScore(rawValue) -> normalized score | validation error
setNativeCheckbox(checkbox, checked)
setNativeScore(input, score)
waitForNativeSave(row, timeoutMs)
```

This makes the most error-prone parts testable without a browser.

---

## 7. Save strategy and safety rules

### 7.1 Required implementation spike before bulk scoring

Before writing the bulk loop, use a real authorized test problem and the browser Network panel to observe one manual score edit:

1. Change one native `.case-score-text` value.
2. Blur the input or use the page's normal save gesture.
3. Identify the request method, URL, payload, response, and visible success/error behavior.
4. Repeat with an invalid value to understand native validation.
5. Reload and confirm the value persisted.

The extension should still prefer native DOM events, but this spike identifies the correct wait condition and prevents incorrect assumptions about blur/change behavior.

### 7.2 Serial updates by default

Prepare inputs one at a time and use one bounded wait for the native batch save. Do not use `Promise.all()` for DOM mutation in v1. Multiple independent requests could:

- trigger HackerRank rate limiting;
- overwrite page-side model state;
- make partial failures difficult to explain;
- lose updates if the page serializes saves internally.

The toolbar should communicate progress so the user understands why the operation takes time.

### 7.3 Failure behavior

For each row, capture:

```text
{ id, order, previousScore, requestedScore, status, error }
```

If one row fails:

- keep processing only if the page remains stable and the error is row-local;
- highlight the failed row with an extension-owned class;
- leave the native error visible;
- report a summary;
- never retry indefinitely.

On timeout, stop after a bounded number of milliseconds and report the row as unknown/failed rather than claiming success.

### 7.4 No direct authentication handling

The extension must not read cookies, CSRF tokens, passwords, local storage auth values, or page input/output contents. The user must already be logged in and authorized; the existing page handles authentication and CSRF.

---

## 8. Detailed implementation phases

### Phase 0 — Confirm the live contract

- Load a real authorized Test Cases page.
- Confirm that the current DOM still contains `.challenge-testcases`, `.table-body > .row`, `.case-score-text`, and `.testcase-selector`.
- Confirm whether order is zero-based and whether the table is paginated or virtualized.
- Confirm the native score-save event and success/error signal.
- Record the tested Chrome version and HackerRank UI release date in the development notes, not in runtime code.

**Exit criterion:** one manually edited score persists after reload, and the extension can identify the row-level error state.

### Phase 1 — Scaffold the unpacked MV3 extension

- Add `manifest.json`, `content.js`, and `content.css`.
- Add a route/root guard.
- Add an idempotent toolbar installer.
- Load it through `chrome://extensions` with Developer mode and “Load unpacked”.

**Exit criterion:** a toolbar appears only on the authorized Test Cases page and is absent from unrelated HackerRank pages.

### Phase 2 — Implement selection

- Add row discovery and count updates.
- Implement Select all, Clear, and inclusive range selection.
- Use `.click()` for native checkboxes.
- Handle empty tables, stale row IDs, re-rendering, and a range that exceeds the current loaded table.

**Exit criterion:** after reload, the extension never confuses the extension's visual count with the page's actual checkbox state.

### Phase 3 — Implement score application

- Add score validation.
- Add inline confirmation.
- Snapshot selected row IDs before starting.
- Update one row through the native input lifecycle.
- Re-query selected rows while preparing them, click the native Save Changes button once, and wait for the native batch result.
- Add progress, cancellation/stop behavior if practical, and partial-failure reporting.

**Exit criterion:** a bulk update survives reload and an intentionally invalid/failed update is reported without being presented as success.

### Phase 4 — Harden and package

- Keep the sanitized reference material under `references/`.
- Add a manual authenticated smoke-test checklist.
- Test light/dark page styles and narrow viewport layout.
- Test repeated tab changes and page re-renders.
- Review permissions and remove any unused manifest entries.
- Add a short README with installation, usage, limitations, and an update warning for HackerRank UI changes.

---

## 9. Test plan

### 9.1 Verification checklist

The extension intentionally has no test folder or runtime test dependency. Before release, verify:

- Range boundaries are inclusive and invalid ranges are rejected.
- Invalid scores are rejected.
- Select all/Clear all update Select and Additional consistently.
- Additive range selection preserves earlier ranges.
- Range unselection affects only the requested range.
- Re-running toolbar installation creates one toolbar, not duplicates.

### 9.2 Authenticated manual smoke tests

Run these against a throwaway or safe test challenge, never a production problem without a rollback plan:

1. Page with zero test cases.
2. Page with one test case.
3. Page with many test cases.
4. Select all, apply a score, reload, and verify every row.
5. Select a middle range, apply a score, reload, and verify only those rows changed.
6. Select a range that includes a Sample case and confirm Sample is unchanged.
7. Select a range that includes an Additional case and confirm Additional is unchanged.
8. Enter invalid range and score values.
9. Cause or simulate one native save failure.
10. Navigate away and back through the HackerRank tabs.
11. Test light/dark mode and a narrow viewport.
12. Confirm the extension is inactive on non-administration pages.

### 9.3 Acceptance criteria

The MVP is ready when all of the following are true:

- A user can select all test cases without manually clicking each checkbox.
- A user can select an inclusive range using visible 1-based order values.
- A user can apply one score to every selected row in one confirmed action.
- The persisted values match the requested values after a reload.
- Native sample/additional/tag/input/output controls are untouched.
- Partial failures are visible and not reported as success.
- No credentials, test-case content, or remote code are collected.
- The manifest contains only the minimum required scope.
- The extension remains usable after normal HackerRank DOM re-renders.

---

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HackerRank changes CSS classes | Toolbar or actions stop working | Centralize selectors, use semantic/data attributes, add a runtime “unsupported page” state, and maintain a fixture/smoke test. |
| Native save is debounced or asynchronous | Bulk updates race or appear successful too early | Perform the authenticated save spike; prepare inputs serially and wait for the bounded native batch result. |
| Page re-renders a row after save | Detached input references cause lost updates | Re-query by `data-id` after every save. |
| Direct REST endpoint changes | Data corruption or unauthorized requests | Do not use direct REST in v1. Keep the model path as research only. |
| Large test-case lists | Slow operation | Show progress; optimize only after measuring; never trade correctness for parallelism by default. |
| Selection and score state diverge | Wrong rows are scored | Read checkbox state immediately before the operation and identify rows by `data-id`, not stale indices. |
| User misreads “range” | Accidental score changes | Use 1-based inclusive labels, show selected count, and require confirmation. |
| Partial failure | Inconsistent problem scoring | Continue only under controlled conditions, highlight failures, and provide a summary with row numbers. |
| Host permission concern | Low user trust | Use a narrow static content-script match and no broad permissions, storage, cookies, or network access. |
| Terms/product policy concerns | Extension may be unsuitable for distribution | Restrict use to authorized problem setters, document that it automates the existing UI, and review HackerRank/Chrome policies before publishing. |

---

## 11. Future extensions, intentionally deferred

Only consider these after the MVP is reliable:

- A total-score distribution mode with an explicit formula (equal, proportional, or custom weights).
- Keyboard shortcuts, such as Shift-click range selection.
- A dry-run preview showing old and new scores before saving.
- A retry button for failed rows only.
- Support for HackerRank subdomains or a separately verified new UI.
- A verified batch API path if HackerRank provides a documented and stable endpoint.

The most important deferred item is total-score distribution. “Set every selected row to 10” and “make this range total 100” are different operations and must have different labels and confirmation text.

---

## 12. Research sources

- Workspace reference: `references/Reference-HTML-Page-Of-Hackerrank-problemsetting-page.txt`, especially lines 911–1005 for page structure and lines 1012 onward for row selectors, IDs, score inputs, and selection checkboxes.
- HackerRank target URL: <https://www.hackerrank.com/administration/challenges/edit/589358/testcases> (unauthenticated fetch returned the generic error/loading view; authenticated verification is still required).
- Chrome Extensions — Content scripts: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
  - Supports DOM reads/changes from content scripts.
  - Static content scripts can be scoped with match patterns.
  - Content scripts run in an isolated JavaScript world while sharing the page DOM.
- Chrome Extensions — Declare permissions: <https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions>
  - Permissions and host scope should be kept narrow.
  - Static content-script injection does not require broad host permissions for this DOM-only approach.
- Chrome Extensions — Manifest V3: <https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3>
  - MV3 is the current extension platform.
  - Remote hosted code is not appropriate; package all runtime code with the extension.

---

## 13. Recommended first implementation task

Do not begin with the bulk loop. First implement the **Phase 0 authenticated contract spike** and record:

1. The current selectors on a real logged-in page.
2. Whether the score field saves on `change`, blur, Enter, or another page action.
3. The exact success and failure signals.
4. Whether all rows are present in the DOM at once.

Those four facts are now verified. The remaining extension is a small DOM adapter plus a visible, testable bulk operation that delegates saving to the native page.

## 14. Preliminary Phase 0 findings from the live page

The initial browser checks on the authorized page have confirmed:

- The target URL is reachable: `/administration/challenges/edit/589358/testcases`.
- `.challenge-testcases` exists.
- `.table-body > .row` returns **88 rows**.
- Rows expose zero-based displayed order values (`0`, `1`, `2`, …).
- Rows expose unique-looking `data-id` values.
- `.case-score-text` and `input.testcase-selector` are present.
- No obvious Next/Previous/Load More controls were found by the initial button/link text scan.
- Calling `.click()` on a native testcase checkbox changes its current checked state.

These findings support the proposed DOM-first approach and suggest that the first MVP can operate on all 88 currently loaded rows without pagination handling.

The core Phase 0 contract is now confirmed:

1. The observed “Save Changes” persistence survives a full reload.
2. The exact request method, batched URL shape, and `200 OK` response have been observed.

The live-page observation that score/strength values remain after clicking “Save Changes” confirms that the current page uses a global save flow. The MVP should set the selected score inputs locally and click the existing native “Save Changes” button once, rather than simulating independent saves for every row. This is simpler and safer than a per-row request loop.

The global control has now been confirmed in the live DOM as a single button with class `save-challenge btn btn-green` and text `Save Changes`. The live screenshot also confirms that the Strength inputs are editable inline and that the Select column is independent from the Strength values.

The save contract has now been observed for one changed row and for a three-row change:

- Native control: `button.save-challenge`.
- Network method: `PUT`.
- URL shape for one row: `/rest/administration/challenges/{challengeId}/test_cases/{testCaseId}`.
- URL shape for multiple rows: `/rest/administration/challenges/{challengeId}/test_cases/{testCaseId1},{testCaseId2},{testCaseId3}`.
- Observed response for both cases: `200 OK`.
- The changed Strength value remained present after reload.
- `.tick-save-error` elements were present in the DOM but had `display: none`, so their static text is only a hidden template and not a failure signal.

This confirms that the UI has one global Save Changes action and HackerRank batches the changed test-case IDs into a single PUT request when multiple rows are changed. The extension should set selected values and click the native button once; it should not call the PUT endpoint directly or handle CSRF/authentication itself.

The text `Error: save failed!` appears in the row markup, but it is hidden by default in the reference structure. It must not be treated as an actual failure unless its computed visibility or class changes after a failed save.

Checkbox selection should be treated as temporary UI state. It is not expected to persist after a page reload; the extension only needs to select the rows immediately before applying scores.
