/**
 * Vordefinierte Konstanten und Funktionen (UVariablen.pas, TVarSpace.create).
 */

import { CI, Farbe, PS, BS } from "./classes.js";
import { Methode, TypeRef, VType, dround, dtrunc } from "./types.js";

const ZweiPIDurch360 = 0.017453292;

export const FARBEN: [string, number, number, number][] = [
    ["schwarz", 0, 0, 0],
    ["weiß", 255, 255, 255],
    ["weiss", 255, 255, 255],
    ["blau", 0, 0, 255],
    ["rot", 255, 0, 0],
    ["grün", 0, 128, 0],
    ["gruen", 0, 128, 0],
    ["gelb", 255, 255, 0],
    ["grau", 0x80, 0x80, 0x80],
    ["hellgrau", 0xC0, 0xC0, 0xC0],
    ["hellblau", 0xA6, 0xCA, 0xF0],
    ["hellgrün", 0, 255, 0],
    ["hellgruen", 0, 255, 0],
    ["braun", 0x80, 0x80, 0x00],
];

export const INT_KONSTANTEN: [string, number, string][] = [
    ["gestrichelt", PS.dash, "Linienart"],
    ["durchgezogen", PS.solid, "Linienart"],
    ["gepunktelt", PS.dot, "Linienart"],
    ["gestrichpunktelt", PS.dashDot, "Linienart"],
    ["unsichtbar", PS.clear, "Linienart"],
    ["ausgemalt", BS.solid, "Füllart"],
    ["schraffiert", BS.bDiagonal, "Füllart"],
    ["kariert", BS.cross, "Füllart"],
    ["durchsichtig", BS.clear, "Füllart"],
    ["zentriert", 0, "Ausrichtung"],
    ["linksbündig", 1, "Ausrichtung"],
    ["rechtsbündig", 2, "Ausrichtung"],
    ["obenbündig", 1, "Ausrichtung"],
    ["untenbündig", 2, "Ausrichtung"],
    ["linksbuendig", 1, "Ausrichtung"],
    ["rechtsbuendig", 2, "Ausrichtung"],
    ["obenbuendig", 1, "Ausrichtung"],
    ["untenbuendig", 2, "Ausrichtung"],
];

function sys(name: string, ret: VType, params: [string, VType][], fn: (a: any[]) => any, doc: string): Methode {
    const m = new Methode(name, "system");
    m.ret = { vt: ret, ci: 0 };
    for (const [n, t] of params) m.addParam(n, t);
    m.fn = fn;
    m.doc = doc;
    return m;
}

export function createSystemFunctions(random: () => number = Math.random): Methode[] {
    return [
        sys("sin", "real", [["Winkel in Grad", "real"]], a => Math.sin(a[0] * ZweiPIDurch360), "Sinus eines Winkels in Grad"),
        sys("cos", "real", [["Winkel in Grad", "real"]], a => Math.cos(a[0] * ZweiPIDurch360), "Kosinus eines Winkels in Grad"),
        sys("tan", "real", [["Winkel in Grad", "real"]], a => { const d = a[0] * ZweiPIDurch360; return Math.sin(d) / Math.cos(d); }, "Tangens eines Winkels in Grad"),
        sys("arctan", "real", [["Wert", "real"]], a => Math.atan(a[0]) / ZweiPIDurch360, "Arkustangens, Ergebnis in Grad"),
        sys("round", "integer", [["Zu rundende Zahl", "real"]], a => dround(a[0]) | 0, "Rundet auf eine ganze Zahl"),
        sys("trunc", "integer", [["Zu rundende Zahl", "real"]], a => dtrunc(a[0]) | 0, "Schneidet die Nachkommastellen ab"),
        sys("zufall", "integer", [["Von", "integer"], ["Bis", "integer"]], a => {
            const von = a[0], bis = a[1];
            return von < bis ? Math.floor(random() * (bis - von + 1)) + von : 1;
        }, "Zufällige ganze Zahl zwischen Von und Bis (jeweils einschließlich)"),
    ];
}

export type GlobalEntry = { name: string, type: TypeRef, value: any, methode?: Methode, doc?: string };

/** Alle vordefinierten Namen mit frischen Werten (für jeden Programmlauf neu). */
export function createGlobals(random?: () => number): GlobalEntry[] {
    const list: GlobalEntry[] = [];
    for (const [name, r, g, b] of FARBEN) {
        const f = new Farbe(name, null);
        f.setzergb(r, g, b);
        list.push({ name, type: { vt: "objekt", ci: CI.FARBE }, value: f, doc: "Farbe" });
    }
    for (const [name, v, doc] of INT_KONSTANTEN) list.push({ name, type: { vt: "integer", ci: 0 }, value: v, doc });
    for (const m of createSystemFunctions(random)) list.push({ name: m.name, type: { vt: "keiner", ci: 0 }, value: null, methode: m, doc: m.doc });
    return list;
}
