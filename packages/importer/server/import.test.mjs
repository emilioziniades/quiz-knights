import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { strToU8, zipSync } from "fflate"
import { imageHash, openStore } from "./db.mjs"
import { importArchive, parseChat } from "./import.mjs"

const scores = Object.fromEntries([
  "history", "geography", "science", "sport", "music", "art", "guest",
  "current_affairs", "general_knowledge", "film",
].map((name) => [name, 3]))
const record = (date) => ({
  date, category_scores: scores, double_up_category: "history",
  round_position: [1, 2, 3, 4, 5],
})

test("parses common WhatsApp timestamps and multiline messages", () => {
  const ios = parseChat("[08/02/2024, 9:15:00 AM] Alex: IMG-1.jpg\ncontinued")
  const android = parseChat("08/02/24, 09:15 - Alex: IMG-1.jpg")
  assert.equal(ios[0].body, "Alex: IMG-1.jpg\ncontinued")
  assert.equal(ios[0].timestampMs, android[0].timestampMs)
})

test("rejects a text-only chat export without recording a successful import", () => {
  const directory = mkdtempSync(join(tmpdir(), "quiz-knights-importer-"))
  const store = openStore(join(directory, "importer.sqlite"), join(directory, "data.json"))
  const archive = zipSync({
    "chat.txt": strToU8("[08/02/2024, 9:15:00 AM] Alex: Hello"),
    "chat.md": strToU8("A text-only export"),
  })
  try {
    assert.throws(() => importArchive(store, archive, "text-only.zip"), /with media/)
    assert.equal(store.counts().imports, 0)
    assert.equal(store.counts().images, 0)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("keeps decisions across overlapping ZIP imports and exports saved results", () => {
  const directory = mkdtempSync(join(tmpdir(), "quiz-knights-importer-"))
  const databasePath = join(directory, "importer.sqlite")
  const exportPath = join(directory, "data.json")
  writeFileSync(exportPath, JSON.stringify([record("2024-02-01")]))
  const firstImage = strToU8("first-image")
  const secondImage = strToU8("second-image")
  const firstZip = zipSync({
    "_chat.txt": strToU8("[08/02/2024, 9:15:00 AM] Alex: IMG-1.jpg"),
    "IMG-1.jpg": firstImage,
  })
  const overlappingZip = zipSync({
    "_chat.txt": strToU8("[08/02/2024, 9:15:00 AM] Alex: IMG-1.jpg\n[15/02/2024, 9:15:00 AM] Alex: IMG-2.jpg"),
    "IMG-1.jpg": firstImage,
    "IMG-2.jpg": secondImage,
  })
  try {
    let store = openStore(databasePath, exportPath)
    assert.equal(store.counts().results, 1)
    assert.deepEqual(importArchive(store, firstZip, "first.zip"),
      { skipped: false, newImages: 1, images: 1, messages: 1 })
    const hash = imageHash(firstImage)
    store.setClassification(hash, "complete")
    store.setDraft(hash, record("2024-02-08"))
    assert.deepEqual(store.save(), { results: 2 })
    assert.deepEqual(JSON.parse(readFileSync(exportPath, "utf8")).map((item) => item.date),
      ["2024-02-01", "2024-02-08"])
    store.close()

    store = openStore(databasePath, exportPath)
    assert.deepEqual(importArchive(store, firstZip, "again.zip"),
      { skipped: true, newImages: 0, images: 0, messages: 0 })
    assert.deepEqual(importArchive(store, overlappingZip, "second.zip"),
      { skipped: false, newImages: 1, images: 2, messages: 2 })
    assert.equal(store.counts().imports, 2)
    assert.equal(store.counts().images, 2)
    assert.equal(store.listImages().find((image) => image.hash === hash).classification, "complete")
    assert.equal(store.listImages().find((image) => image.hash === hash).filename, "IMG-1.jpg")
    assert.equal(store.listImages().find((image) => image.hash === hash).occurrences, 2)
    assert.equal(store.listImages().find((image) => image.hash === hash).saved_date, "2024-02-08")
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("rejects a conflicting result without changing published data", () => {
  const directory = mkdtempSync(join(tmpdir(), "quiz-knights-importer-"))
  const exportPath = join(directory, "data.json")
  writeFileSync(exportPath, JSON.stringify([record("2024-02-01")]))
  const store = openStore(join(directory, "importer.sqlite"), exportPath)
  try {
    const image = strToU8("image")
    importArchive(store, zipSync({ "IMG.jpg": image }), "chat.zip")
    const hash = imageHash(image)
    store.setClassification(hash, "complete")
    store.setDraft(hash, record("2024-02-01"))
    assert.throws(() => store.save(), /already exists/)
    assert.equal(store.counts().results, 1)
    assert.equal(JSON.parse(readFileSync(exportPath, "utf8")).length, 1)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
