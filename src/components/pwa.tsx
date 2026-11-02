import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, Card, IconButton, useToast } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const DISMISS_KEY = 'parkshare.installDismissed';

export function UpdatePrompt() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      toast(t('toast.offlineReady'));
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast, t]);

  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-20 z-50 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-sm font-semibold text-white shadow-xl">
        <span className="flex-1">{t('pwa.updateAvailable')}</span>
        <Button variant="secondary" size="sm" className="border-0" onClick={() => updateServiceWorker(true)}>
          <RefreshCw className="size-4" aria-hidden />
          {t('pwa.update')}
        </Button>
      </div>
    </div>
  );
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallHint() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1' || isStandalone();
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || (!deferred && !isIos())) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="flex items-start gap-3">
      <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">{t('pwa.installTitle')}</p>
        <p className="text-sm text-slate-600">{deferred ? t('pwa.installText') : t('pwa.iosHint')}</p>
        {deferred && (
          <Button
            size="sm"
            className="mt-3"
            onClick={async () => {
              await deferred.prompt();
              setDeferred(null);
              dismiss();
            }}
          >
            {t('pwa.install')}
          </Button>
        )}
      </div>
      <IconButton label={t('pwa.dismiss')} onClick={dismiss} className="-mr-2 -mt-2">
        <X className="size-5" aria-hidden />
      </IconButton>
    </Card>
  );
}
