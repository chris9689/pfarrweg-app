import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Serves /api/* locally from the same handlers used by the Vercel Function (with an in-memory database). */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'parkshare-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const mod = await server.ssrLoadModule('/server/dev.ts');
          await mod.handleDevRequest(env, req, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.png', 'logo.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Pfarrweg.APP',
          short_name: 'Pfarrweg.APP',
          description: 'Parken · Teilen · Gemeinsam',
          lang: 'de',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f8fafc',
          theme_color: '#1e40af',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,ics}'],
          // The branding sheet is only the source for `npm run icons`.
          globIgnores: ['**/Pfarrweg Parking App Branding.png'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
      devApi(env),
    ],
    server: {
      // OneDrive-synced folders need polling to avoid EBUSY errors.
      watch: { usePolling: true },
    },
  };
});
