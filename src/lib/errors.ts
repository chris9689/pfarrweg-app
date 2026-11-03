import type { TFunction } from 'i18next';
import i18n from '../i18n';
import { ApiError } from './api';
import type { Formatters } from './format';

/** Maps API / validation error codes to a translated, user-facing message. */
export function errorMessage(err: unknown, t: TFunction, fmt: Formatters): string {
  const code = typeof err === 'string' ? err : err instanceof ApiError ? err.code : 'generic';
  const details = err instanceof ApiError ? (err.details as { spaceNumber?: number; start?: string; end?: string }) : {};
  if (details.start && details.end && i18n.exists(`errors.${code}`)) {
    return t(`errors.${code}`, {
      number: details.spaceNumber,
      range: fmt.range(Date.parse(details.start), Date.parse(details.end), Date.now()),
    });
  }
  return i18n.exists(`errors.${code}`) ? t(`errors.${code}`, { number: details.spaceNumber }) : t('errors.generic');
}
