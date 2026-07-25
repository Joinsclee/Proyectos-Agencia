import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeRemateForDisplay } from './data-quality.js';

describe('remate data quality boundary', () => {
  it('preserves plausible financial data', () => {
    const result = sanitizeRemateForDisplay({
      id: 'remate-1',
      appraisal_value: 800_000_000,
      minimum_bid: 560_000_000,
      minimum_bid_pct: 70,
    });

    assert.equal(result.appraisal_value, 800_000_000);
    assert.equal(result.minimum_bid, 560_000_000);
    assert.equal(result.minimum_bid_pct, 70);
    assert.equal(result._data_warnings, undefined);
  });

  it('hides astronomical values before they reach the UI', () => {
    const source = {
      id: 'remate-outlier',
      appraisal_value: '74331661084572850000000000',
      minimum_bid: 520_000_000,
      minimum_bid_pct: 70,
    };
    const result = sanitizeRemateForDisplay(source);

    assert.equal(result.appraisal_value, null);
    assert.equal(result.minimum_bid, 520_000_000);
    assert.deepEqual(result._data_warnings, ['appraisal_value_outlier']);
    assert.equal(source.appraisal_value, '74331661084572850000000000');
  });

  it('rejects invalid bids and percentages', () => {
    const result = sanitizeRemateForDisplay({
      minimum_bid: -1,
      minimum_bid_pct: 700,
    });

    assert.equal(result.minimum_bid, null);
    assert.equal(result.minimum_bid_pct, null);
    assert.deepEqual(result._data_warnings, [
      'minimum_bid_outlier',
      'minimum_bid_pct_outlier',
    ]);
  });
});
