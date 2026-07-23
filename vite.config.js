import { defineConfig } from "vite";
import { handleAiRequest, handleTestRequest } from "./server/ai-handler.js";

function apiPlugin() {
  return {
    name: "my-dairy-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/ai" && url !== "/api/test") return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-provider, x-model, x-base-url, x-effort");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = raw ? JSON.parse(raw) : {};
          const headers = {
            "x-api-key": req.headers["x-api-key"],
            "x-provider": req.headers["x-provider"],
            "x-model": req.headers["x-model"],
            "x-base-url": req.headers["x-base-url"],
            "x-effort": req.headers["x-effort"],
          };
          const result =
            url === "/api/test"
              ? await handleTestRequest({ headers, body })
              : await handleAiRequest({ headers, body });
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify(result.body));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error.message || "Server error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [apiPlugin()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
