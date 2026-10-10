/**
 * Zeichenfenster: Jedes EOS-FENSTER wird als Fläche in der Ausgabe gezeigt.
 * Der Ursprung liegt wie im Original in der Mitte, die y-Achse zeigt nach oben.
 * Ist die Fläche kleiner als das Original-Zeichenfenster (440 × 350), wird verkleinert,
 * damit auf dem Handy nichts abgeschnitten wird.
 */

import { Fenster } from "../eos/classes.js";
import { CanvasDC, cssColor } from "../eos/painter.js";
import { Runtime } from "../eos/runtime.js";
import { escapeHtml } from "./language.js";

const BASE_W = 440, BASE_H = 350;

class FensterView {
    el: HTMLElement;
    canvas: HTMLCanvasElement;
    private title: HTMLElement;
    private coords: HTMLElement;
    private scale = 1;
    private lw = BASE_W;
    private lh = BASE_H;
    private coordTimer: any;
    private probeCanvas: HTMLCanvasElement | null = null;
    private probeKey = "";
    private probeCtx: CanvasRenderingContext2D | null = null;
    lastVersion = -1;

    constructor(public fenster: Fenster | null, private runtime: () => Runtime | null) {
        this.el = document.createElement("div");
        this.el.className = "eo-window";
        this.el.innerHTML = `<div class="eo-window-title"></div><div class="eo-window-body"><canvas></canvas><div class="eo-coords" hidden></div></div>`;
        this.title = this.el.querySelector(".eo-window-title")!;
        this.canvas = this.el.querySelector("canvas")!;
        this.coords = this.el.querySelector(".eo-coords")!;
        this.canvas.addEventListener("pointerdown", e => { this.showCoords(e); this.canvas.setPointerCapture(e.pointerId); });
        this.canvas.addEventListener("pointermove", e => { if (e.pressure > 0 || e.pointerType == "mouse") this.showCoords(e); });
        this.canvas.addEventListener("pointerup", () => this.hideCoordsSoon());
        this.canvas.addEventListener("pointerleave", () => this.hideCoordsSoon());
    }

    private showCoords(e: PointerEvent) {
        const r = this.canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) / this.scale, py = (e.clientY - r.top) / this.scale;
        const dc = new CanvasDC(null as any, this.lw, this.lh);
        this.coords.textContent = `x: ${dc.xScrToW(px)}   y: ${dc.yScrToW(py)}`;
        this.coords.hidden = false;
        clearTimeout(this.coordTimer);
    }

    private hideCoordsSoon() {
        clearTimeout(this.coordTimer);
        this.coordTimer = setTimeout(() => this.coords.hidden = true, 1800);
    }

    render() {
        const f = this.fenster;
        const name = f ? (f.aname.value as string) : "";
        this.title.innerHTML = escapeHtml(name || (f?.variablenname ? f.variablenname : "Zeichenfenster"));
        const body = this.canvas.parentElement!;
        const cssW = Math.max(10, body.clientWidth), cssH = Math.max(10, body.clientHeight);
        this.scale = Math.min(1, cssW / BASE_W, cssH / BASE_H);
        this.lw = Math.round(cssW / this.scale);
        this.lh = Math.round(cssH / this.scale);
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
        if (this.canvas.width != pw || this.canvas.height != ph) {
            this.canvas.width = pw; this.canvas.height = ph;
        }
        this.canvas.style.width = cssW + "px";
        this.canvas.style.height = cssH + "px";
        const ctx = this.canvas.getContext("2d")!;
        ctx.setTransform(pw / this.lw, 0, 0, ph / this.lh, 0, 0);
        const dc = new CanvasDC(ctx, this.lw, this.lh);
        if (f) dc.paintAll(f);
        else dc.paintBackground(EMPTY_FENSTER);
        this.lastVersion = f ? f.version : -1;
    }

    /** Ist an der Stelle (Weltkoordinaten) etwas außer Hintergrund und Gitter? */
    probe(x: number, y: number): boolean {
        const f = this.fenster;
        if (!f) return false;
        const rt = this.runtime();
        const key = (rt?.sceneVersion ?? 0) + ":" + this.lw + "x" + this.lh;
        if (!this.probeCanvas) {
            this.probeCanvas = document.createElement("canvas");
        }
        if (key != this.probeKey) {
            this.probeCanvas.width = this.lw; this.probeCanvas.height = this.lh;
            this.probeCtx = this.probeCanvas.getContext("2d", { willReadFrequently: true })!;
            new CanvasDC(this.probeCtx, this.lw, this.lh).paintAll(f, true);
            this.probeKey = key;
        }
        const dc = new CanvasDC(this.probeCtx!, this.lw, this.lh);
        const sx = dc.xW(x), sy = dc.yW(y);
        if (sx < 0 || sy < 0 || sx >= this.lw || sy >= this.lh) return true;
        const d = this.probeCtx!.getImageData(sx, sy, 1, 1).data;
        const c = d[0] + 256 * d[1] + 65536 * d[2];
        return !(c == f.hintergrund || (f.gitterEin && c == f.gitter));
    }

    async toBlob(): Promise<Blob | null> {
        return new Promise(res => this.canvas.toBlob(b => res(b), "image/png"));
    }
}

const EMPTY_FENSTER = new Fenster("", null);

export class GraphicsView {
    private views: FensterView[] = [];
    private runtime: Runtime | null = null;
    private placeholder: FensterView;
    private resizeObserver: ResizeObserver;

    constructor(private host: HTMLElement) {
        this.placeholder = new FensterView(null, () => null);
        this.placeholder.el.classList.add("is-placeholder");
        this.host.appendChild(this.placeholder.el);
        this.resizeObserver = new ResizeObserver(() => this.renderAll(true));
        this.resizeObserver.observe(this.host);
        requestAnimationFrame(() => this.renderAll(true));
    }

    setRuntime(rt: Runtime | null) {
        this.runtime = rt;
        if (rt) rt.pixelProbe = (f, x, y) => this.views.find(v => v.fenster == f)?.probe(x, y) ?? false;
        this.syncWindows();
    }

    /** Fenster des Programms mit den Anzeigeflächen abgleichen */
    syncWindows() {
        const windows = this.runtime?.windows ?? [];
        // Fenster ohne Inhalt, die nie benutzt wurden, trotzdem zeigen (wie im Original)
        this.views = this.views.filter(v => {
            if (windows.includes(v.fenster!)) return true;
            v.el.remove();
            return false;
        });
        for (const f of windows) {
            if (!this.views.some(v => v.fenster == f)) {
                const v = new FensterView(f, () => this.runtime);
                this.views.push(v);
            }
        }
        // Reihenfolge herstellen
        this.host.innerHTML = "";
        if (this.views.length == 0) this.host.appendChild(this.placeholder.el);
        for (const v of this.views) this.host.appendChild(v.el);
        this.host.dataset.count = String(Math.max(1, this.views.length));
        this.renderAll(true);
    }

    renderAll(force = false) {
        if (this.views.length == 0) { this.placeholder.render(); return; }
        for (const v of this.views) {
            if (force || v.fenster!.version != v.lastVersion) v.render();
        }
    }

    async exportImage(): Promise<Blob | null> {
        const v = this.views[0] ?? this.placeholder;
        return v.toBlob();
    }

    get hasDrawing() { return this.views.length > 0; }
}

export { cssColor };
