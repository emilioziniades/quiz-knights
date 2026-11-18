import { basename } from "node:path"
import { unzipSync } from "fflate"
import { imageHash } from "./db.mjs"

const imageMimes = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  [".gif", "image/gif"], [".webp", "image/webp"],
  [".heic", "image/heic"], [".heif", "image/heif"],
])
const imageName = /[^\s<>:"\\|?*]+\.(?:jpe?g|png|gif|webp|heic|heif)/gi
const iosLine = /^\[(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*(.*)$/i
const androidLine = /^(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(.*)$/i

function timestamp(datePart, timePart) {
  const parts = datePart.split(/[\/.-]/).map(Number)
  const yearFirst = datePart.split(/[\/.-]/)[0].length === 4
  const [year, month, day] = yearFirst
    ? parts
    : [parts[2] < 100 ? parts[2] + 2000 : parts[2], parts[1], parts[0]]
  const match = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] || 0)
  if (match[4]) hour = (hour % 12) + (match[4].toUpperCase() === "PM" ? 12 : 0)
  const date = new Date(year, month - 1, day, hour, minute, second)
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day && date.getHours() === hour &&
    date.getMinutes() === minute ? date.getTime() : null
}

export function parseChat(text) {
  const messages = []
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.match(iosLine) || line.match(androidLine)
    if (match) {
      messages.push({ timestampMs: timestamp(match[1], match[2]), body: match[3] })
    } else if (messages.length && line) {
      messages[messages.length - 1].body += `\n${line}`
    }
  }
  return messages
}

export function importArchive(store, bytes, filename = "chat.zip") {
  const archiveHash = imageHash(bytes)
  if (store.db.prepare("SELECT 1 FROM imports WHERE hash = ?").get(archiveHash)) {
    return { skipped: true, newImages: 0, images: 0, messages: 0 }
  }

  let totalSize = 0
  const files = unzipSync(bytes, {
    filter(file) {
      const extension = /\.[^.]+$/.exec(file.name)?.[0]?.toLowerCase()
      if (extension !== ".txt" && !imageMimes.has(extension)) return false
      totalSize += file.originalSize
      if (totalSize > 1_000_000_000) throw new Error("ZIP contents exceed the 1 GB limit")
      return true
    },
  })
  const transcripts = Object.entries(files)
    .filter(([name]) => name.toLowerCase().endsWith(".txt"))
    .sort(([a], [b]) => a.localeCompare(b))
  const messages = transcripts.flatMap(([, data]) => parseChat(new TextDecoder().decode(data)))
  const timesByName = new Map()
  for (const message of messages) {
    for (const name of message.body.match(imageName) || []) {
      const key = name.toLowerCase()
      if (!timesByName.has(key)) timesByName.set(key, [])
      timesByName.get(key).push(message.timestampMs)
    }
  }

  const images = Object.entries(files)
    .filter(([name]) => imageMimes.has(/\.[^.]+$/.exec(name)?.[0]?.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  if (!images.length && !messages.length) throw new Error("ZIP contains no chat messages or supported images")

  const db = store.db
  db.exec("BEGIN IMMEDIATE")
  try {
    const importId = db.prepare("INSERT INTO imports (hash, filename) VALUES (?, ?)")
      .run(archiveHash, basename(filename)).lastInsertRowid
    const addMessage = db.prepare("INSERT INTO messages (import_id, ordinal, timestamp_ms, body) VALUES (?, ?, ?, ?)")
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index]
      addMessage.run(importId, index, message.timestampMs, message.body)
    }
    const addImage = db.prepare("INSERT OR IGNORE INTO images (hash, mime, bytes) VALUES (?, ?, ?)")
    const addOccurrence = db.prepare(`
      INSERT INTO image_occurrences (import_id, archive_path, image_hash, timestamp_ms)
      VALUES (?, ?, ?, ?)
    `)
    let newImages = 0
    for (const [path, data] of images) {
      const hash = imageHash(data)
      const extension = /\.[^.]+$/.exec(path)[0].toLowerCase()
      newImages += Number(addImage.run(hash, imageMimes.get(extension), Buffer.from(data)).changes)
      const name = path.split(/[\\/]/).at(-1).toLowerCase()
      const timestampMs = timesByName.get(name)?.shift() ?? null
      addOccurrence.run(importId, path, hash, timestampMs)
    }
    db.exec("COMMIT")
    return { skipped: false, newImages, images: images.length, messages: messages.length }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}
