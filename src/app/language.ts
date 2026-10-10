/**
 * Sprachdienste für den Editor: Vervollständigung, Parameterhilfe, Info zur Stelle am Cursor.
 * Grundlage sind die Klassen der Klassenfabrik (wie die Code-Vervollständigung in EOS).
 */

import { Completion, CompletionContext, CompletionResult, snippetCompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { getKlassenfabrik } from "../eos/classes.js";
import { FARBEN, INT_KONSTANTEN, createSystemFunctions } from "../eos/builtins.js";
import { EosObjekt, Methode, TypeRef } from "../eos/types.js";
import { parse, typName } from "../eos/parser.js";
import { Declaration } from "../eos/ast.js";

const W = "A-Za-z0-9_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F";
const WORD = new RegExp(`[${W}]+`);

export function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ------------------------------------------------------------------ Analyse des Programms

type Analysis = { text: string, decls: Declaration[], userMethods: Methode[] };
let cache: Analysis | null = null;

const DECL_RE = new RegExp(`^\\s*([${W}]+(?:\\s*,\\s*[${W}]+)*)\\s*:\\s*([${W}]+)`, "gm");

export function analyse(text: string): Analysis {
    if (cache && cache.text == text) return cache;
    const r = parse(text);
    const decls = [...r.declarations];
    // Hinter einem Fehler: Deklarationen per Muster nachtragen
    if (r.error) {
        const fab = getKlassenfabrik();
        DECL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DECL_RE.exec(text))) {
            if (m.index < r.error.pos.from) continue;
            const typ = m[2].toLowerCase();
            let type: TypeRef | null = null;
            const k = fab.getKlasseByName(typ);
            if (k) type = { vt: "objekt", ci: k.ci };
            else if (["integer", "real", "boolean", "string", "char"].includes(typ)) type = { vt: <any>typ, ci: 0 };
            if (!type) continue;
            for (const n of m[1].split(",").map(s => s.trim())) {
                if (!decls.some(d => d.name.toLowerCase() == n.toLowerCase())) {
                    decls.push({ name: n, type, className: typName(type), pos: { from: m.index, to: m.index, line: 0, col: 0 }, scope: null });
                }
            }
        }
    }
    cache = { text, decls, userMethods: r.methods.map(m => m.methode) };
    return cache;
}

function findDecl(a: Analysis, name: string): Declaration | undefined {
    const n = name.toLowerCase();
    return a.decls.find(d => d.name.toLowerCase() == n);
}

function protoOf(t: TypeRef): EosObjekt | null {
    return t.vt == "objekt" ? getKlassenfabrik().getKlasse(t.ci) : null;
}

/** Bestimmt den Typ einer Kette wie "r.füllfarbe" */
function resolveChain(a: Analysis, chain: string): TypeRef | null {
    const parts = chain.split(".").map(p => p.replace(/\(.*\)$/, "").trim());
    const d = findDecl(a, parts[0]);
    if (!d) return null;
    let t: TypeRef = d.type;
    for (let i = 1; i < parts.length; i++) {
        const p = protoOf(t);
        if (!p) return null;
        const at = p.getAttribut(parts[i]);
        if (at) { t = { vt: at.vt, ci: at.ci }; continue; }
        const m = p.getMethode(parts[i]);
        if (m?.ret) { t = m.ret; continue; }
        return null;
    }
    return t;
}

// ------------------------------------------------------------------ Beschreibungen

export function typeLabel(t: { vt: string, ci: number }): string {
    return typName(<TypeRef>t);
}

export function methodSignature(m: Methode, active = -1, html = false): string {
    const esc = html ? escapeHtml : (s: string) => s;
    const ps = m.params.map((p, i) => {
        const s = (p.isVar ? "var " : "") + p.name + ": " + typeLabel(p);
        return html && i == active ? `<b>${esc(s)}</b>` : esc(s);
    }).join(", ");
    const ret = m.ret ? ": " + typeLabel(m.ret) : "";
    return esc(m.name) + "(" + ps + ")" + esc(ret);
}

function methodSnippet(m: Methode): string {
    if (m.params.length == 0) return m.name + "()";
    return m.name + "(" + m.params.map(p => "${" + p.name.replace(/[{}$]/g, "") + "}").join(", ") + ")";
}

function memberCompletions(proto: EosObjekt): Completion[] {
    const out: Completion[] = [];
    const seen = new Set<string>();
    for (const m of proto.methoden) {
        if (m.hidden || seen.has(m.name.toLowerCase())) continue;
        seen.add(m.name.toLowerCase());
        out.push(snippetCompletion(methodSnippet(m), {
            label: m.name, type: "method",
            detail: "(" + m.params.map(p => typeLabel(p)).join(", ") + ")" + (m.ret ? ": " + typeLabel(m.ret) : ""),
            info: methodSignature(m),
            boost: m.kind == "setze" ? -1 : 1,
        }));
    }
    for (const a of proto.attribute) {
        if (a.hidden) continue;
        out.push({ label: a.name, type: "property", detail: typeLabel(a), info: "Attribut " + a.name + ": " + typeLabel(a) });
    }
    return out;
}

const BLOCK_SNIPPETS: Completion[] = [
    snippetCompletion("wiederhole ${10} mal\n   ${}\n*wiederhole", { label: "wiederhole … mal", type: "keyword", detail: "Block", boost: 5 }),
    snippetCompletion("wiederhole (${n}) mal\n   ${}\n*wiederhole", { label: "wiederhole (n) mal", type: "keyword", detail: "Block", boost: 4 }),
    snippetCompletion("wiederhole immer\n   ${}\n*wiederhole", { label: "wiederhole immer", type: "keyword", detail: "Block", boost: 4 }),
    snippetCompletion("wiederhole solange ${Bedingung}\n   ${}\n*wiederhole", { label: "wiederhole solange", type: "keyword", detail: "Block", boost: 3 }),
    snippetCompletion("wiederhole\n   ${}\n*wiederhole bis ${Bedingung}", { label: "wiederhole … bis", type: "keyword", detail: "Block", boost: 3 }),
    snippetCompletion("solange ${Bedingung} tue\n   ${}\n*solange", { label: "solange … tue", type: "keyword", detail: "Block", boost: 3 }),
    snippetCompletion("wenn ${Bedingung} dann\n   ${}\n*wenn", { label: "wenn … dann", type: "keyword", detail: "Block", boost: 4 }),
    snippetCompletion("wenn ${Bedingung} dann\n   ${}\nsonst\n   \n*wenn", { label: "wenn … dann … sonst", type: "keyword", detail: "Block", boost: 3 }),
    snippetCompletion("für ${Objekt}\n   ${}\n*für", { label: "für", type: "keyword", detail: "Block", boost: 2 }),
    snippetCompletion("methode ${Name}\n   ${}\nende", { label: "methode", type: "keyword", detail: "Block", boost: 2 }),
    snippetCompletion("methode ${Name}(${n}: integer)\n   ${}\nende", { label: "methode mit Parametern", type: "keyword", detail: "Block", boost: 1 }),
];

const KEYWORD_WORDS = ["dann", "sonst", "mal", "tue", "bis", "immer", "und", "oder", "nicht", "wahr", "falsch", "ende", "var",
    "*wiederhole", "*wenn", "*solange", "*für"];

function generalCompletions(a: Analysis, pos: number): Completion[] {
    const out: Completion[] = [...BLOCK_SNIPPETS];
    for (const k of KEYWORD_WORDS) out.push({ label: k, type: "keyword" });
    const seen = new Set<string>();
    for (const d of a.decls) {
        const key = d.name.toLowerCase();
        if (seen.has(key)) continue;
        if (d.pos.from > pos && d.scope == null && d.pos.line != 0) continue;
        seen.add(key);
        out.push({ label: d.name, type: d.type.vt == "objekt" ? "variable" : "variable", detail: d.className, boost: 2 });
    }
    for (const m of a.userMethods) out.push(snippetCompletion(methodSnippet(m), { label: m.name, type: "function", detail: "Methode", info: methodSignature(m), boost: 1 }));
    for (const m of createSystemFunctions()) out.push(snippetCompletion(methodSnippet(m), { label: m.name, type: "function", detail: m.ret ? typeLabel(m.ret) : "", info: methodSignature(m) + "\n" + m.doc }));
    for (const [n] of FARBEN) if (!/ss|ue/.test(n)) out.push({ label: n, type: "constant", detail: "Farbe", boost: -1 });
    for (const [n, , doc] of INT_KONSTANTEN) if (!/ue/.test(n)) out.push({ label: n, type: "constant", detail: doc, boost: -1 });
    return out;
}

function typeCompletions(): Completion[] {
    const out: Completion[] = getKlassenfabrik().klassen
        .filter(k => k.klassenname != "FIGUR" && k.klassenname != "GEFÜLLTEFIGUR")
        .map(k => ({ label: k.klassenname, type: "class", boost: 2 }));
    for (const t of ["integer", "real", "boolean", "string"]) out.push({ label: t, type: "type" });
    return out;
}

export function eosCompletions(ctx: CompletionContext): CompletionResult | null {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = ctx.state.sliceDoc(line.from, ctx.pos);
    // Nicht in Kommentaren und Zeichenketten
    const codePart = before.replace(/'[^']*'/g, "''");
    if (codePart.includes("//") || /'[^']*$/.test(codePart)) return null;

    const a = analyse(ctx.state.doc.toString());

    // Nach einem Punkt: Attribute und Methoden
    const dot = before.match(new RegExp(`([${W}]+(?:\\s*\\.\\s*[${W}]+(?:\\([^()]*\\))?)*)\\s*\\.\\s*([${W}]*)$`));
    if (dot) {
        const t = resolveChain(a, dot[1].replace(/\s+/g, ""));
        const proto = t ? protoOf(t) : null;
        if (!proto) return null;
        return { from: ctx.pos - dot[2].length, options: memberCompletions(proto), validFor: WORD };
    }

    const word = ctx.matchBefore(new RegExp(`\\*?[${W}]*$`));
    if (!word) return null;
    if (word.from == word.to && !ctx.explicit) return null;

    // Typangabe in einer Deklaration
    if (new RegExp(`^\\s*[${W}]+(\\s*,\\s*[${W}]+)*\\s*:\\s*[${W}]*$`).test(before)) {
        return { from: word.from, options: typeCompletions(), validFor: WORD };
    }
    // Erstes Wort nach "methode": kein Vorschlag
    if (/^\s*methode\s+\S*$/i.test(before)) return null;
    return { from: word.from, options: generalCompletions(a, ctx.pos), validFor: /^\*?[\wÀ-ɏ]*$/ };
}

// ------------------------------------------------------------------ Parameterhilfe

export function signatureHelp(state: EditorState, pos: number): { html: string } | null {
    const line = state.doc.lineAt(pos);
    const before = state.sliceDoc(line.from, pos).replace(/'[^']*'/g, "''");
    // Innerste offene Klammer suchen
    let depth = 0, open = -1, commas = 0;
    for (let i = before.length - 1; i >= 0; i--) {
        const c = before[i];
        if (c == ")") depth++;
        else if (c == "(") {
            if (depth == 0) { open = i; break; }
            depth--;
        } else if (c == "," && depth == 0) commas++;
    }
    if (open < 0) return null;
    const head = before.substring(0, open).match(new RegExp(`([${W}]+(?:\\s*\\.\\s*[${W}]+(?:\\([^()]*\\))?)*)\\s*$`));
    if (!head) return null;
    const m = findMethod(analyse(state.doc.toString()), head[1].replace(/\s+/g, ""));
    if (!m) return null;
    if (m.params.length == 0) return { html: escapeHtml(m.name) + "() – ohne Parameter" };
    return { html: methodSignature(m, Math.min(commas, m.params.length - 1), true) + (m.doc ? " · " + escapeHtml(m.doc) : "") };
}

function findMethod(a: Analysis, chain: string): Methode | null {
    const idx = chain.lastIndexOf(".");
    if (idx < 0) {
        const n = chain.toLowerCase();
        return a.userMethods.find(m => m.name.toLowerCase() == n)
            || createSystemFunctions().find(m => m.name == n) || null;
    }
    const t = resolveChain(a, chain.substring(0, idx));
    const p = t ? protoOf(t) : null;
    return p?.getMethode(chain.substring(idx + 1)) || null;
}

// ------------------------------------------------------------------ Info zur Stelle

const KEYWORD_HELP: Record<string, string> = {
    wiederhole: "wiederhole 10 mal … *wiederhole\nwiederhole (n) mal … *wiederhole\nwiederhole immer … *wiederhole\nwiederhole solange Bedingung … *wiederhole\nwiederhole … *wiederhole bis Bedingung",
    solange: "solange Bedingung tue\n   …\n*solange",
    wenn: "wenn Bedingung dann\n   …\nsonst\n   …\n*wenn",
    für: "für Objekt\n   Methode(…)   // ohne „Objekt.“ davor\n*für",
    methode: "methode Name(a, b: integer; var c: real)\n   …\nende",
};

export function infoAt(state: EditorState, pos: number): string | null {
    const line = state.doc.lineAt(pos);
    const text = line.text;
    let s = pos - line.from, e = s;
    const isW = (c: string) => new RegExp(`[${W}*]`).test(c);
    while (s > 0 && isW(text[s - 1])) s--;
    while (e < text.length && isW(text[e])) e++;
    const word = text.substring(s, e).replace(/^\*/, "");
    if (!word) return null;
    const a = analyse(state.doc.toString());
    const before = text.substring(0, s);
    const dot = before.match(new RegExp(`([${W}]+(?:\\s*\\.\\s*[${W}]+(?:\\([^()]*\\))?)*)\\s*\\.\\s*$`));
    if (dot) {
        const t = resolveChain(a, dot[1].replace(/\s+/g, ""));
        const p = t ? protoOf(t) : null;
        if (p) {
            const at = p.getAttribut(word);
            if (at) return `<p>Attribut von ${escapeHtml(p.klassenname)}</p><pre>${escapeHtml(at.name + ": " + typeLabel(at))}</pre>`;
            const m = p.getMethode(word);
            if (m) return `<p>Methode von ${escapeHtml(p.klassenname)}</p><pre>${methodSignature(m, -1, true)}</pre>`;
        }
    }
    const lw = word.toLowerCase();
    if (KEYWORD_HELP[lw]) return `<pre>${escapeHtml(KEYWORD_HELP[lw])}</pre>`;
    const d = findDecl(a, word);
    if (d) {
        let html = `<p>${d.scope ? "Lokale Variable in " + escapeHtml(d.scope) : "Variable"}</p><pre>${escapeHtml(d.name + ": " + d.className)}</pre>`;
        const p = protoOf(d.type);
        if (p) html += `<p>Tippe hinter <code>${escapeHtml(d.name)}.</code> auf 💡, um alle Methoden und Attribute zu sehen.</p>`;
        return html;
    }
    const k = getKlassenfabrik().getKlasseByName(word);
    if (k) return `<p>Klasse ${escapeHtml(k.klassenname)}</p><pre>${escapeHtml(word.toLowerCase().charAt(0))}: ${escapeHtml(k.klassenname)}</pre><p>Alle Attribute und Methoden stehen in der Hilfe unter „Klassen“.</p>`;
    const m = a.userMethods.find(m => m.name.toLowerCase() == lw) || createSystemFunctions().find(m => m.name == lw);
    if (m) return `<pre>${methodSignature(m, -1, true)}</pre>${m.doc ? "<p>" + escapeHtml(m.doc) + "</p>" : ""}`;
    const f = FARBEN.find(x => x[0] == lw);
    if (f) return `<p>Farbkonstante</p><pre>${escapeHtml(f[0])} = rot ${f[1]}, grün ${f[2]}, blau ${f[3]}</pre>`;
    const c = INT_KONSTANTEN.find(x => x[0] == lw);
    if (c) return `<p>Konstante für ${escapeHtml(c[2])}</p><pre>${escapeHtml(c[0])}</pre>`;
    return null;
}

export { WORD };
