import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["jolt-ts", "jolt-ts/native/jolt/dist/jolt-physics.wasm.js"]
  },
  build: {
    outDir: "demo-dist",
    emptyOutDir: true
  }
});
