# Score importer design

## Purpose

Build a local web app to record Quiz Knights results from an exported WhatsApp chat. It is a personal tool: clear review and reliable saving matter more than visual polish or support for other people's machines.

This document describes the intended workflow. The current importer app is only a Hello World starter.

## Input

The input is a WhatsApp chat export ZIP containing images and a message transcript. The app should offer an **Import chat history ZIP** button. A local launcher that accepts the ZIP path as a command-line argument would also be useful. Both entry points should open the same review workflow.

Show images in chat order, oldest first, using the transcript timestamps where available.

## Workflow

There are two broad phases: **prepare score sheets** (categorize and group images) and **record results**. The interface should allow moving between these activities at any time.

### 1. Categorize images

Show one image at a time and assign one of three classifications:

| Classification | Meaning |
| --- | --- |
| Complete score sheet | One image contains everything needed to record a quiz result. |
| Incomplete score sheet | This image needs one or more other images to make a complete result. |
| Other | The image is irrelevant to score recording. |

After a classification, advance to the next image. Keep **Other** images out of grouping and recording, while retaining their decisions in the local draft.

### 2. Group incomplete score sheets

Combine two or more **Incomplete score sheet** images into a single complete score sheet. A standalone **Complete score sheet** remains a valid, single-image result. Before saving results, every incomplete image should either belong to a group or be reclassified.

A group is one level deep: it contains images, not other groups. Changing group membership must update the group's identity and flag any existing recording for review.

### 3. Record and save results

Review each complete score sheet, whether it is a single image or a group, and enter its quiz date, category scores, double-up category, and five round positions. These are the fields currently stored in `packages/data/data.json`.

Save edits to the local draft as work progresses. Once classifications, groups, and recordings are satisfactory, **Save results** writes the reviewed records to `packages/data/data.json`.

## Draft data

Persist decisions locally in JSON so a session can be resumed. Key each image's classification by the SHA-256 hash of its contents. Store grouping and recorded fields in the same draft, separate from the published results file. Key a single-image recording by its image hash and a grouped recording by its group hash.

For a grouped score sheet, sort its member image hashes, concatenate them, and SHA-256 hash the result. This gives the group the same identity regardless of the order in which its images were selected.

## Interface proposal

- **Categorize:** Image list on the left, selected image in the main area, and the three classification actions nearby. Classification advances to the next image. Filters on the list can show the union of selected classifications.
- **Group:** Show incomplete images and their groups. Dragging images together could create or extend a group; dragging one out could split it. If removing an image leaves a group with one member, return that member to the ungrouped list.
- **Record:** Score-sheet list on the left, image or grouped images in the center, and editable result fields on the right. Put **Save results** at the bottom right.

## Open questions

- Is drag-and-drop grouping worth the complexity, or would selecting images and clicking **Group** be clearer?
- How should score sheets with missing or ambiguous chat timestamps be ordered?
- How should duplicate image attachments with the same hash appear in the review list?
- When saving results, how should the app handle a quiz date that is already in the published data?
- Should results posted only as chat text be imported? One possible starting heuristic is to look for messages containing several quiz category names, then review matches manually.
