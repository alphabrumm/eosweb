import { defineConfig } from "vite";
import base from "./vite.config";

// Einzeldatei-Version (alles in einer HTML-Datei), z. B. zum Ausprobieren ohne Webspace
export default defineConfig({
    ...base,
    build: { ...base.build, outDir: "dist-single", assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false, copyPublicDir: false },
});
