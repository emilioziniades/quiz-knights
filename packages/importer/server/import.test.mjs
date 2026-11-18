import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
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
    store.setClassification(hash, "scoresheet")
    store.setDraft(hash, record("2024-02-08"))
    store.setNotes(hash, "12th place out of 30, confirmed in chat")
    assert.deepEqual(store.save(), { results: 2 })
    const published = JSON.parse(readFileSync(exportPath, "utf8"))
    assert.deepEqual(published.map((item) => item.date), ["2024-02-01", "2024-02-08"])
    assert.equal(published[1].notes, undefined)
    store.close()

    store = openStore(databasePath, exportPath)
    assert.deepEqual(importArchive(store, firstZip, "again.zip"),
      { skipped: true, newImages: 0, images: 0, messages: 0 })
    assert.deepEqual(importArchive(store, overlappingZip, "second.zip"),
      { skipped: false, newImages: 1, images: 2, messages: 2 })
    assert.equal(store.counts().imports, 2)
    assert.equal(store.counts().images, 2)
    assert.equal(store.listImages().find((image) => image.hash === hash).classification, "scoresheet")
    assert.equal(store.listImages().find((image) => image.hash === hash).filename, "IMG-1.jpg")
    assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM image_occurrences WHERE image_hash = ?")
      .get(hash).count, 2)
    assert.equal(store.listImages().find((image) => image.hash === hash).saved_date, "2024-02-08")
    assert.equal(store.listImages().find((image) => image.hash === hash).notes,
      "12th place out of 30, confirmed in chat")
    const secondHash = imageHash(secondImage)
    store.setClassification(secondHash, "scoresheet")
    store.setNotes(secondHash, "Only one corner of the sheet is visible")
    store.setDraft(secondHash, {
      ...record("2024-02-15"), category_scores: { ...scores, history: null },
    })
    assert.equal(store.listImages().find((image) => image.hash === secondHash).notes,
      "Only one corner of the sheet is visible")
    assert.deepEqual(store.save(), { results: 2 })
    assert.equal(JSON.parse(readFileSync(exportPath, "utf8")).length, 2)
    store.setNotes(hash, "Updated after reviewing the chat")
    store.save()
    assert.equal(store.listImages().find((image) => image.hash === hash).notes,
      "Updated after reviewing the chat")
    assert.equal(JSON.parse(readFileSync(exportPath, "utf8"))[1].notes, undefined)
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("accepts an identical result for a date but rejects different values", () => {
  const directory = mkdtempSync(join(tmpdir(), "quiz-knights-importer-"))
  const exportPath = join(directory, "data.json")
  writeFileSync(exportPath, JSON.stringify([record("2024-02-01")]))
  const store = openStore(join(directory, "importer.sqlite"), exportPath)
  try {
    const firstImage = strToU8("first-image")
    const secondImage = strToU8("second-image")
    importArchive(store, zipSync({ "IMG-1.jpg": firstImage, "IMG-2.jpg": secondImage }), "chat.zip")
    const firstHash = imageHash(firstImage)
    const secondHash = imageHash(secondImage)
    store.setClassification(firstHash, "scoresheet")
    store.setDraft(firstHash, record("2024-02-01"))
    assert.deepEqual(store.save(), { results: 1 })
    assert.equal(store.listImages().find((image) => image.hash === firstHash).saved_date, "2024-02-01")

    store.setClassification(secondHash, "scoresheet")
    store.setDraft(secondHash, record("2024-02-01"))
    assert.deepEqual(store.save(), { results: 1 })
    assert.equal(store.listImages().find((image) => image.hash === firstHash).saved_date, "2024-02-01")

    store.setDraft(secondHash, {
      ...record("2024-02-01"), category_scores: { ...scores, history: 4 },
    })
    assert.throws(() => store.save(), /different result.*already exists/)
    assert.equal(store.counts().results, 1)
    assert.deepEqual(JSON.parse(readFileSync(exportPath, "utf8")), [record("2024-02-01")])
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("migrates legacy classifications without losing notes, drafts, or results", () => {
  const directory = mkdtempSync(join(tmpdir(), "quiz-knights-importer-"))
  const databasePath = join(directory, "importer.sqlite")
  const exportPath = join(directory, "data.json")
  const hashes = ["complete", "incomplete", "other"].map((value) => imageHash(strToU8(value)))
  const legacy = new DatabaseSync(databasePath)
  try {
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE images (
        hash TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL,
        classification TEXT CHECK (classification IN ('complete', 'incomplete', 'other'))
      );
      CREATE TABLE drafts (sheet_id TEXT PRIMARY KEY REFERENCES images(hash), payload TEXT NOT NULL);
      CREATE TABLE image_notes (image_hash TEXT PRIMARY KEY REFERENCES images(hash), notes TEXT NOT NULL);
      CREATE TABLE results (date TEXT PRIMARY KEY, sheet_id TEXT UNIQUE REFERENCES images(hash), payload TEXT NOT NULL);
      CREATE TABLE imports (id INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, filename TEXT NOT NULL);
      CREATE TABLE image_occurrences (
        import_id INTEGER NOT NULL REFERENCES imports(id), archive_path TEXT NOT NULL,
        image_hash TEXT NOT NULL REFERENCES images(hash), timestamp_ms INTEGER,
        PRIMARY KEY (import_id, archive_path)
      );
    `)
    for (const [index, classification] of ["complete", "incomplete", "other"].entries()) {
      legacy.prepare("INSERT INTO images VALUES (?, ?, ?, ?)")
        .run(hashes[index], "image/jpeg", strToU8(classification), classification)
    }
    legacy.prepare("INSERT INTO drafts VALUES (?, ?)")
      .run(hashes[1], JSON.stringify({ ...record("2024-06-06"), category_scores: { ...scores, art: null } }))
    legacy.prepare("INSERT INTO image_notes VALUES (?, ?)").run(hashes[1], "12th out of 30")
    legacy.prepare("INSERT INTO results VALUES (?, ?, ?)")
      .run("2024-02-08", hashes[0], JSON.stringify(record("2024-02-08")))
    legacy.prepare("INSERT INTO imports VALUES (?, ?, ?)").run(1, "legacy-zip", "chat.zip")
    legacy.prepare("INSERT INTO image_occurrences VALUES (?, ?, ?, ?)")
      .run(1, "partial.jpg", hashes[1], null)
  } finally {
    legacy.close()
  }

  try {
    const store = openStore(databasePath, exportPath)
    try {
      const images = store.listImages()
      assert.deepEqual(hashes.map((hash) => images.find((image) => image.hash === hash).classification),
        ["scoresheet", "scoresheet", "other"])
      assert.equal(images.find((image) => image.hash === hashes[1]).notes, "12th out of 30")
      assert.equal(images.find((image) => image.hash === hashes[1]).filename, "partial.jpg")
      assert.equal(images.find((image) => image.hash === hashes[1]).draft.category_scores.art, null)
      assert.equal(images.find((image) => image.hash === hashes[0]).saved_date, "2024-02-08")
      assert.equal(Buffer.from(store.getImage(hashes[1]).bytes).toString(), "incomplete")
      assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), [])
      assert.throws(() => store.setClassification(hashes[1], "incomplete"), /Invalid classification/)
      assert.deepEqual(store.save(), { results: 1 })
    } finally {
      store.close()
    }
    const reopened = openStore(databasePath, exportPath)
    try {
      assert.equal(reopened.listImages().find((image) => image.hash === hashes[1]).classification,
        "scoresheet")
    } finally {
      reopened.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
