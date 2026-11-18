# Quiz Knights importer

Local TypeScript web app for reviewing score sheets from WhatsApp exports.

The proposed importer workflow is in [docs/DESIGN.md](docs/DESIGN.md).

Use Node.js 22.13 or newer. Run from the repository root:

```sh
npm ci
npm run dev:importer
```

Open the localhost URL printed by Vite. Import a ZIP, classify images, and record scoresheet results. The app stores imports and work in `packages/importer/.local/importer.sqlite`; this file is ignored by Git. **Save** updates SQLite and `packages/data/data.json`.
