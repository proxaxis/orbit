// @ts-check
import { defineConfig } from 'astro/config';

import vue from '@astrojs/vue';

// https://astro.build/config
export default defineConfig({
  integrations: [vue()],
  server: {
    allowedHosts: ['doc-orbit.proxaxis.me'],
  },
});
