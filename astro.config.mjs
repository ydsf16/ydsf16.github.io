import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://tinygrape.com.cn',
  integrations: [mdx(), sitemap()],
  markdown: { shikiConfig: { theme: 'github-light' }, remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }
});
