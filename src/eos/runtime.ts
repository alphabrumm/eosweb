/**
 * Interpreter für EOS-Programme (entspricht UInterpreter.pas).
 *
 * Das Programm wird als Generator ausgeführt: Vor jeder Anweisung liefert er einen Schritt
 * (Position und ob nach der Anweisung neu gezeichnet würde). So lassen sich Tempo,
 * Einzelschritt und Haltepunkte genau wie im Original steuern.
 */

import { Chain, EosError, Expr, MethodDecl, Pos, Program, Stmt } from "./ast.js";
import { CI, Fenster, Turtle, getKlassenfabrik } from "./classes.js";
import { createGlobals } from "./builtins.js";
import { Attribut, EosObjekt, Methode, TypeRef, VType, dtrunc, floatToStr } from "./types.js";

export type Step = { pos: Pos, painted: boolean };

/** Eine Variable (oder ein Verweis auf ein Attribut bei var-Parametern) */
export class Cell {
    attr: Attribut | null = null;
    constructor(public name: string, public type: TypeRef, public value: any, public system = false) { }
}

class AttrCell extends Cell {
    constructor(name: string, type: TypeRef, private a: Attribut) {
        super(name, type, undefined);
        this.attr = a;
    }
    // @ts-ignore – Zugriff wird auf das Attribut umgeleitet
    get value() { return this.a ? this.a.value : undefined; }
    // @ts-ignore
    set value(v: any) { if (this.a) this.a.value = v; }
}

class Frame {
    vars = new Map<string, Cell>();
    ownObjects: EosObjekt[] = [];
    constructor(public parent: Frame | null, public methodName: string | null) { }
}

const MAX_CALL_DEPTH = 1500;

function defaultValue(vt: VType): any {
    switch (vt) {
        case "boolean": return false;
        case "integer": case "real": return 0;
        case "string": return "";
        case "char": return "\0";
        default: return null;
    }
}

export function valueToString(v: any, t: TypeRef): string {
    switch (t.vt) {
        case "boolean": return v ? "wahr" : "falsch";
        case "integer": return String(v);
        case "real": return floatToStr(v);
        case "string": return "'" + v + "'";
        case "char": return v == "\0" ? "#0" : v;
        default: return "";
    }
}

export class Runtime {
    windows: Fenster[] = [];
    standardFenster: Fenster | null = null;
    private system = new Frame(null, null);
    globals: Frame;
    frame: Frame;
    private fuerObj: EosObjekt | null = null;
    private callDepth = 0;
    private fabrik = getKlassenfabrik();
    /** Zähler für Änderungen an Nicht-Turtle-Objekten (für vorPunkt/aufPunkt) */
    sceneVersion = 0;
    /** Wird von der Oberfläche gesetzt: Ist an dieser Stelle des Fensters etwas gezeichnet? */
    pixelProbe: ((f: Fenster, x: number, y: number) => boolean) | null = null;
    onWindowsChanged: (() => void) | null = null;

    constructor(public program: Program, random?: () => number) {
        for (const g of createGlobals(random)) {
            const c = new Cell(g.name, g.type, g.methode ?? g.value, true);
            this.system.vars.set(g.name.toLowerCase(), c);
        }
        this.globals = new Frame(this.system, null);
        this.frame = this.globals;
        if (program.fensterAutomatisch) {
            this.standardFenster = new Fenster("", null);
            this.standardFenster.variablenname = "";
            this.windows.push(this.standardFenster);
        }
    }

    // ================================================================ Ausführung

    *run(): Generator<Step, void, void> {
        yield* this.block(this.program.body);
    }

    private *block(stmts: Stmt[]): Generator<Step, void, void> {
        for (const s of stmts) yield* this.stmt(s);
    }

    private *stmt(s: Stmt): Generator<Step, void, void> {
        switch (s.k) {
            case "decl":
                yield { pos: s.pos, painted: true };
                this.declare(s);
                return;
            case "assign":
                yield { pos: s.pos, painted: true };
                this.assign(s.target, s.expr);
                return;
            case "call": {
                yield { pos: s.pos, painted: true };
                const p = s.chain.parts[0];
                if (s.chain.parts.length == 1 && p.kind == "userMethod") {
                    yield* this.userCall(p.methode!.decl as MethodDecl, p.args!, s.pos);
                } else {
                    this.evalChain(s.chain);
                }
                return;
            }
            case "wiederholeImmer":
                yield { pos: s.pos, painted: false };
                while (true) {
                    yield* this.block(s.body);
                    yield { pos: s.endPos, painted: false };
                }
            case "wiederholeN": {
                yield { pos: s.pos, painted: false };
                const n = this.eval(s.count);
                for (let i = 0; i < n; i++) {
                    yield* this.block(s.body);
                    yield { pos: s.endPos, painted: false };
                }
                return;
            }
            case "wiederholeSolange":
            case "solange":
                yield { pos: s.pos, painted: false };
                while (this.eval(s.cond)) {
                    yield* this.block(s.body);
                    yield { pos: s.endPos, painted: false };
                }
                return;
            case "wiederholeEnd":
                yield { pos: s.pos, painted: false };
                while (true) {
                    yield* this.block(s.body);
                    yield { pos: s.endPos, painted: false };
                    const c = this.eval(s.cond);
                    if (s.bis ? c : !c) break;
                }
                return;
            case "wenn":
                yield { pos: s.pos, painted: false };
                if (this.eval(s.cond)) {
                    yield* this.block(s.then);
                } else if (s.sonst) {
                    yield* this.block(s.sonst);
                }
                yield { pos: s.endPos, painted: false };
                return;
            case "fuer": {
                yield { pos: s.pos, painted: false };
                const o = this.evalChain(s.obj);
                this.fuerObj = o;
                try {
                    yield* this.block(s.body);
                } finally {
                    this.fuerObj = null;
                }
                yield { pos: s.endPos, painted: false };
                return;
            }
            case "methode":
                yield { pos: s.pos, painted: false };
                return;
        }
    }

    private error(msg: string, pos: Pos): never {
        throw new EosError(msg, pos, "laufzeit");
    }

    // ================================================================ Variablen

    private lookup(name: string, pos: Pos): Cell {
        const n = name.toLowerCase();
        for (let f: Frame | null = this.frame; f; f = f.parent) {
            const c = f.vars.get(n);
            if (c) return c;
        }
        this.error("Den Bezeichner " + name + " gibt es (noch) nicht. Wurde er schon deklariert?", pos);
    }

    private declare(s: Extract<Stmt, { k: "decl" }>) {
        for (const n of s.names) {
            let value: any;
            if (s.type.vt == "objekt") {
                const o = this.fabrik.erstelleObjekt(s.className, n.name)!;
                if (o instanceof Fenster) {
                    o.variablenname = n.name;
                    this.windows.push(o);
                    this.onWindowsChanged?.();
                }
                if (o instanceof Turtle) o.punktTest = (t, x, y) => this.punktTest(t, x, y);
                if (o.ci % 2 == 0 && this.standardFenster) this.standardFenster.addObjekt(o);
                if (this.frame != this.globals) this.frame.ownObjects.push(o);
                value = o;
            } else {
                value = defaultValue(s.type.vt);
            }
            this.frame.vars.set(n.name.toLowerCase(), new Cell(n.name, s.type, value));
        }
        this.sceneVersion++;
    }

    private punktTest(t: Turtle, x: number, y: number): boolean {
        if (!this.pixelProbe) return false;
        const f = this.windows.find(w => w.turtles.includes(t));
        if (!f) return false;
        return this.pixelProbe(f, x, y);
    }

    // ================================================================ Methoden

    private *userCall(decl: MethodDecl, args: Expr[], pos: Pos): Generator<Step, void, void> {
        if (this.callDepth >= MAX_CALL_DEPTH) {
            this.error("Zu viele ineinander verschachtelte Methodenaufrufe (" + MAX_CALL_DEPTH + "). Ruft sich die Methode " + decl.name + " endlos selbst auf?", pos);
        }
        // Parameter im Kontext des Aufrufers auswerten
        const cells: Cell[] = [];
        decl.params.forEach((p, i) => {
            const a = args[i];
            if (p.isVar) {
                const ref = this.evalRef((<any>a).chain);
                const c = ref.attr ? new AttrCell(p.name, p.type, ref.attr) : ref.cell!;
                cells.push(c);
            } else {
                cells.push(new Cell(p.name, p.type, this.convert(this.eval(a), a.type, p.type)));
            }
        });
        const frame = new Frame(this.frame, decl.name);
        decl.params.forEach((p, i) => frame.vars.set(p.name.toLowerCase(), cells[i]));
        const savedFrame = this.frame, savedFuer = this.fuerObj;
        this.frame = frame;
        this.fuerObj = null;
        this.callDepth++;
        try {
            yield* this.block(decl.body);
            yield { pos: decl.endPos, painted: false };
        } finally {
            this.callDepth--;
            this.frame = savedFrame;
            this.fuerObj = savedFuer;
            for (const o of frame.ownObjects) {
                for (const w of this.windows) w.removeObjekt(o);
                o.dispose();
            }
            if (frame.ownObjects.some(o => o instanceof Fenster)) {
                this.windows = this.windows.filter(w => !frame.ownObjects.includes(w));
                this.onWindowsChanged?.();
            }
        }
    }

    private callMethod(m: Methode, obj: EosObjekt | null, args: Expr[], pos: Pos): any {
        const values = m.params.map((p, i) => this.convert(this.eval(args[i]), args[i].type, { vt: p.vt, ci: p.ci }));
        switch (m.kind) {
            case "system":
                return m.fn!(values);
            case "objekt": {
                const target = m.obj!;
                const r = target.methodenaufruf(m.nummer, values);
                this.touched(target);
                if (m.ret) return m.ret.vt == "integer" ? (r | 0) : r;
                return undefined;
            }
            case "setze": {
                const a = m.attr!;
                this.setAttribut(a, values[0]);
                return undefined;
            }
        }
        this.error("Diese Methode kann hier nicht aufgerufen werden.", pos);
        void obj;
    }

    private setAttribut(a: Attribut, v: any) {
        if (a.vt == "objekt") a.value.copyfrom(v);
        else a.value = v;
        a.owner?.attributaenderung(a);
        if (a.owner) this.touched(a.owner);
    }

    private touched(o: EosObjekt) {
        if (!(o instanceof Turtle)) this.sceneVersion++;
        for (const w of this.windows) w.version++;
    }

    // ================================================================ Ketten (r.füllfarbe.rot …)

    /** Wert einer Kette */
    private evalChain(c: Chain): any {
        return this.walk(c).value;
    }

    /** Verweis auf das Ziel einer Kette (für Zuweisungen und var-Parameter) */
    private evalRef(c: Chain): { cell?: Cell, attr?: Attribut, value: any } {
        return this.walk(c);
    }

    private walk(c: Chain): { cell?: Cell, attr?: Attribut, value: any } {
        let cur: { cell?: Cell, attr?: Attribut, value: any } = { value: undefined };
        for (let i = 0; i < c.parts.length; i++) {
            const p = c.parts[i];
            switch (p.kind) {
                case "var": {
                    const cell = this.lookup(p.name, p.pos);
                    cur = { cell, attr: cell.attr ?? undefined, value: cell.value };
                    break;
                }
                case "fuerAttr": {
                    const a = this.fuerObj!.getAttribut(p.name)!;
                    cur = { attr: a, value: a.value };
                    break;
                }
                case "fuerMethod": {
                    const m = this.fuerObj!.getMethode(p.name)!;
                    cur = { value: this.callMethod(m, this.fuerObj, p.args!, p.pos) };
                    break;
                }
                case "system": {
                    const cell = this.lookup(p.name, p.pos);
                    cur = { value: this.callMethod(cell.value as Methode, null, p.args!, p.pos) };
                    break;
                }
                case "userMethod":
                    this.error("Selbstgeschriebene Methoden liefern keinen Wert.", p.pos);
                case "attr": {
                    const o = cur.value as EosObjekt;
                    const a = o.getAttribut(p.name);
                    if (!a) this.error(p.name + " ist kein Attribut von " + o.klassenname + ".", p.pos);
                    cur = { attr: a, value: a.value };
                    break;
                }
                case "method": {
                    const o = cur.value as EosObjekt;
                    const m = o.getMethode(p.name);
                    if (!m) this.error(p.name + " ist keine Methode von " + o.klassenname + ".", p.pos);
                    cur = { value: this.callMethod(m, o, p.args!, p.pos) };
                    break;
                }
            }
        }
        return cur;
    }

    private assign(target: Chain, expr: Expr) {
        const ref = this.evalRef(target);
        const t = target.parts[target.parts.length - 1].type;
        const v = this.convert(this.eval(expr), expr.type, t);
        if (t.vt == "objekt") {
            (ref.value as EosObjekt).copyfrom(v);
            if (ref.attr) {
                ref.attr.wurdeGeaendert();
                if (ref.attr.owner) this.touched(ref.attr.owner);
            } else {
                this.touched(ref.value);
            }
            return;
        }
        if (ref.attr) {
            ref.attr.value = v;
            ref.attr.wurdeGeaendert();
            if (ref.attr.owner) this.touched(ref.attr.owner);
        } else if (ref.cell) {
            ref.cell.value = v;
        }
    }

    // ================================================================ Terme

    private convert(v: any, from: TypeRef, to: TypeRef): any {
        if (to.vt == "string") {
            if (from.vt == "integer") return String(v);
            if (from.vt == "real") return floatToStr(v);
            if (from.vt == "boolean") return v ? "true" : "false";
        }
        return v;
    }

    eval(e: Expr): any {
        switch (e.k) {
            case "int": case "real": case "string": case "bool": return e.value;
            case "chain": {
                const v = this.evalChain(e.chain);
                return e.type.vt == "integer" ? v | 0 : v;
            }
            case "neg": {
                const v = this.eval(e.e);
                return e.type.vt == "integer" ? (-v) | 0 : -v;
            }
            case "not": return !this.eval(e.e);
            case "bin": {
                if (e.op == "und") return this.eval(e.l) && this.eval(e.r);
                if (e.op == "oder") return this.eval(e.l) || this.eval(e.r);
                const l = this.eval(e.l), r = this.eval(e.r);
                switch (e.op) {
                    case "<": return l < r;
                    case ">": return l > r;
                    case "=": return l == r;
                    case "<=": return l <= r;
                    case ">=": return l >= r;
                    case "<>": return l != r;
                    case "+":
                        if (e.type.vt == "string") return this.convert(l, e.l.type, e.type) + this.convert(r, e.r.type, e.type);
                        return e.type.vt == "integer" ? (l + r) | 0 : l + r;
                    case "-": return e.type.vt == "integer" ? (l - r) | 0 : l - r;
                    case "*": return e.type.vt == "integer" ? Math.imul(l, r) : l * r;
                    case "/":
                        if (r == 0) this.error("Division durch 0 ist nicht möglich.", e.pos);
                        return e.type.vt == "integer" ? dtrunc(l / r) | 0 : l / r;
                }
            }
        }
        return undefined;
    }

    // ================================================================ Variablenansicht

    /** Lokale Variablen (aktuelle Methode) und globale Variablen für die Anzeige */
    variablen(): { methode: string | null, lokal: Cell[], global: Cell[] } {
        const lokal = this.frame != this.globals ? [...this.frame.vars.values()] : [];
        const all = [...this.globals.vars.values()];
        const global = [...all.filter(c => c.type.vt != "objekt"), ...all.filter(c => c.type.vt == "objekt")];
        return { methode: this.frame.methodName, lokal, global };
    }
}

export { CI };
