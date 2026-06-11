import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev фронт работает на 5173 и проксирует /api на Fastify (3000).
// В проде статику раздаёт сам Fastify из client/dist.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: "dist",
    },
});
