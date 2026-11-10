import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { BottomNav, Header, Notices, OfflineBanner } from './components/layout';
import { UpdatePrompt } from './components/pwa';
import { Spinner, ToastProvider } from './components/ui';
import { NoticesProvider } from './lib/notices';
import { OverviewProvider } from './lib/overview';
import MyPage from './pages/MyPage';
import OverviewPage from './pages/OverviewPage';

const AdminPage = lazy(() => import('./pages/AdminPage'));

export default function App() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = t('app.title');
  }, [t, i18n.language]);

  return (
    <ToastProvider>
      <OverviewProvider>
        <NoticesProvider>
          <div className="min-h-dvh">
            <Header />
            <OfflineBanner />
            <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-6">
              {pathname !== '/admin' && <Notices />}
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/my" element={<MyPage />} />
                <Route
                  path="/admin"
                  element={
                    <Suspense fallback={<Spinner />}>
                      <AdminPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            {pathname !== '/admin' && <BottomNav />}
            <UpdatePrompt />
          </div>
        </NoticesProvider>
      </OverviewProvider>
    </ToastProvider>
  );
}
