import { defineConfig } from "vite"
import { createApi } from "./server/api.mjs"

export default defineConfig({
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  plugins: [{
    name: "importer-api",
    configureServer(server) {
      server.middlewares.use("/api", createApi())
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api", createApi())
    },
  }],
})
