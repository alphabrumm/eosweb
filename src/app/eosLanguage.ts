/**
 * Syntaxhervorhebung und automatisches Einrücken für EOS im CodeMirror-Editor.
 */

import { StreamLanguage, StringStream, indentService, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Extension, Prec, EditorState } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { KEYWORDS, Scanner, T, Token } from "../eos/scanner.js";
import { FARBEN, INT_KONSTANTEN } from "../eos/builtins.js";
import { getKlassenfabrik } from "../eos/classes.js";

export const INDENT = 3;

const KLASSEN = new Set(getKlassenfabrik().klassen.map(k => k.klassenname.toLowerCase()));
const TYPEN = new Set(["integer", "real", "boolean", "string", "char"]);
const KONSTANTEN = new Set([...FARBEN.map(f => f[0].toLowerCase()), ...INT_KONSTANTEN.map(k => k[0].toLowerCase())]);
const FUNKTIONEN = new Set(["sin", "cos", "tan", "arctan", "round", "trunc", "zufall"]);
const SCHLUESSELWOERTER = new Set(Object.keys(KEYWORDS).map(k => k.toLowerCase()).filter(k => !TYPEN.has(k) && k != "wahr" && k != "falsch"));

type State = { inComment: boolean, afterDot: boolean };

const IDENT = /^[A-Za-z_À-ÖØ-öø-ɏ][A-Za-z0-9_À-ÖØ-öø-ɏ]*/;

const eosParser = {
    name: "eos",
    startState: (): State => ({ inComment: false, afterDot: false }),
    token(stream: StringStream, state: State): string | null {
        if (state.inComment) {
            if (stream.skipTo("}")) { stream.next(); state.inComment = false; }
            else stream.skipToEnd();
            return "comment";
        }
        if (stream.eatSpace()) return null;
        if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
        if (stream.peek() == "{") {
            stream.next();
            if (stream.skipTo("}")) stream.next(); else { stream.skipToEnd(); state.inComment = true; }
            return "comment";
        }
        const ch = stream.peek()!;
        if ("'‘’‚´`".includes(ch)) {
            stream.next();
            while (!stream.eol()) { if ("'‘’‚´`".includes(stream.next()!)) break; }
            state.afterDot = false;
            return "string";
        }
        if (/[0-9]/.test(ch)) {
            stream.match(/^[0-9]+(\.(?!\.)[0-9]*)?([eE][+-]?[0-9]+)?/);
            state.afterDot = false;
            return "number";
        }
        if (ch == "*") {
            if (stream.match(/^\*(wiederhole|wenn|solange|für)(?![A-Za-z0-9_äöüÄÖÜß])/i)) { state.afterDot = false; return "keyword"; }
            stream.next();
            return "operator";
        }
        const m = stream.match(IDENT) as RegExpMatchArray | null;
        if (m) {
            const w = m[0].toLowerCase();
            const isCall = !!stream.match(/^\s*\(/, false);
            const afterDot = state.afterDot;
            state.afterDot = false;
            if (afterDot) return isCall ? "method" : "property";
            if (SCHLUESSELWOERTER.has(w)) return "keyword";
            if (TYPEN.has(w)) return "typeName";
            if (w == "wahr" || w == "falsch") return "bool";
            if (KLASSEN.has(w)) return "className";
            if (KONSTANTEN.has(w)) return "constant";
            if (FUNKTIONEN.has(w) && isCall) return "builtin";
            if (isCall) return "method";
            return "variableName";
        }
        stream.next();
        if (ch == ".") { state.afterDot = true; return "punctuation"; }
        state.afterDot = false;
        if (ch == ":" && stream.eat("=")) return "operator";
        if ("()".includes(ch)) return "paren";
        if (",;:".includes(ch)) return "punctuation";
        return "operator";
    },
    tokenTable: {
        method: t.function(t.propertyName),
        property: t.propertyName,
        builtin: t.standard(t.function(t.variableName)),
        constant: t.constant(t.variableName),
        paren: t.paren,
    },
    languageData: {
        commentTokens: { line: "//" },
        indentOnInput: /^\s*(\*wiederhole|\*wenn|\*solange|\*für|sonst|ende)\s*$/i,
    },
};

export const eosLanguage = StreamLanguage.define(eosParser as any);

export const eosHighlight = HighlightStyle.define([
    { tag: [t.keyword], color: "var(--syn-keyword)", fontWeight: "600" },
    { tag: [t.typeName, t.className], color: "var(--syn-type)", fontWeight: "600" },
    { tag: [t.string], color: "var(--syn-string)" },
    { tag: [t.number, t.bool], color: "var(--syn-number)" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
    { tag: [t.function(t.propertyName), t.standard(t.function(t.variableName))], color: "var(--syn-method)" },
    { tag: [t.propertyName], color: "var(--syn-field)" },
    { tag: [t.constant(t.variableName)], color: "var(--syn-annotation)" },
    { tag: [t.operator, t.punctuation, t.paren], color: "var(--syn-punct)" },
]);

// ------------------------------------------------------------------ Einrücken

const OPENERS = new Set([T.Wiederhole, T.Wenn, T.Fuer, T.Methode, T.Solange]);
const CLOSERS = new Set([T.SternWiederhole, T.SternWenn, T.SternFuer, T.SternSolange, T.Ende]);

/** Liefert für jede Zeile (1-basiert) die Blocktiefe am Zeilenanfang */
export function blockDepths(text: string): { depthAt: number[], firstToken: (Token | undefined)[] } {
    const tokens = new Scanner(text).tokenize();
    const lines = text.split("\n").length;
    const delta = new Array(lines + 2).fill(0);
    const firstToken: (Token | undefined)[] = new Array(lines + 2);
    let prev: Token | undefined;
    for (const tk of tokens) {
        if (tk.type == T.EOF) break;
        if (!firstToken[tk.line]) firstToken[tk.line] = tk;
        let isOpener = OPENERS.has(tk.type);
        // "wiederhole solange …" und "*wiederhole solange …" öffnen keinen zusätzlichen Block
        if (tk.type == T.Solange && prev && (prev.type == T.Wiederhole || prev.type == T.SternWiederhole)) isOpener = false;
        if (isOpener) delta[tk.line]++;
        if (CLOSERS.has(tk.type)) delta[tk.line]--;
        prev = tk;
    }
    const depthAt = new Array(lines + 2).fill(0);
    let d = 0;
    for (let l = 1; l <= lines + 1; l++) {
        depthAt[l] = Math.max(0, d);
        d += delta[l];
    }
    return { depthAt, firstToken };
}

function isDedentToken(tk: Token | undefined): boolean {
    return !!tk && (CLOSERS.has(tk.type) || tk.type == T.Sonst);
}

function computeIndent(state: EditorState, pos: number): number {
    const line = state.doc.lineAt(pos);
    const text = state.doc.toString();
    const { depthAt } = blockDepths(text.substring(0, line.from) + "\n");
    let depth = depthAt[line.number] ?? 0;
    const rest = state.sliceDoc(pos, line.to);
    const restTokens = new Scanner(rest).tokenize();
    if (isDedentToken(restTokens[0])) depth--;
    return Math.max(0, depth) * INDENT;
}

export const eosIndent: Extension = Prec.high(indentService.of((ctx, pos) => computeIndent(ctx.state, pos)));

/** Ganzes Programm neu einrücken (wie die automatische Einrückung von EOS) */
export function formatText(text: string): string {
    const { depthAt, firstToken } = blockDepths(text);
    return text.split("\n").map((l, i) => {
        const trimmed = l.trim();
        if (trimmed == "") return "";
        let d = depthAt[i + 1];
        const ft = firstToken[i + 1];
        if (ft && ft.line == i + 1 && isDedentToken(ft)) d--;
        return " ".repeat(Math.max(0, d) * INDENT) + trimmed;
    }).join("\n");
}

export function eosLanguageSupport(): Extension[] {
    return [eosLanguage, syntaxHighlighting(eosHighlight), eosIndent];
}
