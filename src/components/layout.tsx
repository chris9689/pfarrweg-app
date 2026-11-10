import { CalendarX2, Car, LayoutGrid, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import { LANGUAGES } from '../i18n/detect';
import { useFormatters } from '../lib/format';
import { useNow, useOnline } from '../lib/hooks';
import { useNotices } from '../lib/notices';
import { DEFAULT_TIMEZONE, useOverview } from '../lib/overview';
import { cx } from '../lib/ui-helpers';
import { Button, useToast } from './ui';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('language.label')} className="flex rounded-full bg-slate-100 p-1">
      {LANGUAGES.map(({ code, label }) => {
        const active = i18n.language === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            aria-label={t(`language.${code}`)}
            onClick={() => changeLanguage(code)}
            className={cx(
              'min-h-9 min-w-11 rounded-full px-3 text-sm font-bold transition',
              active ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Header() {
  const { t } = useTranslation();
  const { data } = useOverview();
  const subtitle = [data?.buildingName, data ? t('app.spaceCount', { count: data.spaces.length }) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
          <img src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-xl" />
          <span className="flex min-w-0 flex-col">
            <span className="text-lg font-extrabold leading-tight tracking-tight text-primary">{t('app.name')}</span>
            {subtitle && <span className="truncate text-xs font-medium text-slate-500">{subtitle}</span>}
          </span>
        </NavLink>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  const toast = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast(t('toast.backOnline'));
    }
  }, [online, toast, t]);

  if (online) return null;
  return (
    <div role="status" className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 text-sm font-semibold sm:px-6">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        {t('offline.banner')} {t('offline.editingDisabled')}
      </div>
    </div>
  );
}

export function Notices() {
  const { t } = useTranslation();
  const { notices, dismiss } = useNotices();
  const { data } = useOverview();
  const fmt = useFormatters(data?.timezone ?? DEFAULT_TIMEZONE);
  const now = useNow();
  if (notices.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-3" data-testid="notices">
      {notices.map((n) => {
        const vars = { number: n.spaceNumber, range: fmt.range(Date.parse(n.start), Date.parse(n.end), now) };
        return (
          <div key={n.id} role="status" className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <CalendarX2 className="mt-0.5 size-5 shrink-0 text-orange-700" aria-hidden />
            <div className="min-w-0 flex-1 text-orange-950">
              <p className="font-bold">{t('notices.cancelledTitle')}</p>
              <p className="text-sm">
                {n.cancelledBy
                  ? t('notices.cancelledByOwner', { ...vars, name: n.cancelledBy })
                  : t('notices.cancelledByAdmin', vars)}
              </p>
              {n.message && <p className="mt-1 break-words text-sm italic">{t('notices.message', { message: n.message })}</p>}
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => void dismiss(n.id)}>
              {t('notices.dismiss')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/', label: t('nav.overview'), Icon: LayoutGrid },
    { to: '/my', label: t('nav.mySpaces'), Icon: Car },
  ];
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-3xl">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition',
                isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-800',
              )
            }
          >
            <Icon className="size-6" aria-hidden />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
