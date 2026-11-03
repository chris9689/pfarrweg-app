import type { TFunction } from 'i18next';
import type { SpaceState } from '../../shared/status';
import type { Formatters } from './format';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

export function stateLabel(state: SpaceState, fmt: Formatters, now: number, t: TFunction) {
  if (state.kind === 'available') return t('status.availableUntil', { time: fmt.moment(state.until, now) });
  if (state.kind === 'upcoming') return t('status.availableFrom', { time: fmt.moment(state.from, now) });
  if (state.kind === 'reserved') return t('status.reservedUntil', { time: fmt.moment(state.until, now) });
  return t('status.occupied');
}
