export const categories = [
  "history", "geography", "science", "sport", "music", "art", "guest",
  "current_affairs", "general_knowledge", "film",
]
const fields = ["date", "category_scores", "double_up_category", "round_position"]

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function checkKeys(value, expected, path, errors) {
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: missing`)
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) errors.push(`${path}.${key}: unexpected field`)
  }
}

export function validateResult(result, path = "result") {
  const errors = []
  if (!isObject(result)) return [`${path}: expected an object`]
  checkKeys(result, fields, path, errors)

  if (!validDate(result.date)) {
    errors.push(`${path}.date: expected a real date in YYYY-MM-DD format`)
  }

  if (!isObject(result.category_scores)) {
    errors.push(`${path}.category_scores: expected an object`)
  } else {
    checkKeys(result.category_scores, categories, `${path}.category_scores`, errors)
    for (const category of categories) {
      if (!Object.hasOwn(result.category_scores, category)) continue
      const score = result.category_scores[category]
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 5 ||
          !Number.isInteger(score * 2)) {
        errors.push(`${path}.category_scores.${category}: expected 0–5 in half-point steps (got ${JSON.stringify(score)})`)
      }
    }
  }

  if (!categories.includes(result.double_up_category)) {
    errors.push(`${path}.double_up_category: expected a category name`)
  }

  if (!Array.isArray(result.round_position) || result.round_position.length !== 5) {
    errors.push(`${path}.round_position: expected exactly five positions`)
  } else {
    for (const [round, position] of result.round_position.entries()) {
      if (!Number.isInteger(position) || position < 1) {
        errors.push(`${path}.round_position[${round}]: expected a positive integer (got ${JSON.stringify(position)})`)
      }
    }
  }
  return errors
}

export function validateData(data) {
  if (!Array.isArray(data)) return ["data: expected an array of results"]
  const errors = []
  const dates = new Map()
  let previousDate = null
  for (const [index, result] of data.entries()) {
    errors.push(...validateResult(result, `result[${index}]`))
    if (!isObject(result) || !validDate(result.date)) continue
    if (dates.has(result.date)) {
      errors.push(`result[${index}].date: duplicates result[${dates.get(result.date)}] (${result.date})`)
    }
    if (previousDate && result.date < previousDate) {
      errors.push(`result[${index}].date: ${result.date} is out of chronological order`)
    }
    dates.set(result.date, index)
    previousDate = result.date
  }
  return errors
}
