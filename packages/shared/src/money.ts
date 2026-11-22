const php = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 65 -> "₱65", 1234.5 -> "₱1,234.5". Prices are whole pesos in practice. */
export function formatPHP(amount: number): string {
  return php.format(amount);
}
