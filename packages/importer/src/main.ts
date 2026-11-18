const app = document.querySelector<HTMLDivElement>("#app")

if (!app) {
  throw new Error("Missing app element")
}

app.textContent = "Hello, world!"
