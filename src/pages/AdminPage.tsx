import { KeyRound, LogOut, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityEntry, AdminApartment, AdminStateResponse, Reservation, Schedule } from '../../shared/types';
import { Alert, Button, Card, ConfirmSheet, IconButton, SectionTitle, Sheet, Spinner, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useFormatters, type Formatters } from '../lib/format';
import { useNow, useOnline } from '../lib/hooks';

type AdminState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'error' }
  | { status: 'ready'; data: AdminStateResponse; activity: ActivityEntry[] };

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function AdminPage() {
  const [state, setState] = useState<AdminState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const [data, activity] = await Promise.all([
        api<AdminStateResponse>('GET', '/api/admin/state'),
        api<{ entries: ActivityEntry[] }>('GET', '/api/admin/activity'),
      ]);
      setState({ status: 'ready', data, activity: activity.entries });
    } catch (err) {
      setState(err instanceof ApiError && err.status === 401 ? { status: 'login' } : { status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'login') return <AdminLogin onSuccess={load} />;
  if (state.status === 'error') return <ErrorRetry onRetry={load} />;
  return <AdminDashboard data={state.data} activity={state.activity} reload={load} onSignedOut={() => setState({ status: 'login' })} />;
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Alert>{t('errors.generic')}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const { t } = useTranslation();
  const online = useOnline();
  const fmt = useFormatters('UTC');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/admin/login', { password });
      await onSuccess();
    } catch (err) {
      setError(errorMessage(err, t, fmt));
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-2 max-w-md p-6">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <KeyRound className="size-6" aria-hidden />
      </span>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{t('admin.loginTitle')}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold">
            {t('admin.password')}
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={busy || !online || password.length === 0} busy={busy}>
          {t('admin.signIn')}
        </Button>
      </form>
    </Card>
  );
}

type Dialog =
  | { kind: 'reset'; apartment: AdminApartment }
  | { kind: 'code'; apartment: AdminApartment; code: string }
  | { kind: 'deleteApartment'; apartment: AdminApartment }
  | { kind: 'deleteSchedule'; schedule: Schedule }
  | { kind: 'cancelReservation'; reservation: Reservation }
  | null;

function AdminDashboard({
  data,
  activity,
  reload,
  onSignedOut,
}: {
  data: AdminStateResponse;
  activity: ActivityEntry[];
  reload: () => Promise<void>;
  onSignedOut: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const online = useOnline();
  const now = useNow();
  const fmt = useFormatters(data.timezone);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const disabled = busy || !online;

  const run = async <T,>(request: () => Promise<T>, after?: (result: T) => void) => {
    setBusy(true);
    try {
      const result = await request();
      if (after) after(result);
      else {
        toast(t('admin.saved'));
        setDialog(null);
      }
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSignedOut();
      setDialog(null);
      toast(errorMessage(err, t, fmt), 'error');
    } finally {
      setBusy(false);
    }
  };

  const spaceNumber = (id: string) => data.spaces.find((s) => s.id === id)?.number;
  const spacesOf = (apartmentId: string) =>
    data.spaces.filter((s) => s.apartmentId === apartmentId).map((s) => s.number);

  const signOut = async () => {
    await api('POST', '/api/admin/logout', {}).catch(() => {});
    onSignedOut();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('admin.title')}</h1>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" aria-hidden />
          {t('common.signOut')}
        </Button>
      </div>

      <section>
        <SectionTitle>{t('admin.apartments')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.apartments.map((a) => {
            const numbers = spacesOf(a.id);
            return (
              <Card key={a.id} className="flex flex-col gap-3">
                {renaming?.id === a.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(
                        () => api('PATCH', `/api/admin/apartments/${a.id}`, { name: renaming.name }),
                        () => {
                          setRenaming(null);
                          toast(t('admin.saved'));
                        },
                      );
                    }}
                  >
                    <input
                      aria-label={t('admin.apartmentName')}
                      className={fieldClass}
                      value={renaming.name}
                      maxLength={60}
                      onChange={(e) => setRenaming({ id: a.id, name: e.target.value })}
                    />
                    <Button type="submit" disabled={disabled}>
                      {t('common.save')}
                    </Button>
                    <Button variant="secondary" onClick={() => setRenaming(null)}>
                      {t('common.cancel')}
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{a.name}</p>
                      <p className="text-sm text-slate-600">
                        {numbers.length ? t('common.spaces', { numbers: numbers.join(', ') }) : t('admin.noSpaces')}
                      </p>
                      <p className={a.hasCode ? 'text-sm text-slate-500' : 'text-sm font-semibold text-amber-800'}>
                        {a.hasCode && a.codeUpdatedAt
                          ? t('admin.codeSet', { date: fmt.fullDateTime(Date.parse(a.codeUpdatedAt)) })
                          : t('admin.codeMissing')}
                      </p>
                    </div>
                    <IconButton label={t('admin.rename')} disabled={disabled} onClick={() => setRenaming({ id: a.id, name: a.name })}>
                      <Pencil className="size-[18px]" aria-hidden />
                    </IconButton>
                    <IconButton label={t('common.delete')} disabled={disabled} onClick={() => setDialog({ kind: 'deleteApartment', apartment: a })}>
                      <Trash2 className="size-[18px]" aria-hidden />
                    </IconButton>
                  </div>
                )}
                <Button variant="secondary" disabled={disabled} onClick={() => setDialog({ kind: 'reset', apartment: a })}>
                  <KeyRound className="size-4" aria-hidden />
                  {t('admin.newCode')}
                </Button>
              </Card>
            );
          })}
          <form
            className="flex gap-2 sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api('POST', '/api/admin/apartments', { name: newName }),
                () => {
                  setNewName('');
                  toast(t('admin.saved'));
                },
              );
            }}
          >
            <input
              aria-label={t('admin.apartmentName')}
              placeholder={t('admin.apartmentName')}
              className={fieldClass}
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" disabled={disabled || !newName.trim()} className="shrink-0">
              <Plus className="size-4" aria-hidden />
              {t('admin.addApartment')}
            </Button>
          </form>
        </div>
      </section>

      <section>
        <SectionTitle>{t('admin.spaces')}</SectionTitle>
        <Card className="p-2">
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.spaces.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-2">
                <label htmlFor={`assign-${s.id}`} className="w-28 shrink-0 font-semibold">
                  {t('common.space', { number: s.number })}
                </label>
                <select
                  id={`assign-${s.id}`}
                  className={fieldClass}
                  value={s.apartmentId ?? ''}
                  disabled={disabled}
                  aria-label={`${t('common.space', { number: s.number })} – ${t('admin.assignedTo')}`}
                  onChange={(e) =>
                    void run(() => api('PATCH', `/api/admin/spaces/${s.id}`, { apartmentId: e.target.value || null }))
                  }
                >
                  <option value="">{t('admin.unassigned')}</option>
                  {data.apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <SectionTitle>{t('admin.schedules')}</SectionTitle>
        <Card className="p-2">
          {data.schedules.length === 0 ? (
            <p className="p-2 text-sm text-slate-600">{t('admin.noSchedules')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.schedules.map((s) => (
                <li key={s.id} className="flex items-center gap-2 p-2">
                  <span className="w-10 shrink-0 text-center text-xl font-extrabold">{spaceNumber(s.parkingSpaceId)}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {s.recurrenceType === 'none' ? fmt.range(Date.parse(s.start), Date.parse(s.end), now) : fmt.recurrence(s)}
                    {!s.isActive && (
                      <span className="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{t('manage.paused')}</span>
                    )}
                  </span>
                  {s.recurrenceType !== 'none' && (
                    <IconButton
                      label={s.isActive ? t('manage.pause') : t('manage.resume')}
                      disabled={disabled}
                      onClick={() => void run(() => api('POST', `/api/admin/schedules/${s.id}/${s.isActive ? 'pause' : 'resume'}`, {}))}
                    >
                      {s.isActive ? <Pause className="size-[18px]" aria-hidden /> : <Play className="size-[18px]" aria-hidden />}
                    </IconButton>
                  )}
                  <IconButton label={t('common.delete')} disabled={disabled} onClick={() => setDialog({ kind: 'deleteSchedule', schedule: s })}>
                    <Trash2 className="size-[18px]" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>{t('admin.reservations')}</SectionTitle>
        <Card className="p-2">
          {(data.reservations ?? []).length === 0 ? (
            <p className="p-2 text-sm text-slate-600">{t('admin.noReservations')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.reservations.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-2">
                  <span className="w-10 shrink-0 text-center text-xl font-extrabold text-orange-700">{r.spaceNumber}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {fmt.range(Date.parse(r.start), Date.parse(r.end), now)}
                    <span className="block text-xs text-slate-500">{r.apartmentName}</span>
                  </span>
                  <IconButton
                    label={t('manage.cancelReservation')}
                    disabled={disabled}
                    onClick={() => setDialog({ kind: 'cancelReservation', reservation: r })}
                  >
                    <Trash2 className="size-[18px]" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>{t('admin.activity')}</SectionTitle>
        <Card className="p-2">
          {activity.length === 0 ? (
            <p className="p-2 text-sm text-slate-600">{t('admin.noActivity')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} fmt={fmt} now={now} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <ConfirmSheet
        open={dialog?.kind === 'reset'}
        title={t('admin.newCodeConfirmTitle')}
        text={dialog?.kind === 'reset' ? t('admin.newCodeConfirmText', { name: dialog.apartment.name }) : ''}
        confirmLabel={t('admin.newCode')}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'reset') return;
          const apartment = dialog.apartment;
          void run(
            () => api<{ code: string }>('POST', `/api/admin/apartments/${apartment.id}/reset-code`, {}),
            ({ code }) => setDialog({ kind: 'code', apartment, code }),
          );
        }}
      />

      <Sheet
        open={dialog?.kind === 'code'}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'code' ? t('admin.newCodeTitle', { name: dialog.apartment.name }) : ''}
      >
        {dialog?.kind === 'code' && (
          <div className="flex flex-col gap-4">
            <p
              className="rounded-2xl bg-slate-100 py-5 text-center font-mono text-4xl font-bold tracking-[0.2em]"
              data-testid="new-code"
            >
              {dialog.code.replace(/(\d{4})(?=\d)/g, '$1 ')}
            </p>
            <Alert tone="info">{t('admin.newCodeHint')}</Alert>
            <Button onClick={() => setDialog(null)}>{t('common.done')}</Button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={dialog?.kind === 'deleteApartment'}
        title={dialog?.kind === 'deleteApartment' ? t('admin.deleteApartmentTitle', { name: dialog.apartment.name }) : ''}
        text={t('admin.deleteApartmentText')}
        confirmLabel={t('common.delete')}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          dialog?.kind === 'deleteApartment' && void run(() => api('DELETE', `/api/admin/apartments/${dialog.apartment.id}`))
        }
      />

      <ConfirmSheet
        open={dialog?.kind === 'deleteSchedule'}
        title={dialog?.kind === 'deleteSchedule' && dialog.schedule.recurrenceType !== 'none' ? t('confirm.deleteSeriesTitle') : t('confirm.deleteTitle')}
        text={dialog?.kind === 'deleteSchedule' && dialog.schedule.recurrenceType !== 'none' ? t('confirm.deleteSeriesText') : t('confirm.deleteText')}
        confirmLabel={t('common.delete')}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          dialog?.kind === 'deleteSchedule' &&
          void run(() => api('DELETE', `/api/admin/schedules/${dialog.schedule.id}?scope=series`))
        }
      />

      <ConfirmSheet
        open={dialog?.kind === 'cancelReservation'}
        title={t('confirm.cancelReservationTitle')}
        text={t('confirm.cancelReservationText')}
        confirmLabel={t('manage.cancelReservation')}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          dialog?.kind === 'cancelReservation' &&
          void run(() => api('DELETE', `/api/admin/reservations/${dialog.reservation.id}`))
        }
      />
    </div>
  );
}

function ActivityRow({ entry, fmt, now }: { entry: ActivityEntry; fmt: Formatters; now: number }) {
  const { t, i18n } = useTranslation();
  const d = entry.details as Record<string, string | number | undefined>;
  const space = d.spaceNumber ?? entry.spaceNumber;
  const key =
    entry.action === 'space.assigned' && !entry.apartmentName ? 'space_unassigned' : entry.action.replace(/\./g, '_');
  const text = i18n.exists(`activity.${key}`)
    ? t(`activity.${key}`, {
        space,
        apartment: entry.apartmentName ?? '–',
        name: d.name ?? entry.apartmentName ?? '–',
        from: d.from,
        to: d.to,
      })
    : t('activity.unknown');
  const actor = entry.actor === 'admin' ? t('admin.administrator') : (entry.apartmentName ?? '–');
  const period =
    entry.action === 'occurrence.cancelled' && typeof d.occurrenceDate === 'string'
      ? fmt.isoDate(d.occurrenceDate, true)
      : typeof d.start === 'string' && typeof d.end === 'string'
        ? fmt.range(Date.parse(d.start), Date.parse(d.end), now)
        : null;

  return (
    <li className="p-2 text-sm">
      <p className="font-medium">{text}</p>
      <p className="text-xs text-slate-500">
        {[fmt.fullDateTime(Date.parse(entry.createdAt)), actor, period].filter(Boolean).join(' · ')}
      </p>
    </li>
  );
}
