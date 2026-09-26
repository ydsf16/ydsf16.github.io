import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://tinygrape.com.cn',
  integrations: [mdx(), sitemap()],
  markdown: { shikiConfig: { theme: 'github-light' } }
});
