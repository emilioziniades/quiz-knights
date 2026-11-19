import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { validateData } from "@quiz-knights/data/validation"

const sample = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"))[0]

test("accepts a valid result", () => {
  assert.deepEqual(validateData([sample]), [])
})

test("reports invalid scores, positions, and category choices", () => {
  const result = structuredClone(sample)
  result.category_scores.history = 5.5
  result.category_scores.music = 2.3
  result.round_position[0] = 0
  result.double_up_category = "unknown"
  const errors = validateData([result])
  assert.equal(errors.length, 4)
  assert.ok(errors.some((error) => error.includes("category_scores.history")))
  assert.ok(errors.some((error) => error.includes("category_scores.music")))
  assert.ok(errors.some((error) => error.includes("round_position[0]")))
  assert.ok(errors.some((error) => error.includes("double_up_category")))
})

test("reports malformed dates, missing fields, and duplicate dates", () => {
  const malformed = { ...sample, date: "2024-02-30", category_scores: { ...sample.category_scores } }
  delete malformed.category_scores.art
  const errors = validateData([sample, malformed, sample])
  assert.ok(errors.some((error) => error.includes("result[1].date: expected a real date")))
  assert.ok(errors.some((error) => error.includes("result[1].category_scores.art: missing")))
  assert.ok(errors.some((error) => error.includes("result[2].date: duplicates")))
})
