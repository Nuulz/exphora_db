// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://nuulz.github.io',
  base: '/Exphora_db',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  }
});