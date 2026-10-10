/**
 * Steuert den Programmlauf: Start, Pause, Einzelschritt, Stopp, Tempo und Haltepunkte.
 * Die Tempostufen entsprechen genau denen von EOS (UMain.pas): Zeitabstand des Timers
 * und Anzahl der zeichnenden Befehle pro Timer-Takt. Stufe 31 („maximal“) gibt es zusätzlich.
 */

import { EosError, Program } from "./ast.js";
import { Runtime, Step } from "./runtime.js";

export type RunState = "stopped" | "running" | "paused" | "finished" | "error";

const MILLISEKUNDEN = [2000, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const BEFEHLSANZAHL = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Windows-Timer laufen höchstens mit etwa 64 Takten pro Sekunde */
const MIN_TAKT = 1000 / 64;

export const SPEED_MAX = 31;

export function speedLabel(level: number): string {
    if (level >= SPEED_MAX) return "maximal";
    const ms = Math.max(MILLISEKUNDEN[level - 1], MIN_TAKT);
    const proSek = 1000 / ms * BEFEHLSANZAHL[level - 1];
    if (proSek < 1) return (1 / proSek).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " s je Befehl";
    return Math.round(proSek).toLocaleString("de-DE") + " Befehle/s";
}

export type RunnerEvents = {
    onState: (s: RunState) => void;
    /** Aktuelle Programmzeile (1-basiert) oder null */
    onLine: (line: number | null) => void;
    /** Grafik neu zeichnen */
    onRender: () => void;
    onError: (e: EosError) => void;
    onWindows: () => void;
    /** Variablenansicht aktualisieren */
    onVariables: () => void;
};

export class Runner {
    state: RunState = "stopped";
    speed = 30;
    breakpoints = new Set<number>();
    runtime: Runtime | null = null;
    private gen: Generator<Step, void, void> | null = null;
    private pending: Step | null = null;
    private skipBreakpoint = false;
    private raf = 0;
    private lastTime = 0;
    private acc = 0;
    private needsRender = false;
    private lastVarUpdate = 0;

    constructor(private ev: RunnerEvents) { }

    get einzelBefehlsModus() { return this.speed < 15; }

    start(program: Program, paused = false) {
        this.stop(true);
        this.runtime = new Runtime(program);
        this.runtime.onWindowsChanged = () => this.ev.onWindows();
        this.gen = this.runtime.run();
        this.skipBreakpoint = false;
        this.ev.onWindows();
        if (!this.advance()) return;
        this.setState(paused ? "paused" : "running");
        if (paused) this.ev.onLine(this.pending!.pos.line);
        else this.loop();
        this.ev.onRender();
        this.ev.onVariables();
    }

    pause() {
        if (this.state != "running") return;
        this.setState("paused");
        cancelAnimationFrame(this.raf);
        this.ev.onLine(this.pending?.pos.line ?? null);
        this.ev.onRender();
        this.ev.onVariables();
    }

    resume() {
        if (this.state != "paused") return;
        this.skipBreakpoint = true;
        this.setState("running");
        if (!this.einzelBefehlsModus) this.ev.onLine(null);
        this.loop();
    }

    /** Einen Schritt ausführen (im Pausenzustand) */
    step() {
        if (this.state != "paused") return;
        this.skipBreakpoint = true;
        this.exec(1, 1);
        if (this.state == "paused") {
            this.ev.onLine(this.pending?.pos.line ?? null);
        }
        this.ev.onRender();
        this.ev.onVariables();
    }

    stop(silent = false) {
        cancelAnimationFrame(this.raf);
        const was = this.state;
        this.gen = null;
        this.pending = null;
        if (silent) { this.state = "stopped"; return; }
        if (was == "running" || was == "paused") {
            this.setState("stopped");
            this.ev.onLine(null);
            this.ev.onVariables();
        }
    }

    setSpeed(level: number) {
        this.speed = Math.max(1, Math.min(SPEED_MAX, level));
        if (this.state == "running" && !this.einzelBefehlsModus) this.ev.onLine(null);
    }

    toggleBreakpoint(line: number) {
        if (this.breakpoints.has(line)) this.breakpoints.delete(line);
        else this.breakpoints.add(line);
    }

    private setState(s: RunState) {
        this.state = s;
        this.ev.onState(s);
    }

    /** Holt den ersten Schritt. false, wenn das Programm sofort zu Ende ist. */
    private advance(): boolean {
        try {
            const r = this.gen!.next();
            if (r.done) { this.finish(); return false; }
            this.pending = r.value;
            return true;
        } catch (e) {
            this.fail(e);
            return false;
        }
    }

    private finish() {
        cancelAnimationFrame(this.raf);
        this.gen = null;
        this.pending = null;
        this.setState("finished");
        this.ev.onLine(null);
        this.ev.onRender();
        this.ev.onVariables();
    }

    private fail(e: any) {
        cancelAnimationFrame(this.raf);
        let err: EosError;
        if (e instanceof EosError) err = e;
        else if (e instanceof RangeError) {
            err = new EosError("Zu viele ineinander verschachtelte Methodenaufrufe. Ruft sich eine Methode endlos selbst auf?",
                this.pending?.pos ?? { from: 0, to: 0, line: 1, col: 1 }, "laufzeit");
        } else {
            console.error(e);
            err = new EosError("Interner Fehler: " + (e?.message || e), this.pending?.pos ?? { from: 0, to: 0, line: 1, col: 1 }, "laufzeit");
        }
        this.gen = null;
        this.pending = null;
        this.setState("error");
        this.ev.onLine(null);
        this.ev.onRender();
        this.ev.onVariables();
        this.ev.onError(err);
    }

    /**
     * Führt Befehle aus: höchstens maxPainted zeichnende Befehle und höchstens maxAll Befehle insgesamt.
     * Liefert false, wenn der Lauf angehalten wurde (Ende, Fehler, Haltepunkt).
     */
    private exec(maxPainted: number, maxAll: number, deadline = Infinity): boolean {
        let i = maxPainted, j = maxAll, n = 0;
        while (this.gen && this.pending && i > 0 && j > 0) {
            const p = this.pending;
            if (!this.skipBreakpoint && this.breakpoints.has(p.pos.line)) {
                if (this.state == "running") {
                    this.setState("paused");
                    this.ev.onLine(p.pos.line);
                    this.needsRender = true;
                    this.ev.onVariables();
                }
                return false;
            }
            this.skipBreakpoint = false;
            let r: IteratorResult<Step, void>;
            try {
                r = this.gen.next();
            } catch (e) {
                this.pending = p;
                this.fail(e);
                return false;
            }
            if (p.painted) { i--; this.needsRender = true; }
            j--;
            if (r.done) { this.finish(); return false; }
            this.pending = r.value;
            if ((++n & 63) == 0 && performance.now() > deadline) break;
        }
        return true;
    }

    private loop() {
        cancelAnimationFrame(this.raf);
        this.lastTime = performance.now();
        // Erster Takt sofort (wie der Timer im Original)
        this.acc = Math.max(MILLISEKUNDEN[Math.min(this.speed, 30) - 1], MIN_TAKT);
        const frame = (now: number) => {
            if (this.state != "running") return;
            const dt = Math.min(now - this.lastTime, 250);
            this.lastTime = now;
            let ok = true;
            if (this.speed >= SPEED_MAX) {
                ok = this.exec(Infinity, Infinity, now + 14);
            } else {
                const period = Math.max(MILLISEKUNDEN[this.speed - 1], MIN_TAKT);
                this.acc += dt;
                let ticks = Math.floor(this.acc / period);
                this.acc -= ticks * period;
                ticks = Math.min(ticks, 6);
                for (let t = 0; t < ticks && ok && this.state == "running"; t++) {
                    ok = this.exec(BEFEHLSANZAHL[this.speed - 1], this.einzelBefehlsModus ? 1 : 100);
                    if (this.einzelBefehlsModus && this.pending && this.state == "running") this.ev.onLine(this.pending.pos.line);
                }
            }
            if (this.needsRender) { this.needsRender = false; this.ev.onRender(); }
            if (now - this.lastVarUpdate > 300) { this.lastVarUpdate = now; this.ev.onVariables(); }
            if (this.state == "running") this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }

    /** Aktuelle Programmzeile (bei Pause) */
    get currentLine(): number | null { return this.pending?.pos.line ?? null; }
}
