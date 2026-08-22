export interface CurrencyConfig {
  code: string; // ISO 4217
  symbol: string;
  decimalDigits: number;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  XOF: { code: 'XOF', symbol: 'FCFA', decimalDigits: 0, locale: 'fr-SN' },
  GNF: { code: 'GNF', symbol: 'FG', decimalDigits: 0, locale: 'fr-GN' },
  NGN: { code: 'NGN', symbol: '₦', decimalDigits: 2, locale: 'en-NG' },
  GHS: { code: 'GHS', symbol: 'GH₵', decimalDigits: 2, locale: 'en-GH' },
};

export function formatAmount(amount: number, currencyCode: string): string {
  const currency = CURRENCIES[currencyCode];
  if (!currency) {
    throw new Error(`Unknown currency code: ${currencyCode}`);
  }
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  }).format(amount);
}
