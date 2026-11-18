import "./style.css"

type Draft = {
  date: string
  category_scores: Record<string, number | null>
  double_up_category: string
  round_position: (number | null)[]
}
type Image = {
  hash: string
  filename: string
  mime: string
  classification: "scoresheet" | "other" | null
  rotation_degrees: number
  timestamp_ms: number | null
  draft: Draft | null
  notes: string
  saved_date: string | null
}
type State = {
  imports: number
  images: Image[]
  results: number
  lastImport: { filename: string; images: number } | null
}
type ImageFilter = "unclassified" | "scoresheet" | "other" | "unreviewed" | "reviewed"

const categories = [
  "history", "geography", "science", "sport", "music", "art", "guest",
  "current_affairs", "general_knowledge", "film",
]
const app = document.querySelector<HTMLDivElement>("#app")!
let state: State = { imports: 0, images: [], results: 0, lastImport: null }
let selectedHash: string | null = null
let imageFilter: ImageFilter = "unreviewed"
let filenameQuery = ""
let draftTimer: number | undefined
let notesTimer: number | undefined
let keyboardNavigation = Promise.resolve()
let rotationQueue = Promise.resolve()
let previewResizeObserver: ResizeObserver | null = null
let fitPreviewImage: (() => void) | null = null

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

function matchesFilter(image: Image, filter: ImageFilter) {
  if (filter === "unclassified") return image.classification === null
  if (filter === "unreviewed") return image.classification === null ||
    (image.classification === "scoresheet" && !image.saved_date)
  if (filter === "reviewed") return image.classification === "scoresheet" && !!image.saved_date
  return image.classification === filter
}

function visibleImages() {
  return state.images.filter((image) => matchesFilter(image, imageFilter) && matchesFilename(image.filename, filenameQuery))
}

function filename(name: string) {
  return name.split(/[\\/]/).at(-1) || name
}

function withinEdits(query: string, candidate: string, limit: number) {
  if (Math.abs(query.length - candidate.length) > limit) return false
  let previous = Array.from({ length: candidate.length + 1 }, (_, index) => index)
  for (let row = 1; row <= query.length; row++) {
    const current = [row]
    for (let column = 1; column <= candidate.length; column++) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (query[row - 1] === candidate[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[candidate.length] <= limit
}

function matchesFilename(name: string, query: string) {
  const normalized = filename(name).toLowerCase()
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  return query.toLowerCase().trim().split(/\s+/).every((term) => {
    if (normalized.includes(term)) return true
    if (term.length < 4) return false
    const limit = term.length >= 8 ? 2 : 1
    return parts.some((part) => {
      for (let start = 0; start < part.length; start++) {
        for (let length = Math.max(1, term.length - limit); length <= term.length + limit; length++) {
          if (withinEdits(term, part.slice(start, start + length), limit)) return true
        }
      }
      return false
    })
  })
}

async function setImageFilter(filter: ImageFilter) {
  window.clearTimeout(draftTimer)
  window.clearTimeout(notesTimer)
  try { await persistEdits() } catch (error) { status((error as Error).message, true); return }
  imageFilter = filter
  selectedHash = visibleImages()[0]?.hash || null
  render()
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

async function persistNotes() {
  const field = document.querySelector<HTMLTextAreaElement>("#sheet-notes")
  if (!selectedHash || !field) return
  const notes = field.value
  const image = state.images.find((item) => item.hash === selectedHash)
  if (image?.notes === notes) return
  await api(`/api/images/${selectedHash}/notes`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }),
  })
  if (image) image.notes = notes
  status("Notes saved locally")
}

async function persistEdits() {
  await persistDraft()
  await persistNotes()
}

async function selectImage(hash: string) {
  window.clearTimeout(draftTimer)
  window.clearTimeout(notesTimer)
  try { await persistEdits() } catch (error) { status((error as Error).message, true); return }
  selectedHash = hash
  render()
}

async function moveSelection(direction: -1 | 1) {
  const visible = visibleImages()
  if (!visible.length) return
  const index = visible.findIndex((image) => image.hash === selectedHash)
  const nextIndex = index === -1
    ? (direction === 1 ? 0 : visible.length - 1)
    : Math.max(0, Math.min(visible.length - 1, index + direction))
  if (nextIndex !== index) await selectImage(visible[nextIndex].hash)
}

function rotateImage(delta: -90 | 90) {
  const hash = selectedHash
  if (!hash) return
  rotationQueue = rotationQueue.then(async () => {
    const current = state.images.find((image) => image.hash === hash)
    if (!current) return
    const degrees = (current.rotation_degrees + delta + 360) % 360
    await api(`/api/images/${hash}/rotation`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotation_degrees: degrees }),
    })
    const latest = state.images.find((image) => image.hash === hash)
    if (latest) latest.rotation_degrees = degrees
    if (selectedHash === hash) {
      fitPreviewImage?.()
      const thumbnail = app.querySelector<HTMLImageElement>(".image-item.selected .image-thumbnail img")
      if (thumbnail) thumbnail.style.transform = `rotate(${degrees}deg)`
    }
  }).catch((error) => status((error as Error).message, true))
}

async function classify(value: "scoresheet" | "other" | null) {
  if (!selectedHash) return
  const visible = visibleImages()
  const next = visible[visible.findIndex((item) => item.hash === selectedHash) + 1]?.hash
  try {
    window.clearTimeout(draftTimer)
    window.clearTimeout(notesTimer)
    await persistEdits()
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
    window.clearTimeout(draftTimer)
    window.clearTimeout(notesTimer)
    await persistEdits()
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
    window.clearTimeout(notesTimer)
    await persistEdits()
    const result = await api<{ results: number }>("/api/save", { method: "POST" })
    await refresh(selectedHash)
    status(`Saved ${result.results} results to SQLite and packages/data`)
  } catch (error) { status((error as Error).message, true) }
}

function render() {
  previewResizeObserver?.disconnect()
  fitPreviewImage = null
  const selected = state.images.find((image) => image.hash === selectedHash)
  app.innerHTML = `
    <header><h1>Quiz Knights importer</h1>
      <label class="import-button">Import chat history ZIP<input id="zip" type="file" accept=".zip" hidden></label>
      <button id="save" type="button" title="Save (⌘/Ctrl+Enter)">Save</button>
    </header>
    <p id="import-notice"></p>
    <p id="status" role="status"></p>
    <main><aside id="list">
      <div id="category-summary" class="category-summary" aria-label="Image classifications"></div>
      <div class="image-list-heading"><h2>Images</h2>
        <input id="filename-search" type="search" aria-label="Search image filenames" placeholder="Search filenames" autocomplete="off">
      </div>
      <div id="image-items"></div>
    </aside><section id="preview">
      <div id="current-image">
        <span class="current-image-label"><strong>Current image:</strong> <span id="current-filename"></span></span>
        <div class="preview-controls">
          <div id="zoom-controls" class="zoom-controls"></div>
          <span class="rotation-controls">
            <button id="rotate-left" type="button" aria-label="Rotate image left 90 degrees" title="Rotate left 90°">↶</button>
            <button id="rotate-right" type="button" aria-label="Rotate image right 90 degrees" title="Rotate right 90°">↷</button>
          </span>
        </div>
      </div>
    </section><aside id="editor"></aside></main>`
  app.querySelector<HTMLInputElement>("#filename-search")!.value = filenameQuery
  app.querySelector<HTMLInputElement>("#filename-search")!.addEventListener("input", (event) => {
    filenameQuery = (event.target as HTMLInputElement).value
    renderImageItems()
  })
  const summaries = app.querySelector<HTMLElement>("#category-summary")!
  const summaryItems = [
    { filter: "unclassified", label: "Unclassified" },
    { filter: "scoresheet", label: "Scoresheet" },
    { filter: "other", label: "Other" },
    { filter: "unreviewed", label: "Unreviewed" },
    { filter: "reviewed", label: "Reviewed" },
  ] as const
  for (const item of summaryItems) {
    const button = document.createElement("button")
    button.type = "button"
    button.classList.toggle("active", imageFilter === item.filter)
    button.title = `Show ${item.label.toLowerCase()}`
    const count = document.createElement("strong")
    count.textContent = String(state.images.filter((image) => matchesFilter(image, item.filter)).length)
    button.append(item.label, count)
    button.addEventListener("click", () => setImageFilter(item.filter))
    summaries.append(button)
  }
  app.querySelector<HTMLElement>("#current-filename")!.textContent = selected ? filename(selected.filename) : "None selected"
  for (const [id, delta] of [["rotate-left", -90], ["rotate-right", 90]] as const) {
    const button = app.querySelector<HTMLButtonElement>(`#${id}`)!
    button.disabled = !selected
    button.addEventListener("click", () => rotateImage(delta))
  }
  if (state.lastImport?.images === 0) {
    const notice = app.querySelector<HTMLElement>("#import-notice")!
    notice.textContent = `The last ZIP (${state.lastImport.filename}) contained no image attachments. Export the WhatsApp chat with media and select that ZIP.`
    notice.classList.add("error")
  }
  renderImageItems()
  const preview = app.querySelector<HTMLElement>("#preview")!
  const editor = app.querySelector<HTMLElement>("#editor")!
  if (!selected) preview.append("Import a WhatsApp ZIP to begin.")
  else {
    const stage = document.createElement("div")
    stage.className = "image-stage"
    const frame = document.createElement("div")
    frame.className = "image-frame"
    const image = document.createElement("img")
    image.alt = "Selected chat image"
    frame.append(image)
    stage.append(frame)
    preview.append(stage)
    let zoom = 1
    let panX = 0
    let panY = 0
    const zoomOut = document.createElement("button")
    zoomOut.type = "button"
    zoomOut.textContent = "−"
    zoomOut.disabled = true
    zoomOut.setAttribute("aria-label", "Zoom out")
    const zoomLevel = document.createElement("span")
    zoomLevel.className = "zoom-level"
    zoomLevel.textContent = "100%"
    zoomLevel.title = "Relative to the fitted image size"
    const zoomIn = document.createElement("button")
    zoomIn.type = "button"
    zoomIn.textContent = "+"
    zoomIn.setAttribute("aria-label", "Zoom in")
    const fitButton = document.createElement("button")
    fitButton.type = "button"
    fitButton.textContent = "Fit"
    fitButton.disabled = true
    app.querySelector<HTMLElement>("#zoom-controls")!.append(zoomOut, zoomLevel, zoomIn, fitButton)
    const fit = () => {
      if (!image.naturalWidth || !image.naturalHeight || !stage.clientWidth || !stage.clientHeight) return
      const quarterTurn = selected.rotation_degrees % 180 !== 0
      const width = quarterTurn ? image.naturalHeight : image.naturalWidth
      const height = quarterTurn ? image.naturalWidth : image.naturalHeight
      const scale = Math.min(1, stage.clientWidth / width, stage.clientHeight / height) * zoom
      const displayedWidth = width * scale
      const displayedHeight = height * scale
      const maxPanX = Math.max(0, (displayedWidth - stage.clientWidth) / 2)
      const maxPanY = Math.max(0, (displayedHeight - stage.clientHeight) / 2)
      panX = Math.max(-maxPanX, Math.min(maxPanX, panX))
      panY = Math.max(-maxPanY, Math.min(maxPanY, panY))
      frame.style.width = `${displayedWidth}px`
      frame.style.height = `${displayedHeight}px`
      frame.style.left = `calc(50% + ${panX}px)`
      frame.style.top = `calc(50% + ${panY}px)`
      image.style.width = `${image.naturalWidth * scale}px`
      image.style.height = `${image.naturalHeight * scale}px`
      image.style.transform = `translate(-50%, -50%) rotate(${selected.rotation_degrees}deg)`
      stage.classList.toggle("can-pan", maxPanX > 0 || maxPanY > 0)
      zoomLevel.textContent = `${Math.round(zoom * 100)}%`
      zoomOut.disabled = zoom <= 1
      zoomIn.disabled = zoom >= 8
      fitButton.disabled = zoom === 1
    }
    const setZoom = (level: number, anchorX = 0, anchorY = 0) => {
      const next = Math.max(1, Math.min(8, level))
      const ratio = next / zoom
      panX = anchorX - (anchorX - panX) * ratio
      panY = anchorY - (anchorY - panY) * ratio
      zoom = next
      fit()
    }
    zoomOut.addEventListener("click", () => setZoom(zoom / 1.5))
    zoomIn.addEventListener("click", () => setZoom(zoom * 1.5))
    fitButton.addEventListener("click", () => { panX = 0; panY = 0; setZoom(1) })
    stage.addEventListener("wheel", (event) => {
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1
      setZoom(zoom * Math.exp(-event.deltaY * multiplier * 0.002),
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2)
    }, { passive: false })
    let drag: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null
    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !stage.classList.contains("can-pan")) return
      event.preventDefault()
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY }
      stage.setPointerCapture(event.pointerId)
      stage.classList.add("panning")
    })
    stage.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      panX = drag.panX + event.clientX - drag.x
      panY = drag.panY + event.clientY - drag.y
      fit()
    })
    const endDrag = () => { drag = null; stage.classList.remove("panning") }
    stage.addEventListener("pointerup", endDrag)
    stage.addEventListener("pointercancel", endDrag)
    stage.addEventListener("lostpointercapture", endDrag)
    fitPreviewImage = fit
    image.addEventListener("load", fit)
    previewResizeObserver = new ResizeObserver(fit)
    previewResizeObserver.observe(stage)
    image.src = `/api/images/${selected.hash}`
    editor.innerHTML = `<h2>Classify</h2><div id="classify"></div>`
    for (const [value, text] of [[null, "Unclassified"], ["scoresheet", "Scoresheet"], ["other", "Other"]] as const) {
      const button = document.createElement("button")
      button.textContent = text
      button.className = selected.classification === value ? "active" : ""
      button.addEventListener("click", () => classify(value))
      editor.querySelector("#classify")!.append(button)
    }
    if (selected.classification === "scoresheet") renderRecordForm(editor, selected)
    if (selected.classification === "scoresheet") {
      const section = document.createElement("section")
      section.className = "notes-section"
      const label = document.createElement("label")
      label.textContent = "Notes"
      const field = document.createElement("textarea")
      field.id = "sheet-notes"
      field.rows = 5
      field.value = selected.notes || ""
      field.placeholder = "Context, missing details, or other observations"
      field.addEventListener("input", () => {
        window.clearTimeout(notesTimer)
        notesTimer = window.setTimeout(() => persistNotes().catch((error) => status(error.message, true)), 500)
      })
      label.append(field)
      section.append(label)
      editor.append(section)
    }
  }
  app.querySelector<HTMLInputElement>("#zip")!.addEventListener("change", importZip)
  app.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", save)
}

function renderImageItems() {
  const list = app.querySelector<HTMLElement>("#image-items")!
  const visible = visibleImages()
  list.replaceChildren()
  if (!visible.length) list.textContent = filenameQuery.trim()
    ? "No filenames match this search and category."
    : "No images match this filter. Import a ZIP or choose another category."
  for (const image of visible) {
    const button = document.createElement("button")
    button.className = `image-item ${image.hash === selectedHash ? "selected" : ""}`
    const thumbnail = document.createElement("span")
    thumbnail.className = "image-thumbnail"
    const preview = document.createElement("img")
    preview.src = `/api/images/${image.hash}`
    preview.alt = ""
    preview.loading = "lazy"
    preview.decoding = "async"
    preview.style.transform = `rotate(${image.rotation_degrees}deg)`
    thumbnail.append(preview)
    const details = document.createElement("span")
    details.className = "image-item-details"
    details.textContent = `${filename(image.filename)}\n${image.timestamp_ms === null ? "Unknown date" : new Date(image.timestamp_ms).toLocaleString()}\n${image.classification === "scoresheet" ? "Scoresheet" : image.classification === "other" ? "Other" : "Unclassified"}${image.saved_date ? " · saved" : ""}`
    button.append(thumbnail, details)
    button.addEventListener("click", () => selectImage(image.hash))
    list.append(button)
  }
  list.querySelector<HTMLElement>(".image-item.selected")?.scrollIntoView({ block: "nearest" })
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
    event.preventDefault()
    if (!event.repeat) void save()
    return
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target
  if (target instanceof HTMLElement &&
      (target.closest("input, textarea, select, [contenteditable]") || target.isContentEditable)) return
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1
    : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : null
  if (direction === null || !visibleImages().length) return
  event.preventDefault()
  keyboardNavigation = keyboardNavigation.then(() => moveSelection(direction))
})

render()
refresh().catch((error) => status(error.message, true))
