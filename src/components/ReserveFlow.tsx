import { BookmarkCheck, ChevronDown } from 'lucide-react';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localDateTime } from '../../shared/recurrence';
import type { MeResponse } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useFormatters } from '../lib/format';
import { useOnline } from '../lib/hooks';
import { TIME_OPTIONS } from '../lib/schedule-form';
import { cx } from '../lib/ui-helpers';
import { CodeLoginForm } from './CodeLogin';
import { Alert, Button, SpaceTile, Spinner } from './ui';

/** A free period of one space that can be (partly) reserved. */
export interface ReserveTarget {
  space: number;
  start: number;
  end: number;
}

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

const toLocal = (ms: number, zone: string) => {
  const d = DateTime.fromMillis(ms, { zone });
  return { date: d.toISODate()!, time: d.toFormat('HH:mm') };
};

/** Reservation step: checks the apartment session (asks for the code if needed), then reserves. */
export function ReserveFlow({
  target,
  timezone,
  onDone,
  onCancel,
}: {
  target: ReserveTarget;
  timezone: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'checking' | 'login' | 'own' | 'form' | 'error'>('checking');

  const check = useCallback(async () => {
    setStep('checking');
    try {
      const me = await api<MeResponse>('GET', '/api/me');
      setStep(me.spaces.some((s) => s.number === target.space) ? 'own' : 'form');
    } catch (err) {
      setStep(err instanceof ApiError && err.status === 401 ? 'login' : 'error');
    }
  }, [target.space]);

  useEffect(() => {
    void check();
  }, [check]);

  if (step === 'checking') return <Spinner />;
  if (step === 'error') return <Alert>{t('errors.generic')}</Alert>;
  if (step === 'login') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-slate-600">{t('reserve.loginHint')}</p>
        <CodeLoginForm onSuccess={check} />
      </div>
    );
  }
  if (step === 'own') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="info">{t('reserve.ownSpace')}</Alert>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </div>
    );
  }
  return <ReserveForm target={target} timezone={timezone} onDone={onDone} onCancel={onCancel} />;
}

function ReserveForm({
  target,
  timezone,
  onDone,
  onCancel,
}: {
  target: ReserveTarget;
  timezone: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters(timezone);
  const online = useOnline();
  const now = Date.now();
  const quarter = DateTime.fromMillis(now, { zone: timezone }).startOf('minute');
  const running = target.start <= now;
  // A period that is already running can be reserved from the current quarter hour.
  const windowStartMs = running ? quarter.minus({ minutes: quarter.minute % 15 }).toMillis() : target.start;

  const [start, setStart] = useState(() => toLocal(windowStartMs, timezone));
  const [end, setEnd] = useState(() => toLocal(target.end, timezone));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startMs = localDateTime(start.date, start.time, timezone).toMillis();
  const endMs = localDateTime(end.date, end.time, timezone).toMillis();
  const windowStart = toLocal(windowStartMs, timezone);
  const windowEnd = toLocal(target.end, timezone);
  const valid = endMs > startMs && startMs >= windowStartMs && endMs <= target.end;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(endMs <= startMs ? t('errors.end_before_start') : t('reserve.outsideWindow'));
      setOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/reservations', {
        spaceNumber: target.space,
        startDate: start.date,
        startTime: start.time,
        endDate: end.date,
        endTime: end.time,
      });
      onDone(t('toast.reserved', { number: target.space, range: fmt.range(startMs, endMs, now) }));
    } catch (err) {
      setError(errorMessage(err, t, fmt));
      setBusy(false);
    }
  }

  const options = (current: string) =>
    (TIME_OPTIONS.includes(current) ? TIME_OPTIONS : [...TIME_OPTIONS, current].sort()).map((value) => (
      <option key={value} value={value}>
        {fmt.clockLabel(value)}
      </option>
    ));

  const pickers = (
    label: string,
    value: { date: string; time: string },
    set: (v: { date: string; time: string }) => void,
    id: string,
  ) => (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          aria-label={`${label} – ${t('form.date')}`}
          className={fieldClass}
          value={value.date}
          min={windowStart.date}
          max={windowEnd.date}
          onChange={(e) => e.target.value && set({ ...value, date: e.target.value })}
        />
        <select
          id={id}
          aria-label={label}
          className={fieldClass}
          value={value.time}
          onChange={(e) => set({ ...value, time: e.target.value })}
        >
          {options(value.time)}
        </select>
      </div>
    </fieldset>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <SpaceTile number={target.space} kind="available" />
        <div className="min-w-0">
          <p className="font-bold">{t('common.space', { number: target.space })}</p>
          <p className="text-sm text-slate-700">
            {running
              ? t('status.availableUntil', { time: fmt.moment(target.end, now) })
              : t('reserve.window', { range: fmt.range(target.start, target.end, now) })}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
        >
          {t('reserve.changeTimes')}
          <ChevronDown className={cx('size-5 text-slate-500 transition', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
            {pickers(t('form.from'), start, (v) => (setStart(v), setError(null)), 'reserve-start')}
            {pickers(t('form.until'), end, (v) => (setEnd(v), setError(null)), 'reserve-end')}
          </div>
        )}
      </div>

      {endMs > startMs && (
        <p
          className="flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-sm font-medium text-orange-900"
          data-testid="reserve-summary"
        >
          <BookmarkCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('reserve.summary', { range: fmt.range(startMs, endMs, now) })}
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {!online && <Alert tone="info">{t('offline.editingDisabled')}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="reserve" disabled={busy || !online} busy={busy}>
          {t('reserve.submit')}
        </Button>
      </div>
    </form>
  );
}
