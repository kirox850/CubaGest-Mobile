export type PaymentRemainderLine = {
  id: string;
  amount: string | number;
  exchangeRate: string | number;
};

/** Returns the positive amount needed on one payment line to reach the total. */
export function calculateRemainingPayment(
  total: number,
  payments: PaymentRemainderLine[],
  paymentId: string,
): number | null {
  if (!Number.isFinite(total)) return null;

  let paidByOtherLines = 0;
  for (const payment of payments) {
    if (payment.id === paymentId) continue;

    const amount = payment.amount === '' ? 0 : Number(payment.amount);
    const rate = payment.exchangeRate === '' ? 0 : Number(payment.exchangeRate);
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (amount > 0 && (!Number.isFinite(rate) || rate <= 0)) return null;
    paidByOtherLines += amount * (Number.isFinite(rate) ? rate : 0);
  }

  const remaining = Math.round((total - paidByOtherLines + Number.EPSILON) * 100) / 100;
  return remaining > 0 ? remaining : null;
}
