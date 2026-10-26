import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toOrderDto } from '../../src/utils/orderDto.js';

// The admin order "Product Details" weights must be the weights as ordered
// (saved on the line at checkout) — never the product's current weights.

const order = { id: 'o1', subtotal: 0, discount_amount: 0, gst_amount: 0, shipping_amount: 0, total_amount: 0 };
const line = (extra) => ({
  id: 'i1',
  gold_value: 0,
  diamond_value: 0,
  making_charge: 0,
  gst_amount: 0,
  unit_price: 0,
  line_total: 0,
  ...extra,
});
const weightsOf = (item) => {
  const { goldWeightGrams, netWeightGrams, diamondWeightCarats, diamondWeightGrams, grossWeightGrams } =
    toOrderDto(order, [line(item)]).items[0];
  return { goldWeightGrams, netWeightGrams, diamondWeightCarats, diamondWeightGrams, grossWeightGrams };
};

describe('order line weights', () => {
  test('come from the line snapshot: net = gold, diamond g = ct x 0.2, gross = gold + diamond', () => {
    assert.deepEqual(weightsOf({ gold_weight_grams_snapshot: '1.475', diamond_weight_carats_snapshot: '0.100' }), {
      goldWeightGrams: 1.475,
      netWeightGrams: 1.475,
      diamondWeightCarats: 0.1,
      diamondWeightGrams: 0.02,
      grossWeightGrams: 1.495,
    });
  });

  test("ignore the product's current weights (the live join no longer supplies them)", () => {
    const w = weightsOf({
      gold_weight_grams_snapshot: '0.425',
      diamond_weight_carats_snapshot: '0.010',
      net_weight_grams: null,
      gross_weight_grams: '0.002',
      diamond_weight_grams: '5.000',
    });
    assert.deepEqual([w.netWeightGrams, w.diamondWeightGrams, w.grossWeightGrams], [0.425, 0.002, 0.427]);
  });

  test('a line without a weight snapshot shows nothing rather than a guess', () => {
    assert.deepEqual(weightsOf({}), {
      goldWeightGrams: null,
      netWeightGrams: null,
      diamondWeightCarats: null,
      diamondWeightGrams: null,
      grossWeightGrams: null,
    });
    // gold saved but no carats: gross can't be determined
    const w = weightsOf({ gold_weight_grams_snapshot: '2.330' });
    assert.deepEqual([w.netWeightGrams, w.diamondWeightGrams, w.grossWeightGrams], [2.33, null, null]);
  });
});
