const test = require('node:test');
const assert = require('node:assert/strict');

// The browser runtime also exposes this small CommonJS-safe helper contract so
// the validation and selection behavior can be tested without a DOM library.
const {
  parseRange,
  parseScore,
  selectRows,
  selectRangeRows,
  unselectRangeRows,
  additionalState,
  setNativeAdditional
} = require('../content.js');

function assertRejected(callback) {
  assert.throws(callback);
}

test('exports the pure helper contract', () => {
  assert.equal(typeof parseRange, 'function');
  assert.equal(typeof parseScore, 'function');
  assert.equal(typeof selectRows, 'function');
  assert.equal(typeof selectRangeRows, 'function');
  assert.equal(typeof unselectRangeRows, 'function');
  assert.equal(typeof additionalState, 'function');
  assert.equal(typeof setNativeAdditional, 'function');
});

test('parseRange uses one-based inclusive bounds', () => {
  assert.deepEqual(parseRange(1, 3, 10), { start: 1, end: 3 });
  assert.deepEqual(parseRange('1', '1', 10), { start: 1, end: 1 });
  assert.deepEqual(parseRange('10', '10', 10), { start: 10, end: 10 });
});

test('parseRange rejects blank, non-integer, reversed, and out-of-bounds input', () => {
  for (const values of [
    ['', '2', 10],
    ['1', '', 10],
    [' ', '2', 10],
    ['1', ' ', 10],
    ['1.5', '2', 10],
    ['1', '2.5', 10],
    ['one', '2', 10],
    ['1', 'two', 10],
    ['0', '2', 10],
    ['1', '-1', 10],
    ['2', '1', 10],
    ['1', '11', 10],
    ['-1', '1', 10],
    ['1', '1', 0]
  ]) {
    assertRejected(() => parseRange(...values));
  }
});

test('parseScore accepts finite non-negative numbers', () => {
  assert.equal(parseScore(0), 0);
  assert.equal(parseScore('10'), 10);
  assert.equal(parseScore('5.5'), 5.5);
  assert.equal(parseScore(' 2 '), 2);
});

test('parseScore rejects blank, negative, non-numeric, and non-finite values', () => {
  for (const value of ['', ' ', '-1', -0.01, 'not-a-number', NaN, Infinity, -Infinity, null, true]) {
    assertRejected(() => parseScore(value));
  }
});

test('selectRows replaces the selection with the requested one-based range', () => {
  const rows = Array.from({ length: 4 }, (_, index) => {
    const checkbox = {
      checked: index === 0,
      click() {
        this.checked = !this.checked;
      }
    };
    return { order: index + 1, checkbox };
  });

  selectRows(rows, 2, 3);

  assert.deepEqual(rows.map(({ checkbox }) => checkbox.checked), [false, true, true, false]);
});

test('selectRows is idempotent for an already matching selection', () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    order: index + 1,
    checkbox: {
      checked: index > 0,
      click() {
        this.checked = !this.checked;
      }
    }
  }));

  selectRows(rows, 2, 3);

  assert.deepEqual(rows.map(({ checkbox }) => checkbox.checked), [false, true, true]);
});


test('selectRangeRows adds a range without clearing an earlier selection', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
    checkbox: {
      checked: false,
      click() {
        this.checked = !this.checked;
      }
    }
  }));

  selectRangeRows(rows, 1, 2);
  selectRangeRows(rows, 4, 5);

  assert.deepEqual(rows.map(({ checkbox }) => checkbox.checked), [true, true, false, true, true]);
});

test('unselectRangeRows clears only the requested range', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
    checkbox: {
      checked: true,
      click() {
        this.checked = !this.checked;
      }
    }
  }));

  unselectRangeRows(rows, { start: 2, end: 4 });

  assert.deepEqual(rows.map(({ checkbox }) => checkbox.checked), [true, false, false, false, true]);
});

test('Additional helpers read and set native toggle state', () => {
  const toggle = {
    classList: {
      values: new Set(['icon-checkbox-empty']),
      contains(name) {
        return this.values.has(name);
      },
      add(name) {
        this.values.add(name);
      },
      remove(name) {
        this.values.delete(name);
      }
    },
    getAttribute(name) {
      return name === 'data-val' ? 'false' : null;
    },
    click() {
      this.classList.remove('icon-checkbox-empty');
      this.classList.add('active');
    }
  };

  assert.equal(additionalState(toggle), false);
  assert.equal(setNativeAdditional(toggle, true), true);
  assert.equal(additionalState(toggle), true);
  assert.equal(setNativeAdditional(toggle, true), true);
});
