# HackerRank Bulk Test Cases

## Why I built this extension

When setting a HackerRank problem, assigning test-case scores and configuring
many test cases requires repetitive manual clicking. This extension was built
to make that workflow faster and less error-prone while keeping HackerRank's
native page and save behavior as the source of truth.

It is designed for authorized HackerRank problem setters and provides a small
toolbar on the Test Cases page for:

- Selecting all test cases and enabling Additional for all of them.
- Clearing all test-case selections and disabling Additional for all of them.
- Selecting or unselecting an inclusive range using From and To values.
- Updating the Strength value for the selected test cases in one operation.
- Reviewing the current state before the native HackerRank save is performed.

The extension does not call HackerRank's REST API directly. It operates on the
existing page controls and uses HackerRank's native **Save Changes** button.

## How to use the extension

### Install as an unpacked extension

1. Clone or download this repository.
2. Open Chrome/Chromium at `chrome://extensions`, or Brave at
   `brave://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the cloned repository folder.
6. If the browser asks for site access, allow the extension to read and change
   data on `www.hackerrank.com`.
7. Open an authorized HackerRank problem-setting Test Cases page and reload it.

The extension is scoped to HackerRank challenge-edit pages and activates only
when the Test Cases view is present. A gray/default extension icon is normal;
the working controls appear inside the HackerRank page.

### Use the toolbar

On the Test Cases page:

1. Use **Select all** to select every row and turn Additional on for every row.
2. Use **Clear all** to unselect every row and turn Additional off for every
   row.
3. Enter a **1-based, inclusive** range in **From** and **To**.
4. Click **Select Range** to add that range to the current selection and turn
   Additional on for the same rows.
5. Click **Unselect Range** to remove that range from Select and turn Additional
   off for the same rows.
6. Enter a non-negative value under **Strength**.
7. Click **Apply to selected** and confirm the operation.
8. Review the displayed Select and Additional states and the reminder message.
9. HackerRank's native **Save Changes** button is then used to persist the
   changes.

The range uses the visible order shown on the page. The captured HackerRank
markup uses zero-based `data-index` values internally, so the extension's
user-facing From/To inputs remain 1-based for clarity.

## Safety and privacy

- Use this extension only for HackerRank problems you are authorized to edit.
- The extension does not require an account, backend, API token, cookie, CSRF
  token, or extension storage.
- It does not read, upload, or log test-case input/output contents.
- It does not call HackerRank's observed REST endpoint directly.
- Saving is delegated to HackerRank's native **Save Changes** control.
- Review the selected rows, Additional states, and requested Strength before
  confirming a bulk change.

## Limitations

- HackerRank may change its DOM classes, save behavior, or page lifecycle.
- The current implementation expects the currently available test cases to be
  present in the page DOM; pagination and virtualization are not covered.
- The MVP applies one common Strength value to the selected rows.
- It does not create, delete, reorder, upload, or edit test-case contents.
- Native save success must be confirmed from the page; changing an input value
  alone is not proof that the server accepted the change.

## Troubleshooting

If the toolbar does not appear:

1. Confirm that the current URL is a HackerRank problem-setting Test Cases
   page.
2. Confirm that site access is enabled in the extension's Details page.
3. Reload the extension from the browser's extensions page.
4. Reload HackerRank with `Ctrl+Shift+R`.
5. If the browser reports an extension error, inspect the Errors section.

Do not share cookies, CSRF tokens, authorization headers, or private Network
request contents when reporting an issue.

## Project structure

```text
manifest.json       Extension metadata and page scope
content.js          Toolbar behavior and native DOM integration
content.css         Toolbar styling and responsive layout
references/         Sanitized HackerRank reference material
```
