import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateData } from "./validation.mjs"

const dataPath = fileURLToPath(new URL("./data.json", import.meta.url))

try {
  const data = JSON.parse(readFileSync(dataPath, "utf8"))
  const errors = validateData(data)
  if (errors.length) {
    console.error(`Data validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.log(`Validated ${data.length} results in ${dataPath}`)
  }
} catch (error) {
  console.error(`Could not read ${dataPath}: ${error.message}`)
  process.exitCode = 1
}
