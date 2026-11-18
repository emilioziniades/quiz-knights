import "./style.css"

type Draft = {
  date: string
  category_scores: Record<string, number | null>
  double_up_category: string
  round_position: (number | null)[]
}
type Image = {
  hash: string
  mime: string
  classification: "complete" | "incomplete" | "other" | null
  timestamp_ms: number | null
  occurrences: number
  draft: Draft | null
  saved_date: string | null
}
type State = {
  imports: number
  images: Image[]
  results: number
  lastImport: { filename: string; images: number } | null
}

const categories = [
  "history", "geography", "science", "sport", "music", "art", "guest",
  "current_affairs", "general_knowledge", "film",
]
const app = document.querySelector<HTMLDivElement>("#app")!
let state: State = { imports: 0, images: [], results: 0, lastImport: null }
let selectedHash: string | null = null
let showAll = false
let draftTimer: number | undefined

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body as T
}

function status(text: string, error = false) {
  const element = document.querySelector<HTMLElement>("#status")
  if (element) {
    element.textContent = text
    element.classList.toggle("error", error)
  }
}

function visibleImages() {
  return showAll ? state.images : state.images.filter((image) =>
    image.classification === null || image.classification === "incomplete" ||
    (image.classification === "complete" && !image.saved_date))
}

function localDate(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

async function refresh(preferred = selectedHash) {
  state = await api<State>("/api/state")
  selectedHash = visibleImages().find((image) => image.hash === preferred)?.hash ||
    visibleImages()[0]?.hash || null
  render()
}

function currentDraft(): Draft {
  const form = document.querySelector<HTMLFormElement>("#record-form")!
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const number = (name: string) => input(name).value === "" ? null : Number(input(name).value)
  return {
    date: input("date").value,
    category_scores: Object.fromEntries(categories.map((name) => [name, number(name)])),
    double_up_category: input("double_up_category").value,
    round_position: Array.from({ length: 5 }, (_, index) => number(`position_${index}`)),
  }
}

async function persistDraft() {
  if (!selectedHash || !document.querySelector("#record-form")) return
  const draft = currentDraft()
  await api(`/api/drafts/${selectedHash}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
  })
  const image = state.images.find((item) => item.hash === selectedHash)
  if (image) image.draft = draft
  status("Draft saved locally")
}

async function selectImage(hash: string) {
  window.clearTimeout(draftTimer)
  try { await persistDraft() } catch (error) { status((error as Error).message, true); return }
  selectedHash = hash
  render()
}

async function classify(value: "complete" | "incomplete" | "other") {
  if (!selectedHash) return
  const visible = visibleImages()
  const next = visible[visible.findIndex((item) => item.hash === selectedHash) + 1]?.hash
  try {
    window.clearTimeout(draftTimer)
    await persistDraft()
    await api(`/api/images/${selectedHash}/classification`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification: value }),
    })
    await refresh(next || null)
    status("Classification saved")
  } catch (error) { status((error as Error).message, true) }
}

async function importZip(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  status(`Importing ${file.name}…`)
  try {
    const result = await api<{ skipped: boolean; images: number; newImages: number }>(
      `/api/import?filename=${encodeURIComponent(file.name)}`,
      { method: "POST", body: file },
    )
    await refresh(null)
    status(result.skipped ? "This ZIP was already imported" :
      `Imported ${result.images} images (${result.newImages} new)`)
  } catch (error) { status((error as Error).message, true) }
  input.value = ""
}

async function save() {
  try {
    window.clearTimeout(draftTimer)
    await persistDraft()
    const result = await api<{ results: number }>("/api/save", { method: "POST" })
    await refresh(selectedHash)
    status(`Saved ${result.results} results to SQLite and packages/data`)
  } catch (error) { status((error as Error).message, true) }
}

function render() {
  const visible = visibleImages()
  const selected = state.images.find((image) => image.hash === selectedHash)
  app.innerHTML = `
    <header><h1>Quiz Knights importer</h1>
      <label class="import-button">Import chat history ZIP<input id="zip" type="file" accept=".zip" hidden></label>
      <label><input id="show-all" type="checkbox" ${showAll ? "checked" : ""}> Show all</label>
      <button id="save" type="button">Save</button>
    </header>
    <p id="summary">${state.imports} ZIP imports · ${state.images.length} unique images · ${state.results} saved results</p>
    <p id="import-notice"></p>
    <p id="status" role="status"></p>
    <main><aside id="list"></aside><section id="preview"></section><aside id="editor"></aside></main>`
  const list = app.querySelector<HTMLElement>("#list")!
  if (state.lastImport?.images === 0) {
    const notice = app.querySelector<HTMLElement>("#import-notice")!
    notice.textContent = `The last ZIP (${state.lastImport.filename}) contained no image attachments. Export the WhatsApp chat with media and select that ZIP.`
    notice.classList.add("error")
  }
  if (!visible.length) list.textContent = "No images need review. Import a ZIP or choose Show all."
  for (const image of visible) {
    const button = document.createElement("button")
    button.className = `image-item ${image.hash === selectedHash ? "selected" : ""}`
    button.textContent = `${image.timestamp_ms === null ? "Unknown date" : new Date(image.timestamp_ms).toLocaleString()}\n${image.classification || "Unclassified"}${image.saved_date ? " · saved" : ""}`
    button.addEventListener("click", () => selectImage(image.hash))
    list.append(button)
  }
  const preview = app.querySelector<HTMLElement>("#preview")!
  const editor = app.querySelector<HTMLElement>("#editor")!
  if (!selected) preview.textContent = "Import a WhatsApp ZIP to begin."
  else {
    const image = document.createElement("img")
    image.src = `/api/images/${selected.hash}`
    image.alt = "Selected chat image"
    preview.append(image)
    const download = document.createElement("a")
    download.href = image.src
    download.download = selected.hash
    download.textContent = "Open or download image"
    preview.append(download)
    editor.innerHTML = `<h2>Classify</h2><div id="classify"></div><p>${selected.occurrences} chat occurrences</p>`
    for (const [value, text] of [["complete", "Complete score sheet"], ["incomplete", "Incomplete score sheet"], ["other", "Other"]] as const) {
      const button = document.createElement("button")
      button.textContent = text
      button.className = selected.classification === value ? "active" : ""
      button.addEventListener("click", () => classify(value))
      editor.querySelector("#classify")!.append(button)
    }
    if (selected.classification === "complete") renderRecordForm(editor, selected)
    if (selected.classification === "incomplete") {
      const note = document.createElement("p")
      note.textContent = "Grouping incomplete images is the next implementation step."
      editor.append(note)
    }
  }
  app.querySelector<HTMLInputElement>("#zip")!.addEventListener("change", importZip)
  app.querySelector<HTMLInputElement>("#show-all")!.addEventListener("change", async (event) => {
    window.clearTimeout(draftTimer)
    try { await persistDraft() } catch (error) { status((error as Error).message, true); return }
    showAll = (event.target as HTMLInputElement).checked
    selectedHash = visibleImages()[0]?.hash || null
    render()
  })
  app.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", save)
}

function renderRecordForm(editor: HTMLElement, image: Image) {
  const draft = image.draft
  const form = document.createElement("form")
  form.id = "record-form"
  form.innerHTML = `<h2>Record result</h2><label>Date <input name="date" type="date"></label>
    <fieldset id="scores"><legend>Category scores (0–5)</legend></fieldset>
    <label>Double-up <select name="double_up_category"></select></label>
    <fieldset id="positions"><legend>Round positions</legend></fieldset>`
  editor.append(form)
  const date = form.elements.namedItem("date") as HTMLInputElement
  date.value = draft?.date || (image.timestamp_ms === null ? "" : localDate(image.timestamp_ms))
  const scores = form.querySelector<HTMLElement>("#scores")!
  const doubleUp = form.elements.namedItem("double_up_category") as HTMLSelectElement
  for (const category of categories) {
    const row = document.createElement("label")
    row.textContent = category.replaceAll("_", " ")
    const input = document.createElement("input")
    Object.assign(input, { name: category, type: "number", min: "0", max: "5", step: "0.5" })
    input.value = draft?.category_scores?.[category]?.toString() || ""
    row.append(input)
    scores.append(row)
    doubleUp.add(new Option(category.replaceAll("_", " "), category))
  }
  doubleUp.value = draft?.double_up_category || categories[0]
  const positions = form.querySelector<HTMLElement>("#positions")!
  for (let index = 0; index < 5; index++) {
    const row = document.createElement("label")
    row.textContent = `Round ${index + 1}`
    const input = document.createElement("input")
    Object.assign(input, { name: `position_${index}`, type: "number", min: "1", step: "1" })
    input.value = draft?.round_position?.[index]?.toString() || ""
    row.append(input)
    positions.append(row)
  }
  form.addEventListener("input", () => {
    window.clearTimeout(draftTimer)
    draftTimer = window.setTimeout(() => persistDraft().catch((error) => status(error.message, true)), 500)
  })
  form.addEventListener("submit", (event) => event.preventDefault())
}

render()
refresh().catch((error) => status(error.message, true))
