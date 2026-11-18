# Score importer design

## Purpose

Build a local web app to record Quiz Knights results from exported WhatsApp chats. It is a personal tool: clear review and reliable saving matter more than visual polish or support for other people's machines.

A local SQLite database is the source of truth. Opening the app should show previously imported images, decisions, and results without requiring a ZIP file.

This document describes the intended workflow. The importer supports ZIP imports, persistent classification, local notes, recording scoresheet results, and saving results.

## Input

Each new input is a WhatsApp chat export ZIP containing images and a message transcript. The app should offer an **Import chat history ZIP** button. A local launcher that accepts the ZIP path as a command-line argument would also be useful. Both entry points should add to the same database and open the same review workflow.

Importing another ZIP must merge new content with the existing database. An exact repeat of a successfully imported ZIP can be skipped using its SHA-256 hash. For an overlapping export, inspect the archive, reuse known images by content hash, and preserve existing classifications, recordings, notes, and manual edits. The default review list should show new or unfinished items, with filters to revisit older ones.

Show images in chat order, oldest first, using the transcript timestamps where available.

## Workflow

There are two broad phases: **classify images** and **record results**. The interface should allow moving between these activities at any time.

### 1. Categorize images

Show one image at a time and assign a classification:

| Classification | Meaning |
| --- | --- |
| Unclassified | The image has not been categorized yet. |
| Scoresheet | The image shows a quiz score sheet, even if some details are missing. |
| Other | The image is irrelevant to score recording. |

After a classification, advance to the next image. Keep **Other** images out of recording, while retaining their decisions in SQLite. **Unreviewed** contains unclassified images and scoresheets without saved results; **Reviewed** contains Other images and scoresheets with saved results.

### 2. Record and save results

Review each scoresheet and enter its quiz date, category scores, double-up category, and five round positions when the information is available. These are the fields represented in `packages/data/data.json`. Keep extra context or missing details in local SQLite notes on the scoresheet.

Persist edits in SQLite as work progresses. **Save** commits complete recordings in SQLite, leaves unfinished drafts for later review, and regenerates `packages/data/data.json` from the approved database records. Notes remain only in SQLite. Write the JSON file atomically so the website never sees a partial export. If exporting fails, show the error and allow **Save** to be retried without losing the database changes.

## Local data and identity

The local SQLite database stores imported transcript entries, attachment bytes and metadata, ZIP import history, classifications, notes, draft recordings, processing responses if automation is added, and approved results. The original ZIP is not needed after a successful import. Keep the database local; it is not part of the Netlify deployment.

Use the SHA-256 hash of an image's contents to recognize it across ZIPs. Keep its occurrences in chat separate so repeated attachments can retain their dates and message context. Key a recording by its image hash. Reusing an image must not trigger another classification or overwrite a manual decision; reprocessing should require an explicit action.

`packages/data/data.json` will become a generated snapshot for the static web app. SQLite remains authoritative; the website does not read the local database directly.

## Interface proposal

- **Categorize:** Image list on the left, selected image in the middle, and classification actions on the right. Classification advances to the next image. Filters show Unclassified, Scoresheet, Other, Unreviewed, and Reviewed images.
- **Record:** Scoresheet list on the left, image in the middle, and editable result fields and notes on the right.

## Open questions

- How should score sheets with missing or ambiguous chat timestamps be ordered?
- How should duplicate image attachments with the same hash appear in the review list?
- How should overlapping exports identify the same text message if the transcript format provides no stable message ID?
- When saving results, how should the app handle a quiz date that already has an approved database result?
- Where should the local SQLite file live, and how should it be backed up?
- Should results posted only as chat text be imported? One possible starting heuristic is to look for messages containing several quiz category names, then review matches manually.
