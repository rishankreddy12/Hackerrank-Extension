(function (root) {
  'use strict';

  var ROOT_SELECTOR = '.challenge-testcases';
  var ROW_SELECTOR = '.table-body > .row';
  var TOOLBAR_SELECTOR = '[data-hrx-bulk-toolbar="true"]';
  var SAVE_TIMEOUT = 10000;
  var timer = null;
  var observer = null;
  var instance = null;

  function doc() { return root && root.document ? root.document : null; }

  function isSupportedPage(locationLike) {
    var path = locationLike && typeof locationLike.pathname === 'string' ? locationLike.pathname : '';
    return /^\/administration\/challenges\/edit(?:\/|$)/.test(path);
  }

  function findTestCaseRoot(documentLike) {
    var documentObject = documentLike || doc();
    return documentObject ? documentObject.querySelector(ROOT_SELECTOR) : null;
  }

  function text(element) { return element && element.textContent ? element.textContent.trim() : ''; }

  function controlIn(row, selector, id) {
    var controls = row ? row.querySelectorAll(selector) : [];
    for (var i = 0; i < controls.length; i += 1) {
      if (!id || controls[i].getAttribute('data-id') === id) return controls[i];
    }
    return controls[0] || null;
  }

  /* Rows are always reconstructed from the current DOM; callers must not retain them across renders. */
  function getRows(rootElement) {
    if (!rootElement || !rootElement.querySelectorAll) return [];
    var nodes = rootElement.querySelectorAll(ROW_SELECTOR);
    if (!nodes.length) nodes = rootElement.querySelectorAll('.row');
    var rows = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var checkbox = node.querySelector('input.testcase-selector');
      var scoreInput = node.querySelector('input.case-score-text');
      var additionalToggle = node.querySelector('.additional .toggle-flag[data-toggle="additional"]');
      var id = node.getAttribute('data-id') ||
        (checkbox && checkbox.getAttribute('data-id')) ||
        (scoreInput && scoreInput.getAttribute('data-id')) ||
        (additionalToggle && additionalToggle.getAttribute('data-id'));
      if (!id || (!checkbox && !scoreInput && !additionalToggle)) continue;
      var orderNode = node.querySelector('.order');
      var rawOrder = node.getAttribute('data-index') || text(orderNode);
      var order = Number(rawOrder);
      rows.push({
        id: id,
        node: node,
        checkbox: controlIn(node, 'input.testcase-selector', id),
        scoreInput: controlIn(node, 'input.case-score-text', id),
        additionalToggle: controlIn(node, '.additional .toggle-flag[data-toggle="additional"]', id),
        errorElement: controlIn(node, '.tick-save-error', id),
        order: Number.isFinite(order) ? order : null,
        position: rows.length + 1
      });
    }
    return rows;
  }

  // User-facing range values are 1-based and inclusive.
  function parseRange(from, to, rowCount) {
    var startText = from === null || from === undefined ? '' : String(from).trim();
    var endText = to === null || to === undefined ? '' : String(to).trim();
    var count = Number(rowCount);
    if (!startText || !endText) throw new RangeError('Enter both ends of the range.');
    if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText)) {
      throw new RangeError('Range values must be whole numbers.');
    }
    var start = Number(startText);
    var end = Number(endText);
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('The test-case count is unavailable.');
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1) {
      throw new RangeError('Range values must be at least 1.');
    }
    if (start > end) throw new RangeError('The range start cannot be greater than the end.');
    if (start > count || end > count) throw new RangeError('The range must be within the available test cases.');
    return { start: start, end: end };
  }

  function parseScore(rawValue) {
    var valueText = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
    if (!valueText) throw new RangeError('Enter a score/strength value.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(valueText)) {
      throw new RangeError('Score/strength must be a non-negative number.');
    }
    var value = Number(valueText);
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Score/strength must be a finite, non-negative number.');
    }
    return value;
  }

  function setNativeCheckbox(checkbox, checked) {
    if (!checkbox) return false;
    var desired = Boolean(checked);
    if (Boolean(checkbox.checked) !== desired && typeof checkbox.click === 'function') checkbox.click();
    return Boolean(checkbox.checked) === desired;
  }

  function emit(input, name) {
    if (!input || typeof input.dispatchEvent !== 'function') return;
    var documentObject = input.ownerDocument;
    var view = documentObject && documentObject.defaultView;
    var EventObject = (view && view.Event) || (typeof root.Event === 'function' ? root.Event : null);
    if (EventObject) {
      input.dispatchEvent(new EventObject(name, { bubbles: true }));
    } else if (documentObject && documentObject.createEvent) {
      var event = documentObject.createEvent('Event');
      event.initEvent(name, true, false);
      input.dispatchEvent(event);
    }
  }

  function setNativeScore(input, score) {
    if (!input) return false;
    var value = score && typeof score === 'object' && score.text !== undefined ? score.text : String(score);
    if (typeof input.focus === 'function') input.focus();
    input.value = value;
    emit(input, 'input');
    emit(input, 'change');
    if (typeof input.blur === 'function') input.blur();
    return input.value === value;
  }

  function selectRows(rows, start, end) {
    var first = start && typeof start === 'object' ? start.start : start;
    var last = start && typeof start === 'object' ? start.end : end;
    var selected = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var shouldSelect = Number.isInteger(first) && Number.isInteger(last) &&
        first >= 1 && last >= first && i + 1 >= first && i + 1 <= last;
      if (setNativeCheckbox(rows[i].checkbox, shouldSelect) && shouldSelect) selected += 1;
    }
    return selected;
  }

  // Range selection is additive so selecting a second range never clears an
  // earlier selection. The explicit unselect operation uses the same native
  // checkbox click contract and only changes rows inside its range.
  function selectRangeRows(rows, start, end) {
    var first = start && typeof start === 'object' ? start.start : start;
    var last = start && typeof start === 'object' ? start.end : end;
    var selected = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (Number.isInteger(first) && Number.isInteger(last) && i + 1 >= first && i + 1 <= last &&
          setNativeCheckbox(rows[i].checkbox, true)) selected += 1;
    }
    return selected;
  }

  function unselectRangeRows(rows, start, end) {
    var first = start && typeof start === 'object' ? start.start : start;
    var last = start && typeof start === 'object' ? start.end : end;
    var unselected = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (Number.isInteger(first) && Number.isInteger(last) && i + 1 >= first && i + 1 <= last &&
          setNativeCheckbox(rows[i].checkbox, false)) unselected += 1;
    }
    return unselected;
  }

  function additionalState(toggle) {
    if (!toggle) return null;
    // HackerRank's native toggle updates these icon classes as part of its
    // click handler. Prefer them after a click, then use data-val as the
    // server-rendered fallback when the classes are not present.
    var classes = toggle.classList;
    if (classes) {
      if (classes.contains('icon-checkbox-empty')) return false;
      if (classes.contains('active') || classes.contains('icon-ok')) return true;
    }
    var dataValue = toggle.getAttribute && toggle.getAttribute('data-val');
    if (dataValue !== null && dataValue !== undefined) {
      var normalized = String(dataValue).trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return null;
  }

  function setNativeAdditional(toggle, enabled) {
    if (!toggle) return false;
    var desired = Boolean(enabled);
    var currentState = additionalState(toggle);
    if (currentState === desired) return true;
    // An unknown state cannot be changed safely: clicking it could move the
    // page to either state and would violate the bulk action's promise.
    if (currentState === null || typeof toggle.click !== 'function') return false;
    toggle.click();
    return additionalState(toggle) === desired;
  }

  function visible(element) {
    if (!element || element.hidden || element.getAttribute('hidden') !== null) return false;
    var style = element.style || {};
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    var view = element.ownerDocument && element.ownerDocument.defaultView;
    if (view && view.getComputedStyle) {
      var computed = view.getComputedStyle(element);
      if (computed.display === 'none' || computed.visibility === 'hidden') return false;
    }
    return true;
  }

  function activeMessage(element) {
    return visible(element) && Boolean(text(element));
  }

  function nativeSaveState(rootElement, ids) {
    var documentObject = rootElement && rootElement.ownerDocument || doc();
    var globalError = documentObject && documentObject.querySelector('.save-challenge.save-error, .save-error');
    var globalSuccess = documentObject && documentObject.querySelector('.save-challenge.save-success, .save-success');
    var rows = getRows(rootElement);
    var errors = rows.filter(function (row) {
      return (!ids || ids.indexOf(row.id) !== -1) && visible(row.errorElement);
    });
    var signature = [activeMessage(globalError) ? text(globalError) : '', activeMessage(globalSuccess) ? text(globalSuccess) : '',
      errors.map(function (row) { return row.id; }).join(',')].join('|');
    if (activeMessage(globalError) || errors.length) return { status: 'error', errorRows: errors, signature: signature };
    if (activeMessage(globalSuccess)) return { status: 'success', errorRows: [], signature: signature };
    return { status: 'pending', errorRows: [], signature: signature };
  }

  function waitForNativeSave(rootElement, ids, timeoutMs, pollMs, baselineState) {
    var timeout = Number.isFinite(timeoutMs) ? timeoutMs : SAVE_TIMEOUT;
    var interval = Number.isFinite(pollMs) ? pollMs : 100;
    var started = Date.now();
    return new Promise(function (resolve) {
      var initial = baselineState || nativeSaveState(rootElement, ids);
      function poll() {
        if (!rootElement || rootElement.isConnected === false) return resolve({ status: 'stale' });
        var state = nativeSaveState(rootElement, ids);
        // A stale success/error banner from an earlier save cannot confirm this save.
        if (state.status !== 'pending' &&
            (initial.status === 'pending' || state.signature !== initial.signature)) return resolve(state);
        if (Date.now() - started >= timeout) return resolve({ status: 'timeout' });
        root.setTimeout(poll, interval);
      }
      poll();
    });
  }

  function element(documentObject, name, className, value) {
    var result = documentObject.createElement(name);
    result.className = className;
    if (value !== undefined) result.textContent = value;
    return result;
  }

  function applyToolbarTheme(toolbar) {
    if (!toolbar || !toolbar.ownerDocument) return;
    var documentObject = toolbar.ownerDocument;
    var html = documentObject.documentElement;
    var body = documentObject.body;
    var darkReader = html && html.getAttribute('data-darkreader-mode');
    var background = body && body.ownerDocument.defaultView && body.ownerDocument.defaultView.getComputedStyle(body).backgroundColor;
    var channels = background && background.match(/rgba?\(([^)]+)\)/i);
    var darkBackground = Boolean(darkReader);
    if (channels) {
      var values = channels[1].split(',').map(function (value) { return Number.parseFloat(value.trim()); });
      if (values.length >= 3 && values.every(function (value) { return Number.isFinite(value); })) {
        var luminance = (0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]) / 255;
        darkBackground = luminance < 0.5;
      }
    }
    toolbar.classList.toggle('hrx-bulk-dark', darkBackground);
    toolbar.classList.toggle('hrx-bulk-light', !darkBackground);
  }

  function makeToolbar(rootElement) {
    var documentObject = rootElement.ownerDocument;
    var toolbar = element(documentObject, 'div', 'hrx-bulk-toolbar');
    toolbar.setAttribute('data-hrx-bulk-toolbar', 'true');
    toolbar.setAttribute('role', 'region');
    toolbar.setAttribute('aria-label', 'Bulk test-case controls');

    var heading = element(documentObject, 'div', 'hrx-bulk-heading');
    var total = element(documentObject, 'span', 'hrx-bulk-count', 'Test cases: 0');
    var selected = element(documentObject, 'span', 'hrx-bulk-count', 'Selected: 0');
    total.setAttribute('data-hrx-bulk-total', 'true');
    selected.setAttribute('data-hrx-bulk-selected', 'true');
    heading.appendChild(total); heading.appendChild(selected); toolbar.appendChild(heading);

    var actions = element(documentObject, 'div', 'hrx-bulk-actions');
    var selectAll = element(documentObject, 'button', 'hrx-bulk-select-all', 'Select all');
    var clear = element(documentObject, 'button', 'hrx-bulk-clear', 'Clear all');
    selectAll.type = 'button'; clear.type = 'button';
    actions.appendChild(selectAll); actions.appendChild(clear); toolbar.appendChild(actions);

    var range = element(documentObject, 'div', 'hrx-bulk-range');
    range.appendChild(element(documentObject, 'span', 'hrx-bulk-range-label', 'Range:'));
    var fromLabel = element(documentObject, 'label', '', 'From');
    var from = element(documentObject, 'input', 'hrx-bulk-from');
    var toLabel = element(documentObject, 'label', '', 'To');
    var to = element(documentObject, 'input', 'hrx-bulk-to');
    var rangeButton = element(documentObject, 'button', 'hrx-bulk-range-button', 'Select Range');
    var unselectRangeButton = element(documentObject, 'button', 'hrx-bulk-unselect-range-button', 'Unselect Range');
    from.type = 'number'; from.min = '1'; from.step = '1'; from.id = 'hrx-bulk-from';
    to.type = 'number'; to.min = '1'; to.step = '1'; to.id = 'hrx-bulk-to';
    from.setAttribute('aria-label', 'Range start, 1-based'); to.setAttribute('aria-label', 'Range end, 1-based');
    fromLabel.htmlFor = from.id; toLabel.htmlFor = to.id;
    rangeButton.type = 'button'; unselectRangeButton.type = 'button';
    var available = element(documentObject, 'span', 'hrx-bulk-available', '(1–0)');
    range.appendChild(fromLabel); range.appendChild(from); range.appendChild(toLabel); range.appendChild(to);
    range.appendChild(rangeButton); range.appendChild(unselectRangeButton); range.appendChild(available); toolbar.appendChild(range);

    var score = element(documentObject, 'div', 'hrx-bulk-score');
    var scoreLabel = element(documentObject, 'label', '', 'Strength');
    var scoreInput = element(documentObject, 'input', 'hrx-bulk-score-input');
    var apply = element(documentObject, 'button', 'hrx-bulk-apply', 'Apply to selected');
    scoreInput.type = 'number'; scoreInput.min = '0'; scoreInput.step = 'any'; scoreInput.id = 'hrx-bulk-score';
    scoreInput.setAttribute('aria-label', 'Score or strength'); scoreLabel.htmlFor = scoreInput.id; apply.type = 'button';
    score.appendChild(scoreLabel); score.appendChild(scoreInput); score.appendChild(apply); toolbar.appendChild(score);

    var status = element(documentObject, 'div', 'hrx-bulk-status', 'Ready');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('data-state', 'ready');
    var reminder = element(documentObject, 'div', 'hrx-bulk-reminder', 'Review Select and Additional states before the final save to ensure test-case evaluations are correct.');
    reminder.setAttribute('role', 'note');
    var footer = element(documentObject, 'div', 'hrx-bulk-footer');
    footer.appendChild(status); footer.appendChild(reminder); toolbar.appendChild(footer);
    return { toolbar: toolbar, total: total, selected: selected, selectAll: selectAll, clear: clear,
      from: from, to: to, rangeButton: rangeButton, unselectRangeButton: unselectRangeButton,
      available: available, scoreInput: scoreInput, apply: apply, status: status };
  }

  function status(state, message, stateName) {
    if (!state || !state.controls || !state.controls.status) return;
    state.controls.status.textContent = message;
    state.controls.status.setAttribute('data-state', stateName || 'ready');
  }

  function refresh(state) {
    if (!state || !state.root) return;
    var rows = getRows(state.root);
    var selectedCount = rows.filter(function (row) { return row.checkbox && row.checkbox.checked; }).length;
    state.controls.total.textContent = 'Test cases: ' + rows.length;
    state.controls.selected.textContent = 'Selected: ' + selectedCount;
    state.controls.available.textContent = '(1–' + rows.length + ')';
    var disabled = state.busy || rows.length === 0;
    state.controls.selectAll.disabled = disabled; state.controls.clear.disabled = disabled;
    state.controls.rangeButton.disabled = disabled; state.controls.unselectRangeButton.disabled = disabled;
    state.controls.apply.disabled = disabled;
    if (!state.busy && rows.length === 0 && state.controls.status.textContent === 'Ready') {
      status(state, 'No test cases found.', 'ready');
    }
  }

  function busy(state, value) {
    state.busy = value;
    [state.controls.selectAll, state.controls.clear, state.controls.from, state.controls.to,
      state.controls.rangeButton, state.controls.unselectRangeButton, state.controls.scoreInput,
      state.controls.apply].forEach(function (control) {
      control.disabled = value;
    });
    if (!value) refresh(state);
  }

  function current(rootElement) {
    var documentObject = rootElement && rootElement.ownerDocument;
    return Boolean(rootElement && rootElement.isConnected !== false &&
      findTestCaseRoot(documentObject) === rootElement &&
      isSupportedPage((documentObject && documentObject.location) || root.location));
  }

  function markFailures(rootElement, ids) {
    var errors = nativeSaveState(rootElement, ids).errorRows || [];
    errors.forEach(function (row) { row.node.classList.add('hrx-bulk-failed-row'); });
    return errors.length;
  }

  function applyScore(state) {
    if (!state || state.busy || !current(state.root)) return;
    var score;
    var scoreText = String(state.controls.scoreInput.value).trim();
    try {
      score = parseScore(scoreText);
    } catch (error) {
      return status(state, error.message, 'error');
    }
    var selectedRows = getRows(state.root).filter(function (row) { return row.checkbox && row.checkbox.checked && row.id; });
    if (!selectedRows.length) return status(state, 'Select at least one test case first.', 'error');
    var documentObject = state.root.ownerDocument;
    var saveButton = documentObject.querySelector('button.save-challenge');
    if (!saveButton || typeof saveButton.click !== 'function') {
      return status(state, 'The native Save Changes button is unavailable.', 'error');
    }
    var question = 'Set score/strength ' + scoreText + ' on ' + selectedRows.length +
      ' selected test case' + (selectedRows.length === 1 ? '' : 's') + '?';
    if (typeof root.confirm === 'function' && !root.confirm(question)) {
      return status(state, 'Bulk update cancelled.', 'ready');
    }
    var ids = selectedRows.map(function (row) { return row.id; });
    busy(state, true); status(state, 'Preparing 0/' + ids.length + '…', 'ready');
    var prepared = 0;
    function finish(message, kind) {
      status(state, message, kind);
      if (instance === state && current(state.root)) busy(state, false);
      else state.busy = false;
    }
    function prepareNext(index) {
      if (index >= ids.length) {
        if (!current(state.root)) return finish('Page changed before saving; no save was sent.', 'error');
        status(state, 'Saving ' + ids.length + ' test case' + (ids.length === 1 ? '' : 's') + '…', 'ready');
        var baseline = nativeSaveState(state.root, ids);
        saveButton.click();
        waitForNativeSave(state.root, ids, SAVE_TIMEOUT, 100, baseline).then(function (result) {
          if (result.status === 'success') return finish(ids.length + ' updated successfully.', 'success');
          if (result.status === 'error') {
            var failed = markFailures(state.root, ids);
            return finish((ids.length - failed) + ' updated; ' + failed + ' failed. Review the highlighted rows.', 'error');
          }
          if (result.status === 'stale') return finish('Page changed while waiting for the native save.', 'error');
          markFailures(state.root, ids);
          finish('Save status could not be confirmed. Review the native page.', 'error');
        });
        return;
      }
      if (!current(state.root)) return finish('Page changed while updating; no save was sent.', 'error');
      var fresh = getRows(state.root).find(function (row) { return row.id === ids[index]; });
      if (!fresh || !fresh.scoreInput) return finish('Page changed; a selected test case is unavailable.', 'error');
      fresh.node.classList.remove('hrx-bulk-failed-row');
      setNativeScore(fresh.scoreInput, scoreText);
      prepared += 1; status(state, 'Preparing ' + prepared + '/' + ids.length + '…', 'ready');
      root.setTimeout(function () { prepareNext(index + 1); }, 0);
    }
    prepareNext(0);
  }

  function applyAdditional(state, desired, targetRows, actionText) {
    if (!state || state.busy || !current(state.root)) return;
    var selectedRows = (targetRows || getRows(state.root).filter(function (row) {
      return row.checkbox && row.checkbox.checked && row.id;
    })).filter(function (row) { return row && row.id; });
    if (!selectedRows.length) return status(state, 'Select at least one test case first.', 'error');
    var documentObject = state.root.ownerDocument;
    var saveButton = documentObject.querySelector('button.save-challenge');
    if (!saveButton || typeof saveButton.click !== 'function') {
      return status(state, 'The native Save Changes button is unavailable.', 'error');
    }
    var action = actionText || (desired ? 'turn Additional on' : 'turn Additional off');
    var question = action + ' for ' + selectedRows.length +
      ' test case' + (selectedRows.length === 1 ? '' : 's') + '?';
    if (typeof root.confirm === 'function' && !root.confirm(question)) {
      return status(state, 'Bulk Select/Additional update cancelled.', 'ready');
    }
    var ids = selectedRows.map(function (row) { return row.id; });
    busy(state, true); status(state, 'Preparing 0/' + ids.length + '…', 'ready');
    var prepared = 0;
    function finish(message, kind) {
      status(state, message, kind);
      if (instance === state && current(state.root)) busy(state, false);
      else state.busy = false;
    }
    function prepareNext(index) {
      if (index >= ids.length) {
        if (!current(state.root)) return finish('Page changed before saving; no save was sent.', 'error');
        status(state, 'Saving ' + ids.length + ' test case' + (ids.length === 1 ? '' : 's') + '…', 'ready');
        var baseline = nativeSaveState(state.root, ids);
        var nativeSaveButton = state.root.ownerDocument.querySelector('button.save-challenge');
        if (!nativeSaveButton || typeof nativeSaveButton.click !== 'function') {
          return finish('The native Save Changes button became unavailable; no save was sent.', 'error');
        }
        nativeSaveButton.click();
        waitForNativeSave(state.root, ids, SAVE_TIMEOUT, 100, baseline).then(function (result) {
          if (result.status === 'success') return finish(action + ' applied to ' + ids.length + '.', 'success');
          if (result.status === 'error') {
            var failed = markFailures(state.root, ids);
            return finish((ids.length - failed) + ' updated; ' + failed + ' failed. Review the highlighted rows.', 'error');
          }
          if (result.status === 'stale') return finish('Page changed while waiting for the native save.', 'error');
          markFailures(state.root, ids);
          finish('Save status could not be confirmed. Review the native page.', 'error');
        });
        return;
      }
      if (!current(state.root)) return finish('Page changed while updating; no save was sent.', 'error');
      var fresh = getRows(state.root).find(function (row) { return row.id === ids[index]; });
      if (!fresh || !fresh.additionalToggle) {
        return finish('Page changed; a selected test case Additional control is unavailable.', 'error');
      }
      fresh.node.classList.remove('hrx-bulk-failed-row');
      if (!setNativeAdditional(fresh.additionalToggle, desired)) {
        return finish('Could not determine the Additional state for a selected test case; no save was sent.', 'error');
      }
      prepared += 1; status(state, 'Preparing ' + prepared + '/' + ids.length + '…', 'ready');
      root.setTimeout(function () { prepareNext(index + 1); }, 0);
    }
    prepareNext(0);
  }

  function bind(state) {
    var c = state.controls;
    c.selectAll.addEventListener('click', function () {
      var rows = getRows(state.root);
      selectRows(rows, 1, rows.length);
      refresh(state);
      if (rows.length) applyAdditional(state, true, rows, 'select all and turn Additional on');
      else status(state, 'No test cases found.', 'ready');
    });
    c.clear.addEventListener('click', function () {
      var rows = getRows(state.root);
      selectRows(rows, 0, 0);
      refresh(state);
      if (rows.length) applyAdditional(state, false, rows, 'clear all and turn Additional off');
      else status(state, 'No test cases found.', 'ready');
    });
    function readRange() {
      var rows = getRows(state.root); var range;
      try {
        range = parseRange(c.from.value, c.to.value, rows.length);
      } catch (error) {
        status(state, error.message, 'error');
        return null;
      }
      return { rows: rows, range: range };
    }
    c.rangeButton.addEventListener('click', function () {
      var parsed = readRange();
      if (!parsed) return;
      selectRangeRows(parsed.rows, parsed.range.start, parsed.range.end);
      var rangeRows = parsed.rows.filter(function (_, index) {
        return index + 1 >= parsed.range.start && index + 1 <= parsed.range.end;
      });
      refresh(state);
      applyAdditional(state, true, rangeRows, 'select range and turn Additional on');
    });
    c.unselectRangeButton.addEventListener('click', function () {
      var parsed = readRange();
      if (!parsed) return;
      unselectRangeRows(parsed.rows, parsed.range.start, parsed.range.end);
      var rangeRows = parsed.rows.filter(function (_, index) {
        return index + 1 >= parsed.range.start && index + 1 <= parsed.range.end;
      });
      refresh(state);
      applyAdditional(state, false, rangeRows, 'unselect range and turn Additional off');
    });
    c.apply.addEventListener('click', function () { applyScore(state); });
  }

  function normalizeToolbarText(toolbar) {
    if (!toolbar) return;
    var rangeLabels = toolbar.querySelectorAll('.hrx-bulk-range label');
    if (rangeLabels.length > 1) {
      rangeLabels[0].textContent = 'From';
      rangeLabels[1].textContent = 'To';
    }
    var selectRange = toolbar.querySelector('.hrx-bulk-range-button');
    var unselectRange = toolbar.querySelector('.hrx-bulk-unselect-range-button');
    var selectAll = toolbar.querySelector('.hrx-bulk-select-all');
    var clearAll = toolbar.querySelector('.hrx-bulk-clear');
    var strengthLabel = toolbar.querySelector('.hrx-bulk-score label');
    if (selectRange) selectRange.textContent = 'Select Range';
    if (unselectRange) unselectRange.textContent = 'Unselect Range';
    if (selectAll) selectAll.textContent = 'Select all';
    if (clearAll) clearAll.textContent = 'Clear all';
    if (strengthLabel) strengthLabel.textContent = 'Strength';
  }

  function ensureToolbar() {
    var documentObject = doc();
    if (!documentObject || !documentObject.body || !isSupportedPage(root.location)) return null;
    var rootElement = findTestCaseRoot(documentObject);
    if (!rootElement) { instance = null; return null; }
    var toolbar = rootElement.querySelector(TOOLBAR_SELECTOR);
    // A toolbar left by an older extension version is not a usable instance;
    // replace it once so all controls and listeners share the current contract.
    if (toolbar && (!toolbar.querySelector('.hrx-bulk-unselect-range-button') ||
        toolbar.querySelector('.hrx-bulk-additional') || !toolbar.querySelector('.hrx-bulk-footer'))) {
      if (toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
      toolbar = null;
    }
    if (!toolbar) {
      var controls = makeToolbar(rootElement);
      toolbar = controls.toolbar;
      // `.table-body` is nested inside `.table-wrap`/`.row`, so it is not a
      // direct child of the root. Insert before a real direct child instead of
      // passing the nested table node to `rootElement.insertBefore`.
      rootElement.insertBefore(toolbar, rootElement.firstChild);
      applyToolbarTheme(toolbar);
      instance = { root: rootElement, controls: controls, busy: false };
      bind(instance);
    } else if (!instance || instance.root !== rootElement || instance.controls.toolbar !== toolbar) {
      var rebuilt = { toolbar: toolbar, total: toolbar.querySelector('[data-hrx-bulk-total]'),
        selected: toolbar.querySelector('[data-hrx-bulk-selected]'), selectAll: toolbar.querySelector('.hrx-bulk-select-all'),
        clear: toolbar.querySelector('.hrx-bulk-clear'), from: toolbar.querySelector('.hrx-bulk-from'), to: toolbar.querySelector('.hrx-bulk-to'),
        rangeButton: toolbar.querySelector('.hrx-bulk-range-button'),
        unselectRangeButton: toolbar.querySelector('.hrx-bulk-unselect-range-button'),
        available: toolbar.querySelector('.hrx-bulk-available'),
         scoreInput: toolbar.querySelector('.hrx-bulk-score-input'), apply: toolbar.querySelector('.hrx-bulk-apply'), status: toolbar.querySelector('.hrx-bulk-status') };
      instance = { root: rootElement, controls: rebuilt, busy: false }; bind(instance);
    }
    normalizeToolbarText(toolbar);
    applyToolbarTheme(toolbar);
    refresh(instance); return instance;
  }

  function schedule() {
    if (timer !== null) root.clearTimeout(timer);
    timer = root.setTimeout(function () { timer = null; ensureToolbar(); }, 120);
  }

  function start() {
    var documentObject = doc();
    if (!documentObject || !documentObject.body || !isSupportedPage(root.location)) return;
    if (typeof root.MutationObserver === 'function') {
      observer = new root.MutationObserver(function (records) {
        if (records.some(function (record) {
          return !(record.target && record.target.closest && record.target.closest(TOOLBAR_SELECTOR));
        })) schedule();
      });
      observer.observe(documentObject.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'checked'] });
    }
    documentObject.addEventListener('change', function (event) {
      if (event.target && event.target.matches && event.target.matches('input.testcase-selector')) schedule();
    }, true);
    ensureToolbar();
  }

  var exported = { findTestCaseRoot: findTestCaseRoot, isSupportedPage: isSupportedPage,
    getRows: getRows, collectRows: getRows, parseRange: parseRange, parseScore: parseScore,
    setNativeCheckbox: setNativeCheckbox, setNativeScore: setNativeScore, selectRows: selectRows,
    selectRangeRows: selectRangeRows, unselectRangeRows: unselectRangeRows,
    additionalState: additionalState, setNativeAdditional: setNativeAdditional,
    waitForNativeSave: waitForNativeSave };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (doc() && typeof root.addEventListener === 'function') {
    if (doc().readyState === 'loading') root.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
