# jolt-ts-character-controller — documentation site

The documentation site for
[`jolt-ts-character-controller`](../), built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

Docs content lives in `src/content/docs/` as `.md` / `.mdx` files. The sidebar
and site config are in `astro.config.mjs`.

## Commands

This package is part of the repo's pnpm workspace. Install once from the repo
root (`pnpm install`), then run these from **this** `docs/` directory:

| Command | Action |
| :------ | :----- |
| `pnpm dev` | Start the local dev server at `localhost:4321` |
| `pnpm build` | Build the production site to `./dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm astro ...` | Run Astro CLI commands (`astro check`, `astro add`, …) |

From the repo root you can also target this package directly, e.g.
`pnpm --filter docs build`.

## Editing the docs

- Add a page: create a `.md`/`.mdx` file under `src/content/docs/` and add it to
  the `sidebar` in `astro.config.mjs`.
- Page front matter needs at least a `title`; a `description` is recommended.
- Keep code examples accurate to the library's public API (exported from the
  package root).
