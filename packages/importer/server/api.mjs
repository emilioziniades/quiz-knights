import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { importArchive } from "./import.mjs"
import { openStore } from "./db.mjs"

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url))
const databasePath = process.env.QUIZ_KNIGHTS_DB ||
  join(repositoryRoot, "packages/importer/.local/importer.sqlite")
const exportPath = join(repositoryRoot, "packages/data/data.json")

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  response.end(JSON.stringify(value))
}

async function readBody(request, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) {
      const error = new Error("Upload is too large")
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(request) {
  const bytes = await readBody(request, 1_000_000)
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error("Invalid JSON request")
  }
}

export function createApi() {
  const store = openStore(databasePath, exportPath)
  return (request, response) => {
    const url = new URL(request.url, "http://localhost")
    const path = url.pathname
    const method = request.method
    Promise.resolve().then(async () => {
      if (method === "GET" && path === "/state") {
        return json(response, 200, { ...store.counts(), images: store.listImages() })
      }
      if (method === "POST" && path === "/import") {
        const bytes = await readBody(request, 512_000_000)
        if (!bytes.length) throw new Error("Choose a ZIP file")
        const result = importArchive(store, bytes, url.searchParams.get("filename") || "chat.zip")
        return json(response, 200, result)
      }
      const image = path.match(/^\/images\/([a-f0-9]{64})$/)
      if (method === "GET" && image) {
        const found = store.getImage(image[1])
        if (!found) return json(response, 404, { error: "Image not found" })
        response.writeHead(200, { "Content-Type": found.mime, "Cache-Control": "private, max-age=86400" })
        return response.end(found.bytes)
      }
      const classification = path.match(/^\/images\/([a-f0-9]{64})\/classification$/)
      if (method === "PUT" && classification) {
        const body = await readJson(request)
        store.setClassification(classification[1], body.classification)
        return json(response, 200, { ok: true })
      }
      const rotation = path.match(/^\/images\/([a-f0-9]{64})\/rotation$/)
      if (method === "PUT" && rotation) {
        store.setRotation(rotation[1], (await readJson(request)).rotation_degrees)
        return json(response, 200, { ok: true })
      }
      const draft = path.match(/^\/drafts\/([a-f0-9]{64})$/)
      if (method === "PUT" && draft) {
        store.setDraft(draft[1], await readJson(request))
        return json(response, 200, { ok: true })
      }
      const notes = path.match(/^\/images\/([a-f0-9]{64})\/notes$/)
      if (method === "PUT" && notes) {
        store.setNotes(notes[1], (await readJson(request)).notes)
        return json(response, 200, { ok: true })
      }
      if (method === "POST" && path === "/save") {
        return json(response, 200, store.save())
      }
      return json(response, 404, { error: "Not found" })
    }).catch((error) => {
      if (!response.headersSent) json(response, error.status || 400, { error: error.message })
    })
  }
}
