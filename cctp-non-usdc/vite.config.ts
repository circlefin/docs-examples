import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/iris/testnet": {
        target: "https://iris-api-sandbox.circle.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/iris\/testnet/, ""),
        timeout: 60_000,
        proxyTimeout: 60_000,
      },
    },
  },
});
