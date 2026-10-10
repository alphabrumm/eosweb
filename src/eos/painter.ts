/**
 * Zeichnet EOS-Fenster auf ein HTML-Canvas. Nachbildung von TDrawCanvas (UDaten.pas)
 * mit dem Verhalten der Windows-GDI (Stifte, schraffierte Pinsel, Rechtecke ohne rechte/untere Kante …).
 */

import { BS, Fenster, PS } from "./classes.js";
import { DrawCanvas, dround } from "./types.js";

export function cssColor(c: number): string {
    return `rgb(${c & 0xFF},${(c >> 8) & 0xFF},${(c >> 16) & 0xFF})`;
}

type Ctx = CanvasRenderingContext2D;

const DASHES: Record<number, number[]> = {
    [PS.dash]: [18, 6],
    [PS.dot]: [3, 3],
    [PS.dashDot]: [9, 6, 3, 6],
    [PS.dashDotDot]: [9, 3, 3, 3, 3, 3],
};

const patternCache = new Map<string, HTMLCanvasElement>();

function hatchCanvas(style: number, color: number): HTMLCanvasElement {
    const key = style + ":" + color;
    let c = patternCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = 8; c.height = 8;
    const g = c.getContext("2d")!;
    g.fillStyle = cssColor(color);
    for (let i = 0; i < 8; i++) {
        switch (style) {
            case BS.horizontal: g.fillRect(i, 7, 1, 1); break;
            case BS.vertical: g.fillRect(7, i, 1, 1); break;
            case BS.fDiagonal: g.fillRect(i, i, 1, 1); break;
            case BS.bDiagonal: g.fillRect(i, 7 - i, 1, 1); break;
            case BS.cross: g.fillRect(i, 7, 1, 1); g.fillRect(7, i, 1, 1); break;
            case BS.diagCross: g.fillRect(i, i, 1, 1); g.fillRect(i, 7 - i, 1, 1); break;
        }
    }
    patternCache.set(key, c);
    return c;
}

export class CanvasDC implements DrawCanvas {
    pen = { color: 0, width: 1, style: PS.solid };
    brush = { color: 0xFFFFFF, style: BS.solid };
    font = { name: "Arial", size: 12, color: 0 };
    xmin: number;
    ymin: number;
    private cx = 0;
    private cy = 0;

    constructor(public ctx: Ctx, public width: number, public height: number) {
        this.xmin = dround(width / 2);
        this.ymin = dround(height / 2);
    }

    xW(x: number) { return dround(x) + this.xmin; }
    yW(y: number) { return -dround(y) + this.ymin; }
    xScrToW(x: number) { return Math.round(x) - this.xmin; }
    yScrToW(y: number) { return this.ymin - Math.round(y); }

    /** Bereitet den Stift vor; liefert false, wenn nichts gezeichnet werden soll (unsichtbar) */
    private applyPen(): boolean {
        const ctx = this.ctx;
        if (this.pen.style == PS.clear) return false;
        const w = Math.max(1, this.pen.width);
        ctx.lineWidth = w;
        ctx.strokeStyle = cssColor(this.pen.color);
        // Gestrichelte Linien gibt es unter Windows nur mit Stiftbreite 1
        ctx.setLineDash(w <= 1 && DASHES[this.pen.style] ? DASHES[this.pen.style] : []);
        ctx.lineCap = w > 1 ? "round" : "butt";
        ctx.lineJoin = w > 1 ? "round" : "miter";
        return true;
    }

    private offset(): number {
        return Math.max(1, this.pen.width) % 2 == 1 ? 0.5 : 0;
    }

    private fill(rule: CanvasFillRule = "nonzero") {
        const ctx = this.ctx;
        const s = this.brush.style;
        if (s == BS.clear) return;
        if (s == BS.solid) {
            ctx.fillStyle = cssColor(this.brush.color);
        } else {
            const p = ctx.createPattern(hatchCanvas(s, this.brush.color), "repeat");
            if (!p) return;
            ctx.fillStyle = p;
        }
        ctx.fill(rule);
    }

    rectangle(x1: number, y1: number, x2: number, y2: number) {
        if (x1 > x2) [x1, x2] = [x2, x1];
        if (y1 > y2) [y1, y2] = [y2, y1];
        const ctx = this.ctx;
        const o = this.offset();
        ctx.beginPath();
        ctx.rect(x1 + o, y1 + o, Math.max(0, x2 - 1 - x1), Math.max(0, y2 - 1 - y1));
        this.fill();
        if (this.applyPen()) ctx.stroke();
    }

    ellipse(x1: number, y1: number, x2: number, y2: number) {
        if (x1 > x2) [x1, x2] = [x2, x1];
        if (y1 > y2) [y1, y2] = [y2, y1];
        const ctx = this.ctx;
        const rx = Math.max(0, (x2 - x1 - 1) / 2), ry = Math.max(0, (y2 - y1 - 1) / 2);
        const o = this.offset();
        ctx.beginPath();
        ctx.ellipse(x1 + rx + o, y1 + ry + o, rx, ry, 0, 0, Math.PI * 2);
        this.fill();
        if (this.applyPen()) ctx.stroke();
    }

    polygon(pts: number[][]) {
        if (pts.length == 0) return;
        const ctx = this.ctx;
        const o = this.offset();
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + o, pts[0][1] + o);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + o, pts[i][1] + o);
        ctx.closePath();
        this.fill("evenodd");
        if (this.applyPen()) ctx.stroke();
    }

    moveTo(x: number, y: number) { this.cx = x; this.cy = y; }

    lineTo(x: number, y: number) {
        const ctx = this.ctx;
        if (this.applyPen()) {
            const o = this.offset();
            ctx.beginPath();
            ctx.moveTo(this.cx + o, this.cy + o);
            ctx.lineTo(x + o, y + o);
            ctx.stroke();
        }
        this.cx = x; this.cy = y;
    }

    private fontPx() { return Math.max(1, Math.round(this.font.size * 96 / 72)); }

    private applyFont() {
        this.ctx.font = `${this.fontPx()}px "${this.font.name}", Arial, Helvetica, "Liberation Sans", sans-serif`;
    }

    textOut(x: number, y: number, s: string) {
        const ctx = this.ctx;
        this.applyFont();
        ctx.fillStyle = cssColor(this.font.color);
        ctx.textBaseline = "alphabetic";
        ctx.fillText(s, x, y + Math.round(this.fontPx() * 0.905));
    }

    textWidth(s: string) {
        this.applyFont();
        return Math.round(this.ctx.measureText(s).width);
    }

    textHeight(_s: string) {
        return Math.round(this.fontPx() * 1.15);
    }

    setPixel(x: number, y: number, c: number) {
        this.ctx.fillStyle = cssColor(c);
        this.ctx.fillRect(x, y, 1, 1);
    }

    /** Hintergrund und Gitter (TDrawCanvas.paintall) */
    paintBackground(f: Fenster) {
        const ctx = this.ctx;
        ctx.setLineDash([]);
        ctx.fillStyle = cssColor(f.hintergrund);
        ctx.fillRect(0, 0, this.width, this.height);
        if (!f.gitterEin) return;
        const g = Math.max(1, f.strichabstand.value | 0);
        ctx.strokeStyle = cssColor(f.gitter);
        ctx.lineWidth = 1;
        ctx.lineCap = "butt";
        ctx.beginPath();
        const nx = Math.ceil(this.xmin / g) + 1, ny = Math.ceil(this.ymin / g) + 1;
        for (let i = 0; i <= nx; i++) {
            for (const x of [this.xmin + i * g, this.xmin - i * g]) {
                ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.height);
            }
        }
        for (let i = 0; i <= ny; i++) {
            for (const y of [this.ymin + i * g, this.ymin - i * g]) {
                ctx.moveTo(0, y + 0.5); ctx.lineTo(this.width, y + 0.5);
            }
        }
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.xmin + 0.5, 0); ctx.lineTo(this.xmin + 0.5, this.height);
        ctx.moveTo(0, this.ymin + 0.5); ctx.lineTo(this.width, this.ymin + 0.5);
        ctx.stroke();
    }

    /** Alles zeichnen; ohneTurtles für die Punkt-Prüfung der Turtle */
    paintAll(f: Fenster, ohneTurtles = false) {
        this.pen = { color: 0, width: 1, style: PS.solid };
        this.brush = { color: 0xFFFFFF, style: BS.solid };
        this.paintBackground(f);
        for (const o of f.objects) o.paint(this);
        if (ohneTurtles) return;
        for (let i = f.turtles.length - 1; i >= 0; i--) f.turtles[i].paint(this);
    }
}
