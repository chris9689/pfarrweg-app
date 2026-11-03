import { BookmarkCheck, Car, CircleCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SpaceState } from '../../shared/status';
import { cx } from '../lib/ui-helpers';

export type BayKind = SpaceState['kind'];

export interface Bay {
  space: number;
  kind: BayKind;
  /** Accessible / tooltip description, e.g. "Space 1: Available until 18:00". */
  label: string;
}

const BAY_STYLE: Record<BayKind, { Icon: typeof Car; tile: string; icon: string; line: string; legend: string }> = {
  available: {
    Icon: CircleCheck,
    tile: 'border-emerald-300 bg-emerald-50',
    icon: 'text-emerald-600',
    line: 'bg-emerald-300',
    legend: 'overview.legendAvailable',
  },
  upcoming: {
    Icon: Clock,
    tile: 'border-amber-300 bg-amber-50',
    icon: 'text-amber-600',
    line: 'bg-amber-300',
    legend: 'overview.legendUpcoming',
  },
  reserved: {
    Icon: BookmarkCheck,
    tile: 'border-orange-600 bg-orange-100',
    icon: 'text-orange-700',
    line: 'bg-orange-500',
    legend: 'overview.legendReserved',
  },
  occupied: {
    Icon: Car,
    tile: 'border-slate-200 bg-white',
    icon: 'text-rose-500',
    line: 'bg-slate-200',
    legend: 'status.occupied',
  },
};

const LEGEND_ORDER: BayKind[] = ['available', 'upcoming', 'reserved', 'occupied'];

/** Row of parking bays (1…n, left to right). Free bays can be tapped to reserve them. */
export function ParkingLot({ bays, onSelect }: { bays: Bay[]; onSelect?: (bay: Bay) => void }) {
  const { t } = useTranslation();
  const present = new Set(bays.map((b) => b.kind));
  const legend = LEGEND_ORDER.filter((kind) => kind !== 'reserved' || present.has(kind));

  return (
    <div>
      <ul
        aria-label={t('overview.allSpaces')}
        data-testid="parking-lot"
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${bays.length}, minmax(0, 1fr))` }}
      >
        {bays.map((bay) => {
          const { Icon, tile, icon, line } = BAY_STYLE[bay.kind];
          const selectable = onSelect && (bay.kind === 'available' || bay.kind === 'upcoming');
          const content = (
            <>
              <span className="text-base font-extrabold leading-none text-slate-800">{bay.space}</span>
              <Icon className={cx('size-6 shrink-0 sm:size-7', icon)} aria-hidden />
              <span aria-hidden className={cx('h-1 w-1/2 rounded-full', line)} />
            </>
          );
          const shape = cx(
            'flex h-20 w-full flex-col items-center justify-between rounded-xl border-2 pb-2 pt-1.5 sm:h-24',
            tile,
          );
          return (
            <li key={bay.space} data-testid={`bay-${bay.space}`} data-status={bay.kind} title={bay.label}>
              {selectable ? (
                <button
                  type="button"
                  aria-label={`${bay.label} – ${t('reserve.action')}`}
                  onClick={() => onSelect(bay)}
                  className={cx(shape, 'transition hover:brightness-95 active:scale-[0.97]')}
                >
                  {content}
                </button>
              ) : (
                <div aria-label={bay.label} role="img" className={shape}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600" aria-hidden>
        {legend.map((kind) => {
          const { Icon, icon, legend: key } = BAY_STYLE[kind];
          return (
            <li key={kind} className="flex items-center gap-1">
              <Icon className={cx('size-3.5', icon)} /> {t(key)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
