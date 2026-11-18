import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

export const categories = [
  "history", "geography", "science", "sport", "music", "art", "guest",
  "current_affairs", "general_knowledge", "film",
]

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    import_id INTEGER NOT NULL REFERENCES imports(id),
    ordinal INTEGER NOT NULL,
    timestamp_ms INTEGER,
    body TEXT NOT NULL,
    PRIMARY KEY (import_id, ordinal)
  );
  CREATE TABLE IF NOT EXISTS images (
    hash TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    bytes BLOB NOT NULL,
    classification TEXT CHECK (classification IN ('scoresheet', 'other')),
    rotation_degrees INTEGER NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270))
  );
  CREATE TABLE IF NOT EXISTS image_occurrences (
    import_id INTEGER NOT NULL REFERENCES imports(id),
    archive_path TEXT NOT NULL,
    image_hash TEXT NOT NULL REFERENCES images(hash),
    timestamp_ms INTEGER,
    PRIMARY KEY (import_id, archive_path)
  );
  CREATE INDEX IF NOT EXISTS image_occurrences_hash ON image_occurrences(image_hash);
  CREATE TABLE IF NOT EXISTS drafts (
    sheet_id TEXT PRIMARY KEY REFERENCES images(hash),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS image_notes (
    image_hash TEXT PRIMARY KEY REFERENCES images(hash),
    notes TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS results (
    date TEXT PRIMARY KEY,
    sheet_id TEXT UNIQUE REFERENCES images(hash),
    payload TEXT NOT NULL
  );
`

function withTransaction(db, action) {
  db.exec("BEGIN IMMEDIATE")
  try {
    const result = action()
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

function migrateLegacyClassifications(db) {
  const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'images'").get()?.sql
  if (!definition?.includes("'incomplete'")) return

  db.exec("PRAGMA foreign_keys = OFF")
  try {
    withTransaction(db, () => db.exec(`
      CREATE TABLE images_migrated (
        hash TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        bytes BLOB NOT NULL,
        classification TEXT CHECK (classification IN ('scoresheet', 'other')),
        rotation_degrees INTEGER NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270))
      );
      INSERT INTO images_migrated (hash, mime, bytes, classification)
        SELECT hash, mime, bytes,
          CASE WHEN classification IN ('complete', 'incomplete') THEN 'scoresheet'
               ELSE classification END
        FROM images;
      DROP TABLE images;
      ALTER TABLE images_migrated RENAME TO images;
    `))
  } finally {
    db.exec("PRAGMA foreign_keys = ON")
  }
  if (db.prepare("PRAGMA foreign_key_check").get()) {
    throw new Error("Image classification migration broke a database reference")
  }
}

function validateRecord(value) {
  if (!value || typeof value !== "object") throw new Error("Result is required")
  const date = value.date
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid quiz date (YYYY-MM-DD)")
  }
  const scores = value.category_scores
  if (!scores || typeof scores !== "object" || categories.some((name) =>
    typeof scores[name] !== "number" || !Number.isFinite(scores[name]) ||
    scores[name] < 0 || scores[name] > 5 || !Number.isInteger(scores[name] * 2))) {
    throw new Error("Enter every category score from 0 to 5 in half-point steps")
  }
  if (!categories.includes(value.double_up_category)) {
    throw new Error("Choose a double-up category")
  }
  if (!Array.isArray(value.round_position) || value.round_position.length !== 5 ||
      value.round_position.some((position) => !Number.isInteger(position) || position < 1)) {
    throw new Error("Enter five positive round positions")
  }
  return {
    date,
    category_scores: Object.fromEntries(categories.map((name) => [name, scores[name]])),
    double_up_category: value.double_up_category,
    round_position: value.round_position,
  }
}

function hasAllRecordFields(value) {
  return typeof value?.date === "string" && value.date !== "" &&
    categories.every((name) => typeof value.category_scores?.[name] === "number") &&
    typeof value.double_up_category === "string" && value.double_up_category !== "" &&
    Array.isArray(value.round_position) && value.round_position.length === 5 &&
    value.round_position.every((position) => typeof position === "number")
}

export function imageHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function openStore(databasePath, exportPath) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec(schema)
  migrateLegacyClassifications(db)
  if (!db.prepare("PRAGMA table_info(images)").all().some((column) => column.name === "rotation_degrees")) {
    db.exec("ALTER TABLE images ADD COLUMN rotation_degrees INTEGER NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270))")
  }

  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get()) {
    const initial = existsSync(exportPath) ? JSON.parse(readFileSync(exportPath, "utf8")) : []
    if (!Array.isArray(initial)) throw new Error("Published data must be a JSON array")
    withTransaction(db, () => {
      const insert = db.prepare("INSERT OR IGNORE INTO results (date, payload) VALUES (?, ?)")
      for (const item of initial) {
        const record = validateRecord(item)
        insert.run(record.date, JSON.stringify(record))
      }
      db.prepare("INSERT INTO settings (key, value) VALUES ('seeded', '1')").run()
    })
  }

  return {
    db,
    close: () => db.close(),
    listImages() {
      return db.prepare(`
        SELECT i.hash, i.mime, i.classification, i.rotation_degrees,
               MIN(o.timestamp_ms) AS timestamp_ms,
               (SELECT archive_path FROM image_occurrences
                WHERE image_hash = i.hash
                ORDER BY timestamp_ms IS NULL, timestamp_ms, import_id, archive_path
                LIMIT 1) AS filename,
               d.payload AS draft,
               COALESCE(n.notes, '') AS notes,
               r.date AS saved_date
        FROM images i
        LEFT JOIN image_occurrences o ON o.image_hash = i.hash
        LEFT JOIN drafts d ON d.sheet_id = i.hash
        LEFT JOIN image_notes n ON n.image_hash = i.hash
        LEFT JOIN results r ON r.sheet_id = i.hash
        GROUP BY i.hash
        ORDER BY timestamp_ms IS NULL, timestamp_ms, i.hash
      `).all().map((row) => ({ ...row, draft: row.draft ? JSON.parse(row.draft) : null }))
    },
    getImage(hash) {
      return db.prepare("SELECT mime, bytes FROM images WHERE hash = ?").get(hash)
    },
    counts() {
      const lastImport = db.prepare(`
        SELECT filename,
          (SELECT COUNT(*) FROM image_occurrences WHERE import_id = imports.id) AS images
        FROM imports ORDER BY id DESC LIMIT 1
      `).get()
      return {
        imports: db.prepare("SELECT COUNT(*) AS n FROM imports").get().n,
        images: db.prepare("SELECT COUNT(*) AS n FROM images").get().n,
        results: db.prepare("SELECT COUNT(*) AS n FROM results").get().n,
        lastImport: lastImport || null,
      }
    },
    setClassification(hash, classification) {
      if (classification !== null && !["scoresheet", "other"].includes(classification)) {
        throw new Error("Invalid classification")
      }
      if (classification !== "scoresheet" &&
          db.prepare("SELECT 1 FROM results WHERE sheet_id = ?").get(hash)) {
        throw new Error("This image has a saved result; change or remove that result first")
      }
      const outcome = db.prepare("UPDATE images SET classification = ? WHERE hash = ?")
        .run(classification, hash)
      if (!outcome.changes) throw new Error("Image not found")
    },
    setRotation(hash, degrees) {
      if (![0, 90, 180, 270].includes(degrees)) throw new Error("Invalid image rotation")
      const outcome = db.prepare("UPDATE images SET rotation_degrees = ? WHERE hash = ?")
        .run(degrees, hash)
      if (!outcome.changes) throw new Error("Image not found")
    },
    setDraft(hash, payload) {
      if (!db.prepare("SELECT 1 FROM images WHERE hash = ?").get(hash)) {
        throw new Error("Image not found")
      }
      db.prepare(`
        INSERT INTO drafts (sheet_id, payload) VALUES (?, ?)
        ON CONFLICT(sheet_id) DO UPDATE SET payload = excluded.payload,
          updated_at = CURRENT_TIMESTAMP
      `).run(hash, JSON.stringify(payload))
    },
    setNotes(hash, notes) {
      if (typeof notes !== "string") throw new Error("Notes must be text")
      if (!db.prepare("SELECT 1 FROM images WHERE hash = ?").get(hash)) {
        throw new Error("Image not found")
      }
      db.prepare(`
        INSERT INTO image_notes (image_hash, notes) VALUES (?, ?)
        ON CONFLICT(image_hash) DO UPDATE SET notes = excluded.notes
      `).run(hash, notes)
    },
    save() {
      const drafts = db.prepare(`
        SELECT d.sheet_id, d.payload, r.date AS saved_date
        FROM drafts d JOIN images i ON i.hash = d.sheet_id
        LEFT JOIN results r ON r.sheet_id = d.sheet_id
        WHERE i.classification = 'scoresheet'
      `).all()
      const ready = drafts.flatMap(({ sheet_id, payload, saved_date }) => {
        const draft = JSON.parse(payload)
        if (!saved_date && !hasAllRecordFields(draft)) return []
        return [{ sheetId: sheet_id, record: validateRecord(draft) }]
      })

      withTransaction(db, () => {
        for (const { sheetId, record } of ready) {
          const other = db.prepare("SELECT sheet_id, payload FROM results WHERE date = ?").get(record.date)
          if (other && other.sheet_id !== sheetId) {
            const existing = validateRecord(JSON.parse(other.payload))
            if (JSON.stringify(existing) !== JSON.stringify(record)) {
              throw new Error(`A different result for ${record.date} already exists`)
            }
            db.prepare("DELETE FROM results WHERE sheet_id = ? AND date <> ?")
              .run(sheetId, record.date)
            if (other.sheet_id === null) {
              db.prepare("UPDATE results SET sheet_id = ? WHERE date = ?")
                .run(sheetId, record.date)
            }
            continue
          }
          db.prepare("DELETE FROM results WHERE sheet_id = ? AND date <> ?")
            .run(sheetId, record.date)
          db.prepare(`
            INSERT INTO results (date, sheet_id, payload) VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET payload = excluded.payload
          `).run(record.date, sheetId, JSON.stringify(record))
        }
      })

      const published = db.prepare("SELECT payload FROM results ORDER BY date").all()
        .map((row) => JSON.parse(row.payload))
      const output = JSON.stringify(published, null, 2) + "\n"
      if (existsSync(exportPath) && readFileSync(exportPath, "utf8") === output) {
        return { results: published.length }
      }
      const temporary = `${exportPath}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, output)
        renameSync(temporary, exportPath)
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary)
      }
      return { results: published.length }
    },
  }
}
