import { defineCollection, z } from 'astro:content';

const products = defineCollection({
  type: 'content',
  schema: z.object({
    type: z.literal('product'),
    slug: z.string().optional(), title: z.string(), lang: z.enum(['en', 'zh']),
    status: z.string().optional(), featured: z.boolean().default(false), priority: z.number().default(0),
    tags: z.array(z.string()).default([]), categories: z.array(z.string()).default([]), cover: z.string().optional(),
    platforms: z.array(z.string()).default([]),
    githubUrl: z.string().url().optional(),
    appStoreUrl: z.string().url().optional()
  })
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    type: z.literal('project'),
    slug: z.string().optional(), title: z.string(), lang: z.enum(['en', 'zh']),
    status: z.string().optional(), featured: z.boolean().default(false), priority: z.number().default(0),
    tags: z.array(z.string()).default([]), categories: z.array(z.string()).default([]), cover: z.string().optional(),
    githubUrl: z.string().url().optional()
  })
});

const notes = defineCollection({
  type: 'content',
  schema: z.object({
    type: z.literal('note'),
    slug: z.string().optional(), title: z.string(), lang: z.enum(['en', 'zh']),
    status: z.string().optional(), featured: z.boolean().default(false), priority: z.number().default(0),
    tags: z.array(z.string()).default([]), categories: z.array(z.string()).default([]), cover: z.string().optional(),
    date: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { products, projects, notes };
