# TinyGrape Lab content model

The site uses three Astro content collections:

- `products` — things people can use or download.
- `projects` — experiments, prototypes and engineering explorations.
- `notes` — long-form technical writing.

Each entry lives in a directory with one Markdown file per language:

```text
src/content/products/<slug>/en.md
src/content/products/<slug>/zh.md
```

The validated fields are defined in `src/content.config.ts`. Homepage cards are generated from collection metadata (`featured` and `priority`), so adding an entry does not require editing a page template. The directory name is the stable URL slug; keeping it language-neutral avoids duplicate collection IDs while allowing localized pages.
