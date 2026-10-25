import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Pin TZ so date tests can distinguish local from UTC behaviour.
process.env.TZ = "America/Los_Angeles";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
