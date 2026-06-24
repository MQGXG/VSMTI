import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@mira/core", "@modelcontextprotocol/sdk", "effect", "zod", "docx"] })],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: { main: resolve(__dirname, "packages/electron/src/main/index.ts") },
      },
    },
    resolve: {
      alias: [
        {
          find: /^@mira\/core(\/.*)?$/,
          replacement: resolve(__dirname, "packages/core/src") + "$1",
        },
      ],
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: { preload: resolve(__dirname, "packages/electron/src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: ".",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: { index: resolve(__dirname, "index.html") },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@mira/core": resolve(__dirname, "packages/core/src"),
        "@mira/ui": resolve(__dirname, "packages/ui/src"),
        "@mira/electron": resolve(__dirname, "packages/electron/src"),
      },
    },
  },
});
