// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vue from '@astrojs/vue';

const isProduction = import.meta.env.VITE_NODE_ENV === 'production' || import.meta.env.NODE_ENV === 'production';
// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [vue()],
  server: {
    allowedHosts: ['orbit.proxaxis.me', 'doc.orbit.proxaxis.me', 'doc-orbit.proxaxis.me'],
    host: true,
    port: isProduction ? 14321 : 4321,
  },
});
