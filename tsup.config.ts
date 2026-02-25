import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/index.ts", "src/compose/frame-worker.ts"],
  format: ["esm"],
  dts: {
    entry: ["src/index.ts"],
  },
  splitting: false,
  sourcemap: false,
  clean: true,
  target: "node18",
  outDir: "dist",
});
