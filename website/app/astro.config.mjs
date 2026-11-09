// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vue from '@astrojs/vue';

const isProduction = import.meta.env.VITE_NODE_ENV === 'production' || import.meta.env.NODE_ENV === 'production';
// Cloudflare Pages 向けは静的出力（Docker デプロイは従来どおり node SSR）
const isCloudflarePages = Boolean(process.env.CF_PAGES);
// https://astro.build/config
export default defineConfig({
  output: isCloudflarePages ? 'static' : 'server',
  adapter: isCloudflarePages ? undefined : node({
    mode: 'standalone',
  }),
  integrations: [vue()],
  server: {
    allowedHosts: ['orbit.proxaxis.me', 'doc.orbit.proxaxis.me', 'doc-orbit.proxaxis.me', 'docs-orbit.proxaxis.me'],
    host: true,
    port: isProduction ? 14321 : 4321,
  },
});
