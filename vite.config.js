import { defineConfig, loadEnv } from "vite";
import { handleAiRequest, handleTestRequest } from "./server/ai-handler.js";

function apiPlugin(env) {
  return {
    name: "my-dairy-api",
    configureServer(server) {
      // Make local .env available to the AI handler (same as Vercel env).
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/ai" && url !== "/api/test") return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
          const result =
            url === "/api/test"
              ? await handleTestRequest({ body })
              : await handleAiRequest({ body });
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [apiPlugin(env)],
    server: {
      port: 5173,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
