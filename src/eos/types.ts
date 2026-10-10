/**
 * Grundlegende Datentypen von EOS: Werte, Attribute, Methoden, Objekte.
 * Entspricht UDaten.pas (TVariant, TAttribut, TMethode, TObjekt).
 */

export type VType = "boolean" | "char" | "integer" | "real" | "string" | "objekt" | "keiner";

export type TypeRef = { vt: VType, ci: number };

export const TYPE_NAMES: Record<VType, string> = {
    boolean: "Boolean", char: "Char", integer: "Integer", real: "Real", string: "String", objekt: "Objekt", keiner: ""
};

/** Delphi-Round: kaufmännisch, bei genau .5 auf die gerade Zahl (Banker's Rounding) */
export function dround(x: number): number {
    const f = Math.floor(x);
    const d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 == 0 ? f : f + 1;
}

export function dtrunc(x: number): number {
    return Math.trunc(x);
}

/** Wie Delphis FloatToStr (15 signifikante Stellen, Exponentialschreibweise nur bei Bedarf) */
export function floatToStr(d: number): string {
    if (Number.isNaN(d)) return "NAN";
    if (!isFinite(d)) return d > 0 ? "INF" : "-INF";
    if (d == 0) return "0";
    const abs = Math.abs(d);
    if (abs >= 1e15 || abs < 0.00001) {
        let [m, e] = d.toExponential(14).split("e");
        if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
        const exp = parseInt(e, 10);
        return m + "E" + (exp < 0 ? "-" : "") + String(Math.abs(exp)).padStart(exp < 0 && Math.abs(exp) < 10 ? 1 : 1, "0");
    }
    let s = d.toPrecision(15);
    if (s.includes("e")) s = String(parseFloat(s));
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
}

/** 32-Bit-Ganzzahl wie Integer in Delphi (Überlauf läuft um) */
export function int32(x: number): number {
    return x | 0;
}

export class Attribut {
    hidden = false;
    value: any;
    constructor(public name: string, public owner: EosObjekt | null, public vt: VType, public ci: number) {
        switch (vt) {
            case "boolean": this.value = false; break;
            case "integer": case "real": this.value = 0; break;
            case "string": this.value = ""; break;
            case "char": this.value = "\0"; break;
            default: this.value = null;
        }
    }
    /** Nach einer Zuweisung von außen (TAttribut.wurdegeaendert) */
    wurdeGeaendert() {
        this.owner?.attributaenderung(this);
    }
}

export type Param = { name: string, vt: VType, ci: number, isVar: boolean };

export type MethodKind = "objekt" | "system" | "selbst" | "setze";

export class Methode {
    hidden = false;
    params: Param[] = [];
    ret: TypeRef | null = null;
    /** für Objektmethoden */
    obj: EosObjekt | null = null;
    nummer = 0;
    /** für Setze-Methoden (attributSetzen) */
    attr: Attribut | null = null;
    /** für Systemfunktionen (sin, cos, …) */
    fn: ((args: any[]) => any) | null = null;
    /** für selbstgeschriebene Methoden: Knoten im Syntaxbaum */
    decl: any = null;
    /** Kurzbeschreibung für Hilfe und Vervollständigung */
    doc = "";

    constructor(public name: string, public kind: MethodKind) { }

    addParam(name: string, vt: VType, ci = 0, isVar = false): this {
        this.params.push({ name, vt, ci, isVar });
        return this;
    }
}

export function objMethod(name: string, obj: EosObjekt, nummer: number, ret: VType = "keiner", retCi = 0): Methode {
    const m = new Methode(name, "objekt");
    m.obj = obj;
    m.nummer = nummer;
    if (ret != "keiner") m.ret = { vt: ret, ci: retCi };
    return m;
}

export function setzeMethode(a: Attribut): Methode {
    const m = new Methode(a.name + "Setzen", "setze");
    m.attr = a;
    m.addParam(a.name, a.vt, a.ci);
    return m;
}

/** Zeichenfläche, auf der die Objekte sich selbst zeichnen (TDrawCanvas). */
export interface DrawCanvas {
    xW(x: number): number;
    yW(y: number): number;
    pen: { color: number, width: number, style: number };
    brush: { color: number, style: number };
    font: { name: string, size: number, color: number };
    rectangle(x1: number, y1: number, x2: number, y2: number): void;
    ellipse(x1: number, y1: number, x2: number, y2: number): void;
    polygon(pts: number[][]): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    textOut(x: number, y: number, s: string): void;
    textWidth(s: string): number;
    textHeight(s: string): number;
    setPixel(x: number, y: number, color: number): void;
}

export abstract class EosObjekt {
    klassenname = "";
    ci = 0;
    attribute: Attribut[] = [];
    methoden: Methode[] = [];
    zeichenbar = false;
    /** eindeutige Nummer (für die Variablenansicht) */
    readonly uid = ++EosObjekt.counter;
    static counter = 0;

    constructor(public name: string, public owner: EosObjekt | null) { }

    addAttribut(a: Attribut) { this.attribute.push(a); return a; }
    addMethode(m: Methode) { this.methoden.push(m); return m; }

    createSetzeMethoden(inheritedFlag: boolean) {
        if (inheritedFlag) return;
        for (const a of this.attribute) if (!a.hidden) this.addMethode(setzeMethode(a));
    }

    getAttribut(name: string): Attribut | null {
        const n = name.toLowerCase();
        for (const a of this.attribute) if (!a.hidden && a.name.toLowerCase() == n) return a;
        return null;
    }

    getMethode(name: string): Methode | null {
        const n = name.toLowerCase();
        for (const m of this.methoden) if (!m.hidden && m.name.toLowerCase() == n) return m;
        return null;
    }

    attributaenderung(_a: Attribut | null): void { }
    methodenaufruf(_nummer: number, _args: any[]): any { return undefined; }
    paint(_c: DrawCanvas): void { }
    abstract kopie(name: string, owner: EosObjekt | null): EosObjekt;
    copyfrom(_o: EosObjekt): void { }
    /** Wird aufgerufen, wenn das Objekt gelöscht wird (lokale Variablen) */
    dispose(): void { }
}
