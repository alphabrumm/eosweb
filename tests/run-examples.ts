// Führt alle Beispielprogramme headless aus (begrenzte Schrittzahl) und meldet Fehler.
import { readFileSync, readdirSync } from "fs";
import { parse } from "../src/eos/parser.js";
import { Runtime } from "../src/eos/runtime.js";
import { DrawCanvas } from "../src/eos/types.js";

const dir = process.argv[2] || "examples";
const maxSteps = parseInt(process.argv[3] || "200000");

class NullCanvas implements DrawCanvas {
    pen = { color: 0, width: 1, style: 0 }; brush = { color: 0, style: 0 }; font = { name: "Arial", size: 12, color: 0 };
    ops = 0;
    xW(x: number) { return Math.round(x) + 220; }
    yW(y: number) { return -Math.round(y) + 175; }
    rectangle() { this.ops++; }
    ellipse() { this.ops++; }
    polygon() { this.ops++; }
    moveTo() { }
    lineTo() { this.ops++; }
    textOut() { this.ops++; }
    textWidth(s: string) { return s.length * 7; }
    textHeight() { return 18; }
    setPixel() { }
}

let failed = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith(".eos")).sort()) {
    const text = readFileSync(dir + "/" + f, "utf8");
    const r = parse(text);
    if (r.error) {
        console.log(`✗ ${f}: Syntax Z.${r.error.pos.line} Sp.${r.error.pos.col}: ${r.error.message}`);
        failed++;
        continue;
    }
    const rt = new Runtime(r.program!, () => 0.5);
    const gen = rt.run();
    let steps = 0, err: any = null;
    try {
        while (steps < maxSteps) { const n = gen.next(); if (n.done) break; steps++; }
    } catch (e: any) { err = e; }
    const c = new NullCanvas();
    for (const w of rt.windows) { for (const o of w.objects) o.paint(c); for (const t of w.turtles) t.paint(c); }
    if (err) { console.log(`✗ ${f}: Laufzeit Z.${err.pos?.line}: ${err.message}`); if (!err.pos) console.log(err.stack); failed++; }
    else console.log(`✓ ${f}: ${steps} Schritte${steps >= maxSteps ? " (abgebrochen)" : ""}, Fenster ${rt.windows.length}, Objekte ${rt.windows.map(w => w.objects.length + "+" + w.turtles.length + "T").join(",")}, Zeichenoperationen ${c.ops}`);
}
process.exit(failed ? 1 : 0);
