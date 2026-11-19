# Quiz Knights at the Forester's Arms

<https://pubquiz.emilio.co.za>

An incredibly simple single page site with the purpose of displaying statistics about the Quiz Knights, a pub quiz team at the Forester's Arms, Cape Town, South Africa.

The web app lives in `packages/web`. Quiz results live in the shared `packages/data/data.json` package, because who has time for databases?

Validate the results with `npm run validate:data`. The command checks dates, category scores (0–5 in half-point steps), double-up category names, five positive round positions, duplicate dates, chronological order, and unexpected or missing fields. It exits with an error and reports each invalid field if a check fails.
The same rules are available to other workspaces through `@quiz-knights/data/validation` as `validateResult` and `validateData`.

Install Node.js 21 (or run `nix develop`), then install all workspace dependencies from the repository root:

```sh
npm ci
npm run dev:web
```

The local TypeScript importer web app is in `packages/importer`. It currently displays Hello World. Run it with `npm run dev:importer`.

The root `package.json` defines the npm workspaces and shared development tools. Netlify builds the web workspace using `netlify.toml` and publishes `packages/web/dist`.
