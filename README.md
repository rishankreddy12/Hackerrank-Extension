# HackerRank Bulk Test Cases

This is a small Manifest V3 extension for authorized HackerRank problem
setters. It is intended to select test cases by visible order and apply one
score/strength value through HackerRank's existing page controls.

## Install as an unpacked Chrome extension

1. Open Chrome or Chromium and visit `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Choose this project folder:
   `C:\Users\rishankreddy\Desktop\ME\Hackerrank Extension`.
5. If the browser shows **Access requested** for this extension, click the
   **HackerRank Bulk Test Cases** entry and allow access on the current
   `www.hackerrank.com` site. Alternatively open the extension's **Details**
   page and set **Site access** to the HackerRank site.
6. Open an authorized HackerRank problem-setting Test Cases page and reload it
   after changing extension files.

The extension should only be active on the HackerRank challenge-edit route and
only when the page contains the Test Cases view. If Chrome reports a manifest
or content-script problem, reload the extension from `chrome://extensions`.
In Brave, use `brave://extensions` for the same controls. A gray/default
extension icon is not an error; the working controls appear inside the
HackerRank Test Cases page after site access is granted.

If the toolbar does not appear after granting access, open the extension's
Details page, click **Errors**, and inspect the error message. Do not share
cookies, CSRF tokens, authorization headers, or Network request contents when
reporting an error.

## Usage

On the Test Cases page:

- Use **Select all** to select every row and turn Additional on for every row.
  Use **Clear all** to unselect every row and turn Additional off for every
  row.
- Enter a **1-based, inclusive** `From` to `To` range using the displayed
  order. **Select Range** adds those rows to the current
  selection and marks Additional for the same rows.
- **Unselect Range** removes those rows from Select and turns
  Additional off for the same range. Separate ranges can still be combined
  safely because both actions use only the entered From/To range.
- Enter a non-negative score/strength and apply it to the selected rows.
- Review the boxed reminder and the displayed Select/Additional states before
  final saving so test-case evaluation behavior is correct.
- Review the selected rows and confirmation/progress status. After confirmation,
  the extension updates the selected controls and clicks HackerRank's native
  **Save Changes** button once.

The range is based on the user's visible order, while the captured HackerRank
markup uses zero-based `data-index` values internally. The extension must not
alter inputs, outputs, tags, or test-case ordering. Additional flags change only
when the user explicitly chooses one of its bulk controls.

## Safety and privacy

- Use this only for HackerRank problems you are authorized to edit.
- The intended implementation operates on the existing page DOM and native
  controls. It does not need an account, backend, API token, cookie, CSRF
  token, or extension storage.
- Saving should be performed by HackerRank's native **Save Changes** control;
  the extension must not call the observed REST endpoint directly.
- No test-case input/output contents should be collected, uploaded, or logged.
- Review the selected rows and requested score before saving bulk changes.

## Limitations

- HackerRank can change its DOM classes, save behavior, or page lifecycle at
  any time. The selectors are based on the supplied reference HTML and need a
  fresh authenticated smoke test after such changes.
- The Phase 0 reference showed all currently loaded rows in the DOM; pagination
  or virtualization is not covered by this verification fixture.
- The MVP sets one common score and can explicitly turn Additional on or off
  for an entered range. It does not distribute a total score,
  create/delete/reorder/upload test cases, or edit test-case content.
- Native save success must be confirmed from the page; a changed input value
  alone is not proof that a save succeeded.
- The browser runtime runs as a normal isolated content script with no runtime
  dependency or test bundle.

## Phase 0 findings

The supplied reference HTML and implementation plan identify these relevant
selectors:

- `.challenge-testcases` is the Test Cases root.
- `.table-body > .row` contains each row.
- `.order` displays the zero-based order, and `data-index` mirrors it.
- `.case-score-text[data-id]` is the Strength input.
- `input.testcase-selector[data-id]` is the native selection checkbox.
- `.additional .toggle-flag[data-toggle="additional"][data-id]` is the native Additional toggle.
- `.tick-save-error[data-id]` is a hidden row error element.
- `button.save-challenge` is the global native **Save Changes** control.

The recorded live-page checks found 88 currently loaded rows, native checkbox
clicks changing their checked state, and a global save that batches changed
test-case IDs in one `PUT` request. The observed response was `200 OK` and a
changed Strength value remained after reload. The hidden error text is only a
template until the page makes it visible or otherwise marks a row as failed.
The extension should use these findings as a DOM contract, not as permission
to make direct authenticated requests.
