import { BookmarkCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DAY_MS } from '../../shared/recurrence';
import { buildOverview } from '../../shared/status';
import { InstallHint } from '../components/pwa';
import { ParkingLot } from '../components/ParkingLot';
import { ReserveFlow, type ReserveTarget } from '../components/ReserveFlow';
import { Alert, Button, Card, SectionTitle, Sheet, Spinner, SpaceTile, StatusPill, useToast } from '../components/ui';
import { useFormatters } from '../lib/format';
import { useNow, useOnline } from '../lib/hooks';
import { DEFAULT_TIMEZONE, useOverview } from '../lib/overview';
import { cx, stateLabel } from '../lib/ui-helpers';

function StaleNotice() {
  const { t } = useTranslation();
  const online = useOnline();
  const { data, fetchedAt, failed } = useOverview();
  const fmt = useFormatters(data?.timezone ?? DEFAULT_TIMEZONE);
  if ((online && !failed) || !fetchedAt) return null;
  const stale = t('offline.stale', { time: fmt.fullDateTime(fetchedAt) });
  return <Alert tone="info">{online ? `${t('offline.refreshFailed')} ${stale}` : stale}</Alert>;
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const { data, fetchedAt, refresh } = useOverview();
  const now = useNow();
  const online = useOnline();
  const toast = useToast();
  const fmt = useFormatters(data?.timezone ?? DEFAULT_TIMEZONE);
  const [reserve, setReserve] = useState<{ key: number; target: ReserveTarget } | null>(null);

  if (!data) return <OverviewLoading onRetry={refresh} />;

  const reservations = data.reservations ?? [];
  const model = buildOverview(data.spaces, data.blocks, now, { reservations });
  const free = model.availableNow.length;
  const openReserve = (target: ReserveTarget) => setReserve({ key: Date.now(), target });
  const reserveButton = (target: ReserveTarget) => (
    <Button
      variant="reserve"
      size="sm"
      className="min-h-11 shrink-0 px-3"
      disabled={!online}
      title={t('reserve.action')}
      aria-label={`${t('common.space', { number: target.space })}: ${t('reserve.action')}`}
      onClick={() => openReserve(target)}
    >
      <BookmarkCheck className="size-5 sm:size-4" aria-hidden />
      <span className="hidden sm:inline">{t('reserve.action')}</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <StaleNotice />

      <Card className="p-5">
        {fetchedAt && (
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            {t('overview.updated', { time: fmt.time(fetchedAt) })}
          </p>
        )}
        <h1 className="sr-only" data-testid="available-count">
          {t('overview.availableNow', { count: free })}
        </h1>
        <ParkingLot
          bays={model.spaces.map(({ space, state }) => ({
            space,
            kind: state.kind,
            label: `${t('common.space', { number: space })}: ${stateLabel(state, fmt, now, t)}`,
          }))}
          onSelect={
            online
              ? ({ space }) => {
                  const state = model.spaces.find((s) => s.space === space)!.state;
                  if (state.kind === 'available') openReserve({ space, start: now, end: state.until });
                  if (state.kind === 'upcoming') openReserve({ space, start: state.from, end: state.until });
                }
              : undefined
          }
        />
        <p className="mt-3 text-sm text-slate-600">{t('overview.hint')}</p>

        {free > 0 && (
          <ul className="mt-4 flex flex-col gap-2.5">
            {model.availableNow.map(({ space, until }) => (
              <li
                key={space}
                className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
                data-testid={`available-${space}`}
              >
                <SpaceTile number={space} kind="available" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t('common.space', { number: space })}</p>
                  <p className="text-sm text-slate-700">{t('status.availableUntil', { time: fmt.moment(until, now) })}</p>
                  <p className="text-xs font-bold text-emerald-800">
                    {t('status.timeLeft', { duration: fmt.duration(until - now) })}
                  </p>
                </div>
                {reserveButton({ space, start: now, end: until })}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-labelledby="upcoming-title">
        <SectionTitle>
          <span id="upcoming-title">{t('overview.upcoming')}</span>
        </SectionTitle>
        <Card className="p-2">
          {model.upcoming.length === 0 ? (
            <p className="p-3 text-sm text-slate-600">{t('overview.upcomingEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {model.upcoming.map((u) => (
                <li key={`${u.space}-${u.start}`} className="flex items-center gap-3 rounded-xl p-2.5">
                  <SpaceTile number={u.space} kind="upcoming" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t('common.space', { number: u.space })}</p>
                    <p className="text-sm text-slate-600">{fmt.range(u.start, u.end, now)}</p>
                    {u.start - now < DAY_MS && (
                      <p className="text-xs font-bold text-amber-800">
                        {t('status.startsIn', { duration: fmt.duration(u.start - now) })}
                      </p>
                    )}
                  </div>
                  {reserveButton({ space: u.space, start: u.start, end: u.end })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="all-title">
        <SectionTitle>
          <span id="all-title">{t('overview.allSpaces')}</span>
        </SectionTitle>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {model.spaces.map(({ space, state }) => {
            const next = reservations
              .filter((r) => r.space === space && Date.parse(r.end) > now)
              .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
            return (
              <li
                key={space}
                data-testid={`space-${space}`}
                data-status={state.kind}
                className={cx(
                  'flex flex-col gap-2 rounded-xl border p-3',
                  state.kind === 'available' && 'border-emerald-200 bg-emerald-50/70',
                  state.kind === 'upcoming' && 'border-amber-200 bg-amber-50/60',
                  state.kind === 'reserved' && 'border-orange-400 bg-orange-50',
                  state.kind === 'occupied' && 'border-slate-200 bg-white',
                )}
              >
                <span className="text-2xl font-extrabold leading-none tracking-tight">
                  <span className="sr-only">{t('common.space', { number: space })}: </span>
                  {space}
                </span>
                <StatusPill kind={state.kind}>{stateLabel(state, fmt, now, t)}</StatusPill>
                {next && (
                  <p className="flex items-start gap-1 text-xs font-medium text-orange-900">
                    <BookmarkCheck className="mt-px size-3.5 shrink-0 text-orange-700" aria-hidden />
                    <span>
                      {state.kind === 'reserved'
                        ? t('overview.reservedBy', { name: next.apartment })
                        : t('overview.nextReservation', {
                            name: next.apartment,
                            range: fmt.range(Date.parse(next.start), Date.parse(next.end), now),
                          })}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet
        open={reserve !== null}
        onClose={() => setReserve(null)}
        title={reserve ? t('reserve.title', { number: reserve.target.space }) : ''}
      >
        {reserve && (
          <ReserveFlow
            key={reserve.key}
            target={reserve.target}
            timezone={data.timezone}
            onCancel={() => setReserve(null)}
            onDone={(message) => {
              setReserve(null);
              toast(message);
              void refresh();
            }}
          />
        )}
      </Sheet>

      <InstallHint />

      <div className="text-center">
        <Link to="/admin" className="inline-block p-2 text-sm text-slate-500 underline-offset-4 hover:underline">
          {t('overview.adminLink')}
        </Link>
      </div>
    </div>
  );
}

function OverviewLoading({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  const { failed, errorCode } = useOverview();
  if (!failed) return <Spinner />;
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Alert>{t('overview.loadError')}</Alert>
      {errorCode && <code className="text-xs text-slate-500">{errorCode}</code>}
      <Button variant="secondary" onClick={() => void onRetry()}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
