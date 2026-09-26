export type Locale = 'en' | 'zh';

export const siteCopy = {
  en: {
    nav: { products: 'Products', projects: 'Projects', notes: 'Notes', openSource: 'Open Source', about: 'About' },
    heroEyebrow: 'APPS · ROBOTICS · AVIATION · AI',
    heroTitle: 'Building useful and interesting things.',
    heroBody: 'TinyGrape Lab is a personal technology lab exploring apps, robotics, aviation and AI.',
    primary: 'Explore the lab',
    secondary: 'About the lab',
    productsTitle: 'Tools made to be used',
    productsBody: 'Small, focused products for collecting signals, making sense of the world, and moving ideas forward.',
    projectsTitle: 'Experiments in the open',
    projectsBody: 'Research notes and prototypes across sensing, spatial intelligence, robotics and aviation.',
    notesTitle: 'Notes from the workbench',
    openSourceTitle: 'Open source, where it helps',
    openSourceBody: 'Code, datasets and practical experiments shared for people building in similar directions.',
    viewAll: 'View all',
    aboutTitle: 'A personal technology lab',
    aboutBody: 'TinyGrape Lab is an independent home for useful apps, careful experiments and long-form technical notes.',
    footer: 'Small ideas. Big explorations.'
  },
  zh: {
    nav: { products: '产品', projects: '项目', notes: '技术笔记', openSource: '开源', about: '关于' },
    heroEyebrow: '应用 · 机器人 · 航空 · AI',
    heroTitle: '做有用、也有趣的东西。',
    heroBody: 'TinyGrape Lab 是一个探索应用、机器人、航空与人工智能的个人技术实验室。',
    primary: '探索实验室',
    secondary: '了解实验室',
    productsTitle: '做出来，拿来用',
    productsBody: '专注于采集信号、理解世界和推进想法的小型工具。',
    projectsTitle: '公开进行的实验',
    projectsBody: '围绕传感、空间智能、机器人与航空展开的研究记录和原型。',
    notesTitle: '工作台边的笔记',
    openSourceTitle: '在合适的地方开源',
    openSourceBody: '分享代码、数据和实用实验，帮助正在探索相似方向的人。',
    viewAll: '查看全部',
    aboutTitle: '一个个人技术实验室',
    aboutBody: 'TinyGrape Lab 是一个独立空间，用来放置有用的应用、严谨的实验和长期技术笔记。',
    footer: '小想法，大探索。'
  }
} as const;

export function localizedPath(path: string, locale: Locale) {
  return `/${locale}${path === '/' ? '' : path}`;
}
