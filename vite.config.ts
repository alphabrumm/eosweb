import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

export default defineConfig({
    base: "./",
    define: {
        APP_VERSION: JSON.stringify(pkg.version + " (" + new Date().toISOString().substring(0, 10) + ")"),
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        target: "es2020",
        chunkSizeWarningLimit: 1500,
    },
});
