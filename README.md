# TinyGrape Lab

Astro foundation for the TinyGrape Lab bilingual personal technology lab website.

## Local development

```bash
npm install
npm run dev
```

The first milestone includes the bilingual brand shell, responsive navigation, homepage, Products / Projects / Notes / Open Source / About / Privacy / Support routes, content collections with schema validation, and placeholder content for Sensor Recorder Pro, RoamShot, PhoneAI, robotics and one technical note.

## Checks

```bash
npm run check
npm run build
```

Temporary canonical site configuration is `https://tinygrape.com.cn` in `astro.config.mjs`. DNS, Cloudflare Pages authorization, custom-domain setup, and GitHub Pages decisions remain manual review items.

## Add content

```bash
npm run new:product -- sensor-kit --langs=en,zh
npm run new:project -- spatial-mapping --langs=en,zh
npm run new:note -- vio-scale --langs=en,zh
```

Each command creates bilingual Markdown front matter and a matching media directory. Product privacy and support URLs are generated from the product slug and intentionally contain placeholder text until approved wording is supplied.
