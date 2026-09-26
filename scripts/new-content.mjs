import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const kind = process.argv[2];
const slug = process.argv[3];
const languages = (process.argv.find((arg) => arg.startsWith('--langs='))?.split('=')[1] || 'en,zh').split(',').filter(Boolean);

if (!['product', 'project', 'note'].includes(kind) || !slug) {
  console.error('Usage: npm run new:product -- <slug> [--langs=en,zh]');
  console.error('       npm run new:project -- <slug> [--langs=en,zh]');
  console.error('       npm run new:note -- <slug> [--langs=en,zh]');
  process.exit(1);
}

const title = slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
const templates = {
  product: `type: product\ntitle: ${title}\nlang: LANG\nstatus: experimental\nfeatured: false\npriority: 0\nplatforms: []\nfeatures: []\nuseCases: []\ncategories: []\ntags: []\n---\nDescribe what this product does.`,
  project: `type: project\ntitle: ${title}\nlang: LANG\nstatus: exploring\nfeatured: false\npriority: 0\ncategories: []\ntags: []\n---\nDescribe the project, its question and current result.`,
  note: `type: note\ntitle: ${title}\nlang: LANG\ndate: ${new Date().toISOString().slice(0, 10)}\ntags: []\ncategories: []\ndraft: true\n---\nStart the note here.`
};

for (const lang of languages) {
  const extension = kind === 'note' ? 'md' : 'md';
  const file = join('src', 'content', `${kind}s`, slug, `${lang}.${extension}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `---\n${templates[kind].replace('LANG', lang)}\n`, 'utf8');
}
await mkdir(join('public', 'media', kind, slug), { recursive: true });
console.log(`Created ${kind} '${slug}' for: ${languages.join(', ')}`);
