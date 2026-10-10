// Schriften lokal ausliefern (keine Verbindung zu Google & Co., datenschutzfreundlich)
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./eos.css";
import { App } from "./App.js";

declare var APP_VERSION: string;

function boot() {
    const root = document.getElementById("eos-app")!;
    try {
        new App(root).start();
    } catch (e: any) {
        console.error(e);
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="jp-fatal"><h1>EOS Web konnte nicht starten</h1>
            <p>Lade die Seite neu. Wenn das nicht hilft, nutze einen aktuellen Browser (Safari ab iOS 16, Chrome, Edge, Firefox).</p>
            <pre>${String(e?.message || e).replace(/</g, "&lt;")}</pre></div>`;
    }
    console.log("EOS Web " + APP_VERSION);
}

if (document.readyState == "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

// Offline-Fähigkeit (nur im fertigen Build und nicht als Einzeldatei)
if ("serviceWorker" in navigator && !import.meta.env.DEV && !(window as any).EOS_SINGLE_FILE && location.protocol == "https:") {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./eos-sw.js").catch(e => console.warn("Service Worker:", e));
    });
}
