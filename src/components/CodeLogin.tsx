import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useFormatters } from '../lib/format';
import { useOnline } from '../lib/hooks';
import { Alert, Button } from './ui';

/** Apartment access-code entry; used on "My parking spaces" and inside the reservation step. */
export function CodeLoginForm({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const online = useOnline();
  const fmt = useFormatters('UTC');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/auth/login', { code });
      await onSuccess();
    } catch (err) {
      setError(errorMessage(err, t, fmt));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="access-code" className="mb-1.5 block text-sm font-semibold">
          {t('login.codeLabel')}
        </label>
        <input
          id="access-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={16}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          className="h-14 w-full rounded-xl border border-slate-300 bg-white text-center text-2xl font-bold tracking-[0.3em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={busy || !online || code.replace(/\D/g, '').length < 6} busy={busy}>
        {busy ? t('login.checking') : t('login.submit')}
      </Button>
    </form>
  );
}
