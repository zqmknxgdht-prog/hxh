import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      // Bundle 分割: 大きな data JSON と react を別 chunk へ。初回ロードで
      // JS パース時間が短くなり、データ更新時の JS chunk キャッシュ効きが効く。
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'vendor-react';
            }
            if (id.endsWith('/data/nodes.json')) return 'data-nodes';
            if (id.endsWith('/data/avatar-svg.json')) return 'data-avatars';
            if (id.includes('/data/') && id.endsWith('.json')) return 'data-meta';
          },
        },
      },
      // 既定 500KB は data chunk 単独で超えるため少し上げる (新 chunk 戦略の
      // 上で意味のある上限)
      chunkSizeWarningLimit: 700,
    },
  };
});
