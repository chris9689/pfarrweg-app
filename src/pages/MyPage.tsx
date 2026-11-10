import { BookmarkCheck, CalendarDays, KeyRound, LogOut, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DAY_MS, expandAll, expandSchedule, templateOf } from '../../shared/recurrence';
import { spaceState } from '../../shared/status';
import type { EditScope, MeResponse, Occurrence, Reservation, Schedule, SpaceInfo } from '../../shared/types';
import { AvailabilityForm, type FormMode } from '../components/AvailabilityForm';
import { CodeLoginForm } from '../components/CodeLogin';
import { Alert, Button, Card, ConfirmSheet, IconButton, Sheet, Spinner, SpaceTile, StatusPill, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useFormatters, type Formatters } from '../lib/format';
import { useNow, useOnline } from '../lib/hooks';
import { useNotices } from '../lib/notices';
import { useOverview } from '../lib/overview';
import { defaultFormValues, valuesFromOccurrence, valuesFromSchedule } from '../lib/schedule-form';
import { stateLabel } from '../lib/ui-helpers';

type MeState = { status: 'loading' } | { status: 'anon' } | { status: 'error' } | { status: 'ready'; data: MeResponse };

export default function MyPage() {
  const [state, setState] = useState<MeState>({ status: 'loading' });
  const { refresh: refreshNotices } = useNotices();

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await api<MeResponse>('GET', '/api/me') });
    } catch (err) {
      setState(err instanceof ApiError && err.status === 401 ? { status: 'anon' } : { status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'anon') {
    return (
      <LoginForm
        onSuccess={async () => {
          await load();
          await refreshNotices();
        }}
      />
    );
  }
  if (state.status === 'error') return <LoadError onRetry={load} />;
  return (
    <ManageSpaces
      data={state.data}
      reload={load}
      onSignedOut={() => {
        setState({ status: 'anon' });
        void refreshNotices();
      }}
    />
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Alert>{online ? t('errors.generic') : t('errors.network')}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto mt-2 max-w-md p-6">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <KeyRound className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold tracking-tight">{t('login.title')}</h1>
      <p className="mb-6 mt-1 text-slate-600">{t('login.intro')}</p>
      <CodeLoginForm onSuccess={onSuccess} />
      <ul className="mt-6 flex flex-col gap-1.5 text-sm text-slate-600">
        <li>{t('login.remember')}</li>
        <li>{t('login.help')}</li>
        <li>{t('login.privacy')}</li>
      </ul>
    </Card>
  );
}

type Pending =
  | { kind: 'scope'; action: 'edit' | 'delete'; schedule: Schedule; occurrence: Occurrence }
  | { kind: 'confirmDelete'; schedule: Schedule; series: boolean }
  | { kind: 'cancelReservation'; reservation: Reservation }
  | { kind: 'removeReservation'; reservation: Reservation }
  | { kind: 'reservationRemoved'; reservation: Reservation }
  | null;

interface RemoveOptions {
  message: string;
  removeAvailability: boolean;
}

function ManageSpaces({ data, reload, onSignedOut }: { data: MeResponse; reload: () => Promise<void>; onSignedOut: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const online = useOnline();
  const now = useNow();
  const overview = useOverview();
  const fmt = useFormatters(data.timezone);
  const [form, setForm] = useState<{ key: number; mode: FormMode } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = async () => {
    await Promise.all([reload(), overview.refresh()]);
  };

  const run = async (request: () => Promise<unknown>, success: string | null, next: Pending = null) => {
    setBusy(true);
    try {
      await request();
      if (success) toast(success);
      setPending(next);
      await refreshAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSignedOut();
      setPending(null);
      toast(errorMessage(err, t, fmt), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openForm = (mode: FormMode) => setForm({ key: Date.now(), mode });

  const editFlow = (schedule: Schedule, occurrence?: Occurrence) => {
    if (schedule.recurrenceType !== 'none' && occurrence) {
      setPending({ kind: 'scope', action: 'edit', schedule, occurrence });
    } else {
      openForm({ kind: 'edit', schedule, scope: 'series', values: valuesFromSchedule(schedule) });
    }
  };

  const deleteFlow = (schedule: Schedule, occurrence?: Occurrence) => {
    if (schedule.recurrenceType !== 'none' && occurrence) {
      setPending({ kind: 'scope', action: 'delete', schedule, occurrence });
    } else {
      setPending({ kind: 'confirmDelete', schedule, series: schedule.recurrenceType !== 'none' });
    }
  };

  const pickScope = (scope: EditScope) => {
    if (pending?.kind !== 'scope') return;
    const { schedule, occurrence, action } = pending;
    if (action === 'edit') {
      setPending(null);
      const values =
        scope === 'occurrence'
          ? valuesFromOccurrence(schedule, occurrence)
          : valuesFromSchedule(schedule, scope === 'future' ? occurrence.occurrenceDate : undefined);
      openForm({ kind: 'edit', schedule, scope, occurrenceDate: occurrence.occurrenceDate, values });
    } else if (scope === 'series') {
      setPending({ kind: 'confirmDelete', schedule, series: true });
    } else {
      void run(
        () => api('DELETE', `/api/schedules/${schedule.id}?scope=${scope}&date=${occurrence.occurrenceDate}`),
        t('toast.deleted'),
      );
    }
  };

  const signOut = async () => {
    await api('POST', '/api/auth/logout', {}).catch(() => {});
    toast(t('manage.signedOut'));
    onSignedOut();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('manage.title')}</h1>
          <p className="text-slate-600">{t('manage.signedInAs', { name: data.apartment.name })}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={signOut}>
          <LogOut className="size-4" aria-hidden />
          {t('common.signOut')}
        </Button>
      </div>

      {!online && <Alert tone="info">{t('offline.editingDisabled')}</Alert>}

      {(data.reservations ?? []).length > 0 && (
        <section aria-labelledby="my-reservations-title" data-testid="my-reservations">
          <h2 id="my-reservations-title" className="mb-2 text-lg font-bold">
            {t('manage.myReservations')}
          </h2>
          <Card className="p-2">
            <ul className="flex flex-col divide-y divide-slate-100">
              {data.reservations.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-2">
                  <SpaceTile number={r.spaceNumber} kind="reserved" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t('common.space', { number: r.spaceNumber })}</p>
                    <p className="text-sm text-slate-600">{fmt.range(Date.parse(r.start), Date.parse(r.end), now)}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    aria-label={`${t('manage.cancelReservation')}: ${t('common.space', { number: r.spaceNumber })}`}
                    disabled={!online || busy}
                    onClick={() => setPending({ kind: 'cancelReservation', reservation: r })}
                  >
                    {t('manage.cancelShort')}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {data.spaces.length === 0 && <Alert tone="info">{t('manage.noSpaces')}</Alert>}

      {data.spaces.map((space) => (
        <SpaceCard
          key={space.id}
          space={space}
          data={data}
          now={now}
          fmt={fmt}
          disabled={!online || busy}
          onCreate={() => openForm({ kind: 'create', values: defaultFormValues(space.id, Date.now(), data.timezone) })}
          onEdit={editFlow}
          onDelete={deleteFlow}
          onRemoveReservation={(reservation) => setPending({ kind: 'removeReservation', reservation })}
          onToggleActive={(s) =>
            run(
              () => api('POST', `/api/schedules/${s.id}/${s.isActive ? 'pause' : 'resume'}`, {}),
              s.isActive ? t('toast.paused') : t('toast.resumed'),
            )
          }
        />
      ))}

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={
          form?.mode.kind === 'create'
            ? t('form.createTitle')
            : form?.mode.kind === 'edit' && form.mode.scope === 'occurrence'
              ? t('form.editOccurrenceTitle')
              : t('form.editTitle')
        }
      >
        {form && (
          <AvailabilityForm
            key={form.key}
            mode={form.mode}
            spaces={data.spaces}
            timezone={data.timezone}
            onCancel={() => setForm(null)}
            onSaved={async (message) => {
              setForm(null);
              toast(message);
              await refreshAll();
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={pending?.kind === 'scope'}
        onClose={() => setPending(null)}
        title={pending?.kind === 'scope' && pending.action === 'delete' ? t('scope.deleteTitle') : t('scope.editTitle')}
      >
        {pending?.kind === 'scope' && (
          <div className="flex flex-col gap-3">
            <p className="text-slate-600">
              {t('scope.intro')}{' '}
              <strong className="text-slate-900">{fmt.range(pending.occurrence.start, pending.occurrence.end, now)}</strong>
            </p>
            {(['occurrence', 'future', 'series'] as const).map((scope) => (
              <Button key={scope} variant="secondary" className="justify-start text-left" disabled={busy} onClick={() => pickScope(scope)}>
                {t(`scope.${scope}`)}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={pending?.kind === 'cancelReservation'}
        title={t('confirm.cancelReservationTitle')}
        text={t('confirm.cancelReservationText')}
        confirmLabel={t('manage.cancelReservation')}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={() =>
          pending?.kind === 'cancelReservation' &&
          run(() => api('DELETE', `/api/reservations/${pending.reservation.id}`), t('toast.reservationCancelled'))
        }
      />

      <RemoveReservationSheet
        key={pending?.kind === 'removeReservation' ? pending.reservation.id : 'closed'}
        reservation={pending?.kind === 'removeReservation' ? pending.reservation : null}
        fmt={fmt}
        now={now}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={(reservation, options) =>
          run(() => api('POST', `/api/reservations/${reservation.id}/cancel`, options), null, {
            kind: 'reservationRemoved',
            reservation,
          })
        }
      />

      <Sheet open={pending?.kind === 'reservationRemoved'} onClose={() => setPending(null)} title={t('removed.title')}>
        {pending?.kind === 'reservationRemoved' && (
          <>
            <p className="mb-5 text-slate-600">{t('removed.text', { name: pending.reservation.apartmentName })}</p>
            <Button className="w-full" onClick={() => setPending(null)}>
              {t('common.done')}
            </Button>
          </>
        )}
      </Sheet>

      <ConfirmSheet
        open={pending?.kind === 'confirmDelete'}
        title={pending?.kind === 'confirmDelete' && pending.series ? t('confirm.deleteSeriesTitle') : t('confirm.deleteTitle')}
        text={pending?.kind === 'confirmDelete' && pending.series ? t('confirm.deleteSeriesText') : t('confirm.deleteText')}
        confirmLabel={t('common.delete')}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={() =>
          pending?.kind === 'confirmDelete' &&
          run(() => api('DELETE', `/api/schedules/${pending.schedule.id}?scope=series`), t('toast.deleted'))
        }
      />
    </div>
  );
}

function SpaceCard({
  space,
  data,
  now,
  fmt,
  disabled,
  onCreate,
  onEdit,
  onDelete,
  onToggleActive,
  onRemoveReservation,
}: {
  space: SpaceInfo;
  data: MeResponse;
  now: number;
  fmt: Formatters;
  disabled: boolean;
  onCreate: () => void;
  onEdit: (s: Schedule, o?: Occurrence) => void;
  onDelete: (s: Schedule, o?: Occurrence) => void;
  onToggleActive: (s: Schedule) => void;
  onRemoveReservation: (r: Reservation) => void;
}) {
  const { t } = useTranslation();
  const schedules = data.schedules.filter((s) => s.parkingSpaceId === space.id);
  const reserved = (data.spaceReservations ?? []).filter((r) => r.parkingSpaceId === space.id);
  const state = spaceState(
    expandAll(schedules, data.exceptions, now, now + 8 * DAY_MS),
    now,
    reserved.map((r) => ({ start: Date.parse(r.start), end: Date.parse(r.end), by: r.apartmentName })),
  );

  return (
    <section aria-labelledby={`space-title-${space.number}`} data-testid={`my-space-${space.number}`}>
    <Card className="p-0">
      <div className="flex items-center gap-3 p-4">
        <SpaceTile number={space.number} kind={state.kind} />
        <div className="min-w-0 flex-1">
          <h2 id={`space-title-${space.number}`} className="text-lg font-bold">
            {t('common.space', { number: space.number })}
          </h2>
          <StatusPill kind={state.kind}>{stateLabel(state, fmt, now, t)}</StatusPill>
        </div>
      </div>
      <div className="px-4 pb-4">
        <Button className="w-full" onClick={onCreate} disabled={disabled}>
          <Plus className="size-5" aria-hidden />
          {t('manage.makeAvailable')}
        </Button>
      </div>

      {reserved.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">{t('manage.reservations')}</h3>
          <ul className="flex flex-col gap-1">
            {reserved.map((r) => {
              const label = t('manage.reservedBy', {
                name: r.apartmentName,
                range: fmt.range(Date.parse(r.start), Date.parse(r.end), now),
              });
              return (
                <li key={r.id} className="flex items-center gap-2 text-sm text-orange-900">
                  <BookmarkCheck className="size-4 shrink-0 text-orange-700" aria-hidden />
                  <span className="min-w-0 flex-1">{label}</span>
                  {/* Running reservations can only be cancelled by the reserving apartment. */}
                  {Date.parse(r.start) > now && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      aria-label={`${t('manage.removeReservation')}: ${label}`}
                      disabled={disabled}
                      onClick={() => onRemoveReservation(r)}
                    >
                      {t('manage.removeShort')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="border-t border-slate-100 px-4 py-3">
        <h3 className="mb-1 text-sm font-semibold text-slate-500">{t('manage.planned')}</h3>
        {schedules.length === 0 ? (
          <p className="py-1 text-sm text-slate-600">{t('manage.nothingPlanned')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {schedules.map((s) =>
              s.recurrenceType === 'none' ? (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <CalendarDays className="size-5 shrink-0 text-slate-400" aria-hidden />
                  <span className="flex-1 text-sm font-medium">{fmt.range(Date.parse(s.start), Date.parse(s.end), now)}</span>
                  <IconButton label={t('common.edit')} disabled={disabled} onClick={() => onEdit(s)}>
                    <Pencil className="size-[18px]" aria-hidden />
                  </IconButton>
                  <IconButton label={t('common.delete')} disabled={disabled} onClick={() => onDelete(s)}>
                    <Trash2 className="size-[18px]" aria-hidden />
                  </IconButton>
                </li>
              ) : (
                <RecurringItem
                  key={s.id}
                  schedule={s}
                  data={data}
                  now={now}
                  fmt={fmt}
                  disabled={disabled}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleActive={onToggleActive}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </Card>
    </section>
  );
}

function RemoveReservationSheet({
  reservation,
  fmt,
  now,
  busy,
  onClose,
  onConfirm,
}: {
  reservation: Reservation | null;
  fmt: Formatters;
  now: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reservation: Reservation, options: RemoveOptions) => void;
}) {
  const { t } = useTranslation();
  const [removeAvailability, setRemoveAvailability] = useState(true);
  const [message, setMessage] = useState('');
  const name = reservation?.apartmentName ?? '';
  const range = reservation ? fmt.range(Date.parse(reservation.start), Date.parse(reservation.end), now) : '';

  return (
    <ConfirmSheet
      open={reservation !== null}
      title={t('confirm.removeReservationTitle')}
      text={t('confirm.removeReservationText', { name, range })}
      confirmLabel={t('manage.removeReservation')}
      cancelLabel={t('confirm.keepReservation')}
      busy={busy}
      onClose={onClose}
      onConfirm={() => reservation && onConfirm(reservation, { message: message.trim(), removeAvailability })}
    >
      <ul className="-mt-2 mb-4 list-disc pl-5 text-sm text-slate-600">
        <li>{t('confirm.removeReservationFinal')}</li>
        <li>{t('confirm.removeReservationNotify', { name })}</li>
      </ul>
      <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
        <input
          type="checkbox"
          checked={removeAvailability}
          onChange={(e) => setRemoveAvailability(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm">
          <span className="block font-semibold text-slate-800">{t('confirm.removeAvailability')}</span>
          <span className="block text-slate-500">{t('confirm.removeAvailabilityHint')}</span>
        </span>
      </label>
      <label htmlFor="remove-message" className="mb-1.5 block text-sm font-semibold text-slate-800">
        {t('confirm.message', { name })}
      </label>
      <textarea
        id="remove-message"
        rows={2}
        maxLength={200}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="mb-5 block w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </ConfirmSheet>
  );
}

function RecurringItem({
  schedule: s,
  data,
  now,
  fmt,
  disabled,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  schedule: Schedule;
  data: MeResponse;
  now: number;
  fmt: Formatters;
  disabled: boolean;
  onEdit: (s: Schedule, o?: Occurrence) => void;
  onDelete: (s: Schedule, o?: Occurrence) => void;
  onToggleActive: (s: Schedule) => void;
}) {
  const { t } = useTranslation();
  const next = expandSchedule(s, data.exceptions, now, now + 60 * DAY_MS).slice(0, 3);
  const meta = [
    Date.parse(s.start) > now ? t('recurrence.from', { date: fmt.isoDate(templateOf(s).startDate) }) : null,
    s.recurrenceEndDate ? t('recurrence.until', { date: fmt.isoDate(s.recurrenceEndDate) }) : null,
  ].filter(Boolean);

  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <Repeat className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{fmt.recurrence(s)}</p>
          {(meta.length > 0 || !s.isActive) && (
            <p className="text-xs text-slate-500">
              {!s.isActive && (
                <span className="mr-1.5 rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-700">{t('manage.paused')}</span>
              )}
              {meta.join(' · ')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 sm:pl-7">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onToggleActive(s)}>
          {s.isActive ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {s.isActive ? t('manage.pause') : t('manage.resume')}
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onEdit(s, next[0])}>
          <Pencil className="size-4" aria-hidden />
          {t('common.edit')}
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onDelete(s, next[0])}>
          <Trash2 className="size-4" aria-hidden />
          {t('common.delete')}
        </Button>
      </div>

      {s.isActive && (
        <div className="mt-3 sm:pl-7">
          <p className="text-xs font-semibold text-slate-500">{t('manage.nextDates')}</p>
          {next.length === 0 ? (
            <p className="text-sm text-slate-600">{t('manage.noNextDates')}</p>
          ) : (
            <ul>
              {next.map((o) => {
                const label = fmt.range(o.start, o.end, now);
                return (
                  <li key={o.occurrenceDate} className="flex items-center gap-1">
                    <span className="flex-1 text-sm">
                      {label}
                      {o.modified && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          {t('manage.changed')}
                        </span>
                      )}
                    </span>
                    <IconButton label={t('manage.editDate', { date: label })} disabled={disabled} onClick={() => onEdit(s, o)}>
                      <Pencil className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton label={t('manage.deleteDate', { date: label })} disabled={disabled} onClick={() => onDelete(s, o)}>
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
