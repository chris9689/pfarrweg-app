import type { TFunction } from 'i18next';
import i18n from '../i18n';
import { ApiError } from './api';
import type { Formatters } from './format';

/** Maps API / validation error codes to a translated, user-facing message. */
export function errorMessage(err: unknown, t: TFunction, fmt: Formatters): string {
  const code = typeof err === 'string' ? err : err instanceof ApiError ? err.code : 'generic';
  if (code === 'conflict' && err instanceof ApiError) {
    const { spaceNumber, start, end } = err.details as { spaceNumber: number; start: string; end: string };
    return t('errors.conflict', {
      number: spaceNumber,
      range: fmt.range(Date.parse(start), Date.parse(end), Date.now()),
    });
  }
  return i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic');
}
