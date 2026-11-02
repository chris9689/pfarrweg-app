import { CalendarDays, ChevronDown } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, localDateTime } from '../../shared/recurrence';
import type { EditScope, RecurrenceType, Schedule, SpaceInfo } from '../../shared/types';
import { validateScheduleInput } from '../../shared/validation';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useFormatters } from '../lib/format';
import { useOnline } from '../lib/hooks';
import { TIME_OPTIONS, impliedEndDate, toScheduleInput, type FormValues } from '../lib/schedule-form';
import { cx } from '../lib/ui-helpers';
import { Alert, Button } from './ui';

export type FormMode =
  | { kind: 'create'; values: FormValues }
  | { kind: 'edit'; schedule: Schedule; scope: EditScope; occurrenceDate?: string; values: FormValues };

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-800';

function Chip({
  active,
  onClick,
  children,
  className,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-11 rounded-xl px-3 text-sm font-semibold transition',
        active ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function Disclosure({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
      >
        {label}
        <ChevronDown className={cx('size-5 text-slate-500 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-slate-200 p-4">{children}</div>}
    </div>
  );
}

export function AvailabilityForm({
  mode,
  spaces,
  timezone,
  onSaved,
  onCancel,
}: {
  mode: FormMode;
  spaces: SpaceInfo[];
  timezone: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters(timezone);
  const online = useOnline();
  const [values, setValues] = useState<FormValues>(mode.values);
  const [repeatOpen, setRepeatOpen] = useState(mode.values.repeatType !== 'none');
  const [moreOpen, setMoreOpen] = useState(mode.values.endDate !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const today = DateTime.fromMillis(now, { zone: timezone }).toISODate()!;
  const tomorrow = addDays(today, 1);
  const scope = mode.kind === 'edit' ? mode.scope : null;
  const canRepeat = scope !== 'occurrence';
  const repeating = values.repeatType !== 'none';
  const space = spaces.find((s) => s.id === values.spaceId);
  const set = (patch: Partial<FormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setError(null);
  };

  const input = toScheduleInput(values);
  const check = validateScheduleInput(input, timezone, now, { allowRepeat: canRepeat });
  const endsNextDay = !values.endDate && impliedEndDate(values.date, values.startTime, values.endTime) !== values.date;

  let summary: string | null = null;
  if (check.ok && space) {
    const start = localDateTime(input.startDate, input.startTime, timezone).toMillis();
    const end = localDateTime(input.endDate, input.endTime, timezone).toMillis();
    const when = check.value.recurrenceType === 'none'
      ? fmt.range(start, end, now)
      : [
          fmt.recurrence({ ...check.value, id: '', parkingSpaceId: '', timezone, isActive: true, createdAt: '', updatedAt: '' }),
          t('recurrence.from', { date: fmt.isoDate(values.date) }),
          values.until ? t('recurrence.until', { date: fmt.isoDate(values.until) }) : null,
        ]
          .filter(Boolean)
          .join(', ');
    summary = t('form.summary', { number: space.number, when });
  }

  const setRepeat = (type: RecurrenceType) =>
    set({
      repeatType: type,
      endDate: type === 'none' ? values.endDate : null,
      days: type === 'weekdays' && values.days.length === 0 ? [DateTime.fromISO(values.date).weekday] : values.days,
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!check.ok) {
      setError(errorMessage(check.code, t, fmt));
      return;
    }
    setBusy(true);
    try {
      if (mode.kind === 'create') {
        await api('POST', '/api/schedules', { parkingSpaceId: values.spaceId, ...input });
        onSaved(t('toast.created', { number: space?.number }));
      } else {
        await api('PUT', `/api/schedules/${mode.schedule.id}`, {
          ...input,
          scope: mode.scope,
          occurrenceDate: mode.occurrenceDate,
        });
        onSaved(t('toast.updated'));
      }
    } catch (err) {
      setError(errorMessage(err, t, fmt));
    } finally {
      setBusy(false);
    }
  }

  const timeOptions = (current: string) =>
    (TIME_OPTIONS.includes(current) ? TIME_OPTIONS : [...TIME_OPTIONS, current].sort()).map((value) => (
      <option key={value} value={value}>
        {fmt.clockLabel(value)}
      </option>
    ));

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {mode.kind === 'create' && spaces.length > 1 && (
        <fieldset>
          <legend className={labelClass}>{t('form.space')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {spaces.map((s) => (
              <Chip key={s.id} active={s.id === values.spaceId} onClick={() => set({ spaceId: s.id })}>
                {t('common.space', { number: s.number })}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className={labelClass}>{repeating ? t('form.startDate') : t('form.date')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Chip active={values.date === today} onClick={() => set({ date: today })}>
            {t('date.today')}
          </Chip>
          <Chip active={values.date === tomorrow} onClick={() => set({ date: tomorrow })}>
            {t('date.tomorrow')}
          </Chip>
          <label
            className={cx(
              'relative col-span-2 flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-primary/40 sm:col-span-1',
              values.date !== today && values.date !== tomorrow
                ? 'bg-primary text-white shadow-sm'
                : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
            )}
          >
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('form.otherDate')}</span>
            <input
              type="date"
              aria-label={t('form.otherDate')}
              value={values.date}
              min={scope ? undefined : today}
              max={addDays(today, 365)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  /* picker opens natively where showPicker is unsupported */
                }
              }}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-slate-600" data-testid="chosen-date">
          {fmt.isoDate(values.date, true)}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="start-time" className={labelClass}>
            {t('form.from')}
          </label>
          <select id="start-time" className={fieldClass} value={values.startTime} onChange={(e) => set({ startTime: e.target.value })}>
            {timeOptions(values.startTime)}
          </select>
        </div>
        <div>
          <label htmlFor="end-time" className={labelClass}>
            {t('form.until')}
          </label>
          <select id="end-time" className={fieldClass} value={values.endTime} onChange={(e) => set({ endTime: e.target.value })}>
            {timeOptions(values.endTime)}
          </select>
        </div>
      </div>
      {endsNextDay && <p className="-mt-3 text-sm font-medium text-amber-800">{t('form.endsNextDay')}</p>}

      {canRepeat && (
        <Disclosure label={t('form.repeat')} open={repeatOpen} onToggle={() => setRepeatOpen((o) => !o)}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('form.repeat')}>
            {(
              [
                ['none', t('form.repeatNone')],
                ['daily', t('form.repeatDaily')],
                ['weekly', t('form.repeatWeekly')],
                ['weekdays', t('form.repeatWeekdays')],
              ] as const
            ).map(([type, label]) => (
              <Chip key={type} active={values.repeatType === type} onClick={() => setRepeat(type)}>
                {label}
              </Chip>
            ))}
          </div>

          {values.repeatType === 'weekly' && (
            <p className="text-sm text-slate-700">
              {t('recurrence.weekly', { day: fmt.weekdayLong(DateTime.fromISO(values.date).weekday) })}
            </p>
          )}

          {values.repeatType === 'weekdays' && (
            <fieldset>
              <legend className={labelClass}>{t('form.weekdays')}</legend>
              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Chip
                    key={d}
                    className="px-0 text-xs sm:text-sm"
                    active={values.days.includes(d)}
                    aria-label={fmt.weekdayLong(d)}
                    onClick={() =>
                      set({ days: values.days.includes(d) ? values.days.filter((x) => x !== d) : [...values.days, d].sort() })
                    }
                  >
                    {fmt.weekdayShort(d)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          {repeating && (
            <div>
              <label htmlFor="repeat-until" className={labelClass}>
                {t('form.repeatUntil')}
              </label>
              <input
                id="repeat-until"
                type="date"
                className={fieldClass}
                value={values.until ?? ''}
                min={values.date}
                onChange={(e) => set({ until: e.target.value || null })}
              />
              <p className="mt-1.5 text-sm text-slate-600">
                {values.until ? fmt.isoDate(values.until, true) : t('form.noEndDate')}
              </p>
            </div>
          )}
        </Disclosure>
      )}

      {!repeating && (
        <Disclosure label={t('form.moreOptions')} open={moreOpen} onToggle={() => setMoreOpen((o) => !o)}>
          <div>
            <label htmlFor="end-date" className={labelClass}>
              {t('form.endDate')}
            </label>
            <input
              id="end-date"
              type="date"
              className={fieldClass}
              min={values.date}
              value={values.endDate ?? impliedEndDate(values.date, values.startTime, values.endTime)}
              onChange={(e) => set({ endDate: e.target.value || null })}
            />
            <p className="mt-1.5 text-sm text-slate-600">{t('form.endDateHint')}</p>
            {values.endDate && (
              <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-primary" onClick={() => set({ endDate: null })}>
                {t('form.clearEndDate')}
              </button>
            )}
          </div>
        </Disclosure>
      )}

      {summary && (
        <p className="rounded-xl bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary-dark" data-testid="form-summary">
          {summary}
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {!online && <Alert tone="info">{t('offline.editingDisabled')}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy || !online} busy={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
