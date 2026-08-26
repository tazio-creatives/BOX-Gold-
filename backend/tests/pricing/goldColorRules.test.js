import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isColorAvailableAtPurity } from '../../src/utils/goldColorRules.js';

describe('isColorAvailableAtPurity', () => {
  test('Rose Gold is unavailable at 9K', () => {
    assert.equal(isColorAvailableAtPurity('ROSE', '9K'), false);
  });

  test('Rose Gold is available at every other purity', () => {
    for (const purity of ['14K', '18K', '22K', '24K']) {
      assert.equal(isColorAvailableAtPurity('ROSE', purity), true);
    }
  });

  test('Yellow and White Gold are available at 9K', () => {
    assert.equal(isColorAvailableAtPurity('YELLOW', '9K'), true);
    assert.equal(isColorAvailableAtPurity('WHITE', '9K'), true);
  });

  test('no purity given -> always available (nothing to block against yet)', () => {
    assert.equal(isColorAvailableAtPurity('ROSE', null), true);
    assert.equal(isColorAvailableAtPurity('ROSE', undefined), true);
  });
});
