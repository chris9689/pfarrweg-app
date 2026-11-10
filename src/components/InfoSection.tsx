import { BrushCleaning, Leaf, Newspaper, Recycle, Trash, Trash2, type LucideIcon } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { daysBetween, localDate } from '../../shared/recurrence';
import { useFormatters } from '../lib/format';
import { houseRulesDuty, nextPickups, parseWasteCalendar, WASTE_CALENDAR_URL, type BinKind, type Pickup } from '../lib/info';
import { cx } from '../lib/ui-helpers';
import { Card, SectionTitle } from './ui';

const BINS: Record<BinKind, { label: string | null; Icon: LucideIcon; tile: string }> = {
  residual: { label: 'info.bin.residual', Icon: Trash2, tile: 'bg-slate-800 text-white' },
  paper: { label: 'info.bin.paper', Icon: Newspaper, tile: 'bg-blue-600 text-white' },
  yellow: { label: 'info.bin.yellow', Icon: Recycle, tile: 'bg-yellow-300 text-yellow-950' },
  organic: { label: 'info.bin.organic', Icon: Leaf, tile: 'bg-amber-800 text-white' },
  other: { label: null, Icon: Trash, tile: 'bg-slate-100 text-slate-700' },
};

function useWasteCalendar(): Pickup[] | null {
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(WASTE_CALENDAR_URL)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(
        (text) => active && setPickups(parseWasteCalendar(text)),
        () => active && setPickups([]),
      );
    return () => {
      active = false;
    };
  }, []);
  return pickups;
}

function IconTile({ Icon, className }: { Icon: LucideIcon; className: string }) {
  return (
    <span aria-hidden className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', className)}>
      <Icon className="size-5" />
    </span>
  );
}

export function InfoSection({ timezone, now }: { timezone: string; now: number }) {
  const { t } = useTranslation();
  const fmt = useFormatters(timezone);
  const calendar = useWasteCalendar();
  const today = localDate(now, timezone);
  const duty = houseRulesDuty(today);
  const pickups = calendar ? nextPickups(calendar, today) : null;

  return (
    <section aria-labelledby="info-title" data-testid="info">
      <SectionTitle>
        <span id="info-title">{t('info.title')}</span>
      </SectionTitle>
      <Card className="p-0">
        <div className="px-4 py-3" data-testid="house-rules">
          <h3 className="mb-2 text-sm font-semibold text-slate-500">{t('info.houseRules')}</h3>
          <div className="flex items-center gap-3">
            <IconTile Icon={BrushCleaning} className="bg-primary/10 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">{t('info.thisWeek')}</p>
              <p className="font-semibold">{duty.current}</p>
              <p className="text-xs text-slate-500">{t('info.nextWeek', { name: duty.next })}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-3" data-testid="waste">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">{t('info.waste')}</h3>
          {pickups?.length === 0 && <p className="py-1 text-sm text-slate-600">{t('info.wasteEmpty')}</p>}
          {pickups && pickups.length > 0 && (
            <ul className="flex flex-col divide-y divide-slate-100">
              {pickups.map((p) => {
                const bin = BINS[p.kind];
                const days = daysBetween(today, p.date);
                const ms = DateTime.fromISO(p.date, { zone: timezone }).toMillis();
                return (
                  <li key={p.date + p.summary} className="flex items-center gap-3 py-2">
                    <IconTile Icon={bin.Icon} className={bin.tile} />
                    <p className="min-w-0 flex-1 font-semibold">{bin.label ? t(bin.label) : p.summary}</p>
                    <div className="shrink-0 text-right">
                      <p className={cx('text-sm font-medium', days <= 1 && 'font-bold text-amber-800')}>{fmt.day(ms, now)}</p>
                      {days > 1 && <p className="text-xs text-slate-500">{t('info.inDays', { count: days })}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}
