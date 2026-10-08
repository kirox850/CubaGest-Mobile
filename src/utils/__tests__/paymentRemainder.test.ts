import { describe, it, expect } from '@jest/globals';
import { calculateRemainingPayment } from '../paymentRemainder';

describe('calculateRemainingPayment', () => {
  it('completes the base-currency amount using the entered foreign payment rate', () => {
    expect(calculateRemainingPayment(800, [
      { id: 'usd', amount: '1', exchangeRate: 70 },
      { id: 'cup', amount: '', exchangeRate: 1 },
    ], 'cup')).toBe(730);
  });

  it('sums multiple payment lines using each selected rate', () => {
    expect(calculateRemainingPayment(800, [
      { id: 'usd', amount: 1, exchangeRate: 70 },
      { id: 'eur', amount: 2, exchangeRate: 80 },
      { id: 'cup', amount: 0, exchangeRate: 1 },
    ], 'cup')).toBe(570);
  });

  it('ignores the base-currency line being calculated', () => {
    expect(calculateRemainingPayment(800, [
      { id: 'cup-a', amount: 125, exchangeRate: 1 },
      { id: 'usd', amount: 1, exchangeRate: 70 },
      { id: 'cup-b', amount: 25, exchangeRate: 1 },
    ], 'cup-a')).toBe(705);
  });

  it('does not calculate if another entered payment has an invalid rate', () => {
    expect(calculateRemainingPayment(800, [
      { id: 'usd', amount: 1, exchangeRate: 0 },
      { id: 'cup', amount: 0, exchangeRate: 1 },
    ], 'cup')).toBeNull();
  });

  it('does not return zero or a negative remainder', () => {
    expect(calculateRemainingPayment(800, [
      { id: 'usd', amount: 10, exchangeRate: 80 },
      { id: 'cup', amount: 0, exchangeRate: 1 },
    ], 'cup')).toBeNull();
    expect(calculateRemainingPayment(800, [
      { id: 'usd', amount: 11, exchangeRate: 80 },
      { id: 'cup', amount: 0, exchangeRate: 1 },
    ], 'cup')).toBeNull();
  });
});
