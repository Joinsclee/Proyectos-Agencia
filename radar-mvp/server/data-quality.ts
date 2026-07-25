import { ERROR_PRICE } from '../lib/types.js';

export type RemateDataWarning =
  | 'appraisal_value_outlier'
  | 'minimum_bid_outlier'
  | 'minimum_bid_pct_outlier';

const finiteNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

function validMoney(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number == null) return null;
  return number > 0 && number <= ERROR_PRICE ? number : null;
}

/**
 * Última barrera antes de exponer un remate.
 *
 * La ingestión seguirá corrigiéndose en la fuente, pero un dato financiero
 * imposible nunca debe llegar a la interfaz ni alimentar un análisis con IA.
 */
export function sanitizeRemateForDisplay<T extends Record<string, any>>(
  row: T,
): T & { _data_warnings?: RemateDataWarning[] } {
  const warnings: RemateDataWarning[] = [];

  const appraisal = validMoney(row.appraisal_value);
  if (row.appraisal_value != null && appraisal == null) warnings.push('appraisal_value_outlier');

  const minimumBid = validMoney(row.minimum_bid);
  if (row.minimum_bid != null && minimumBid == null) warnings.push('minimum_bid_outlier');

  const rawPct = finiteNumber(row.minimum_bid_pct);
  const minimumBidPct = rawPct != null && rawPct > 0 && rawPct <= 100 ? rawPct : null;
  if (row.minimum_bid_pct != null && minimumBidPct == null) warnings.push('minimum_bid_pct_outlier');

  return {
    ...row,
    appraisal_value: appraisal,
    minimum_bid: minimumBid,
    minimum_bid_pct: minimumBidPct,
    ...(warnings.length ? { _data_warnings: warnings } : {}),
  };
}
