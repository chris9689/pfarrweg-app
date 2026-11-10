import { Ban, BookmarkCheck, CircleCheck, Clock, Loader2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/ui-helpers';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'reserve';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300',
  reserve:
    'bg-white text-orange-700 border-2 border-orange-500 hover:bg-orange-50 disabled:border-slate-300 disabled:text-slate-400',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'md' ? 'min-h-12 px-4 text-[15px]' : 'min-h-10 gap-1.5 px-3 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:text-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{children}</h2>
      {aside}
    </div>
  );
}

export type StatusKind = 'available' | 'upcoming' | 'reserved' | 'occupied';

const TILE_STYLES: Record<StatusKind, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-amber-100 text-amber-900',
  reserved: 'bg-orange-600 text-white',
  occupied: 'bg-slate-100 text-slate-700',
};

export function SpaceTile({ number, kind, size = 'md' }: { number: number; kind: StatusKind; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center rounded-xl font-extrabold tracking-tight',
        size === 'md' ? 'size-12 text-2xl' : 'size-10 text-lg',
        TILE_STYLES[kind],
      )}
    >
      {number}
    </span>
  );
}

const PILL_STYLES: Record<StatusKind, string> = {
  available: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  upcoming: 'bg-amber-100 text-amber-900 ring-amber-200',
  reserved: 'bg-orange-100 text-orange-800 ring-orange-400',
  occupied: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const PILL_ICONS = { available: CircleCheck, upcoming: Clock, reserved: BookmarkCheck, occupied: Ban };

export function StatusPill({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  const Icon = PILL_ICONS[kind];
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-start gap-1 rounded-2xl px-2.5 py-1 text-left text-xs font-bold leading-tight ring-1 ring-inset',
        PILL_STYLES[kind],
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-12 text-slate-500" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-xl px-3 py-2.5 text-sm font-medium',
        tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </p>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens (native <dialog> for focus handling). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/45 backdrop:backdrop-blur-sm sm:mb-auto sm:rounded-2xl"
    >
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id="sheet-title" className="pt-1.5 text-xl font-bold tracking-tight">
              {title}
            </h2>
            <IconButton label={t('common.close')} onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-5" aria-hidden />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmSheet({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy,
  children,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-slate-600">{text}</p>
      {children}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel ?? t('common.cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- toasts ----------

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'max-w-md rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg',
              toast.tone === 'success' ? 'bg-slate-900' : 'bg-rose-700',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
