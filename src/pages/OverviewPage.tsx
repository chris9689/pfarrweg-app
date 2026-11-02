import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DAY_MS } from '../../shared/recurrence';
import { buildOverview } from '../../shared/status';
import { InstallHint } from '../components/pwa';
import { Alert, Button, Card, SectionTitle, Spinner, SpaceTile, StatusPill } from '../components/ui';
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
  const fmt = useFormatters(data?.timezone ?? DEFAULT_TIMEZONE);

  if (!data) return <OverviewLoading onRetry={refresh} />;

  const model = buildOverview(data.spaces, data.blocks, now);
  const free = model.availableNow.length;

  return (
    <div className="flex flex-col gap-6">
      <StaleNotice />

      <Card className="p-5">
        {fetchedAt && (
          <p className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            {t('overview.updated', { time: fmt.time(fetchedAt) })}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" data-testid="available-count">
          {t('overview.availableNow', { count: free })}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t('overview.hint')}</p>

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
                </div>
                <span className="shrink-0 text-right text-xs font-bold text-emerald-800">
                  {t('status.timeLeft', { duration: fmt.duration(until - now) })}
                </span>
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
                  </div>
                  {u.start - now < DAY_MS && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                      {t('status.startsIn', { duration: fmt.duration(u.start - now) })}
                    </span>
                  )}
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
          {model.spaces.map(({ space, state }) => (
            <li
              key={space}
              data-testid={`space-${space}`}
              data-status={state.kind}
              className={cx(
                'flex flex-col gap-2 rounded-xl border p-3',
                state.kind === 'available' && 'border-emerald-200 bg-emerald-50/70',
                state.kind === 'upcoming' && 'border-amber-200 bg-amber-50/60',
                state.kind === 'occupied' && 'border-slate-200 bg-white',
              )}
            >
              <span className="text-2xl font-extrabold leading-none tracking-tight">
                <span className="sr-only">{t('common.space', { number: space })}: </span>
                {space}
              </span>
              <StatusPill kind={state.kind}>{stateLabel(state, fmt, now, t)}</StatusPill>
            </li>
          ))}
        </ul>
      </section>

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
  const { failed } = useOverview();
  if (!failed) return <Spinner />;
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Alert>{t('overview.loadError')}</Alert>
      <Button variant="secondary" onClick={() => void onRetry()}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
