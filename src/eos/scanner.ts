/**
 * Scanner für EOS – nachgebaut nach UScanner.pas (EOS 1.5.9 von Martin Pabst).
 *
 * Besonderheiten der Sprache, die hier abgebildet werden:
 *  - Schlüsselwörter und Bezeichner ohne Unterscheidung von Groß-/Kleinschreibung
 *  - Kommentare mit // bis zum Zeilenende und { ... }
 *  - Zeichenketten in einfachen Hochkommas 'so'
 *  - *wiederhole, *wenn, *solange, *für sind eigene Schlüsselwörter
 *  - Unbekannte Sonderzeichen werden (wie im Original) überlesen
 */

export enum T {
    EOF, Identifier, IntConst, RealConst, StringConst, NumberError,
    // Satzzeichen
    Doppelpunkt, KlammAuf, KlammZu, EckAuf, EckZu, Strichpunkt, Komma, Punkt,
    Mal, Geteilt, Plus, Minus, Gleich, Groesser, Kleiner, GroesserGleich, KleinerGleich, Ungleich,
    PunktPunkt, Zuweisung, GleichGleich, Zeiger, Adresse,
    // Schlüsselwörter
    Fuer, Wiederhole, SternWiederhole, Immer, MalWort, Solange, SternSolange, Tue, Bis,
    Methode, Ende, Var, Wenn, SternWenn, Dann, Sonst, SternFuer,
    Boolean, Integer, Real, Char, String,
    Nicht, Und, Oder, Wahr, Falsch,
}

export const KEYWORDS: Record<string, T> = {
    "FÜR": T.Fuer, "WIEDERHOLE": T.Wiederhole, "*WIEDERHOLE": T.SternWiederhole, "IMMER": T.Immer, "MAL": T.MalWort,
    "SOLANGE": T.Solange, "*SOLANGE": T.SternSolange, "TUE": T.Tue, "BIS": T.Bis, "METHODE": T.Methode, "ENDE": T.Ende,
    "VAR": T.Var, "WENN": T.Wenn, "*WENN": T.SternWenn, "DANN": T.Dann, "SONST": T.Sonst, "*FÜR": T.SternFuer,
    "BOOLEAN": T.Boolean, "INTEGER": T.Integer, "REAL": T.Real, "CHAR": T.Char, "STRING": T.String,
    "NICHT": T.Nicht, "UND": T.Und, "ODER": T.Oder, "WAHR": T.Wahr, "FALSCH": T.Falsch,
};

/** Lesbare Namen für Fehlermeldungen */
export const TOKEN_NAMES: Partial<Record<T, string>> = {
    [T.EOF]: "Programmende", [T.KlammAuf]: "(", [T.KlammZu]: ")", [T.Komma]: ",", [T.Punkt]: ".",
    [T.Doppelpunkt]: ":", [T.Zuweisung]: ":=", [T.Strichpunkt]: ";",
};

export type Token = {
    type: T;
    /** Originaltext des Tokens */
    text: string;
    from: number;
    to: number;
    line: number;   // 1-basiert
    col: number;    // 1-basiert
    intValue?: number;
    realValue?: number;
    /** Für Zeichenketten: Inhalt ohne Hochkommas */
    stringValue?: string;
    /** Zeichenkette ohne schließendes Hochkomma */
    unterminated?: boolean;
};

/** Großschreibung wie MyUpperCase in EOS (a–z und äöü) */
export function eosUpper(s: string): string {
    return s.toUpperCase();
}

export function eosLower(s: string): string {
    return s.toLowerCase();
}

const LETTER = /[A-Za-z_À-ÖØ-öø-ɏͰ-῿]/;
const DIGIT = /[0-9]/;
const QUOTES = "'‘’‚´`";

export function isIdentStart(c: string) { return LETTER.test(c); }
export function isIdentPart(c: string) { return LETTER.test(c) || DIGIT.test(c); }

export class Scanner {

    private pos = 0;
    private lineStarts: number[] = [0];

    constructor(public readonly text: string) {
        for (let i = 0; i < text.length; i++) if (text[i] == "\n") this.lineStarts.push(i + 1);
    }

    lineCol(offset: number): { line: number, col: number } {
        let lo = 0, hi = this.lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
    }

    /** Liefert alle Token (das letzte ist EOF). */
    tokenize(): Token[] {
        const tokens: Token[] = [];
        while (true) {
            const t = this.next();
            tokens.push(t);
            if (t.type == T.EOF) break;
        }
        return tokens;
    }

    private make(type: T, from: number, extra: Partial<Token> = {}): Token {
        const lc = this.lineCol(from);
        return { type, text: this.text.substring(from, this.pos), from, to: this.pos, line: lc.line, col: lc.col, ...extra };
    }

    private next(): Token {
        const s = this.text;
        while (true) {
            // Leerraum und Kommentare überlesen
            while (this.pos < s.length) {
                const c = s[this.pos];
                if (c == " " || c == "\t" || c == "\r" || c == "\n" || c == "\f" || c == " ") { this.pos++; continue; }
                if (c == "/" && s[this.pos + 1] == "/") {
                    while (this.pos < s.length && s[this.pos] != "\n") this.pos++;
                    continue;
                }
                if (c == "{") {
                    while (this.pos < s.length && s[this.pos] != "}") this.pos++;
                    if (this.pos < s.length) this.pos++;
                    continue;
                }
                break;
            }
            if (this.pos >= s.length) return this.make(T.EOF, s.length);

            const from = this.pos;
            const c = s[this.pos];

            // *wiederhole, *wenn, *solange, *für
            if (c == "*") {
                let p = this.pos + 1;
                while (p < s.length && isIdentPart(s[p])) p++;
                const word = eosUpper(s.substring(this.pos, p));
                const kw = KEYWORDS[word];
                if (p > this.pos + 1 && kw !== undefined && word.startsWith("*")) {
                    this.pos = p;
                    return this.make(kw, from);
                }
                this.pos++;
                return this.make(T.Mal, from);
            }

            if (isIdentStart(c)) {
                let p = this.pos + 1;
                while (p < s.length && isIdentPart(s[p])) p++;
                this.pos = p;
                const word = s.substring(from, p);
                const kw = KEYWORDS[eosUpper(word)];
                return this.make(kw !== undefined && !eosUpper(word).startsWith("*") ? kw : T.Identifier, from);
            }

            if (DIGIT.test(c)) return this.number(from);

            if (QUOTES.includes(c)) {
                this.pos++;
                let value = "";
                while (this.pos < s.length && !QUOTES.includes(s[this.pos])) {
                    const ch = s[this.pos];
                    if (ch != "\r" && ch != "\n" && ch != "\t") value += ch;
                    this.pos++;
                }
                const unterminated = this.pos >= s.length;
                if (!unterminated) this.pos++;
                return this.make(T.StringConst, from, { stringValue: value, unterminated });
            }

            this.pos++;
            const n = s[this.pos];
            switch (c) {
                case "(": return this.make(T.KlammAuf, from);
                case ")": return this.make(T.KlammZu, from);
                case "[": return this.make(T.EckAuf, from);
                case "]": return this.make(T.EckZu, from);
                case ";": return this.make(T.Strichpunkt, from);
                case ",": return this.make(T.Komma, from);
                case "+": return this.make(T.Plus, from);
                case "-": case "−": case "–": return this.make(T.Minus, from);
                case "^": return this.make(T.Zeiger, from);
                case "@": return this.make(T.Adresse, from);
                case "/": return this.make(T.Geteilt, from);
                case "=":
                    if (n == "=") { this.pos++; return this.make(T.GleichGleich, from); }
                    return this.make(T.Gleich, from);
                case ":":
                    if (n == "=") { this.pos++; return this.make(T.Zuweisung, from); }
                    return this.make(T.Doppelpunkt, from);
                case "<":
                    if (n == "=") { this.pos++; return this.make(T.KleinerGleich, from); }
                    if (n == ">") { this.pos++; return this.make(T.Ungleich, from); }
                    return this.make(T.Kleiner, from);
                case ">":
                    if (n == "=") { this.pos++; return this.make(T.GroesserGleich, from); }
                    return this.make(T.Groesser, from);
                case ".":
                    if (n == ".") { this.pos++; return this.make(T.PunktPunkt, from); }
                    return this.make(T.Punkt, from);
                case "≤": return this.make(T.KleinerGleich, from);
                case "≥": return this.make(T.GroesserGleich, from);
                case "≠": return this.make(T.Ungleich, from);
                case "×": case "⋅": return this.make(T.Mal, from);
                case "÷": return this.make(T.Geteilt, from);
            }
            // Alle anderen Zeichen überliest EOS stillschweigend.
        }
    }

    private number(from: number): Token {
        const s = this.text;
        let p = this.pos;
        while (p < s.length && DIGIT.test(s[p])) p++;
        const vorkomma = s.substring(this.pos, p);
        let isReal = false;
        let nachkomma = "";
        let exponent = "";
        let error = false;
        if (s[p] == "." && s[p + 1] != ".") {
            isReal = true;
            p++;
            const st = p;
            while (p < s.length && DIGIT.test(s[p])) p++;
            nachkomma = s.substring(st, p);
        }
        if (s[p] == "e" || s[p] == "E") {
            // Nur als Exponent werten, wenn wirklich Ziffern folgen (sonst z. B. "2einheiten")
            let q = p + 1;
            if (s[q] == "+" || s[q] == "-") q++;
            if (DIGIT.test(s[q] || "")) {
                isReal = true;
                const st = p + 1;
                p = q;
                while (p < s.length && DIGIT.test(s[p])) p++;
                exponent = s.substring(st, p);
            }
        }
        this.pos = p;
        if (isReal) {
            const v = parseFloat(vorkomma + "." + (nachkomma || "0") + (exponent ? "e" + exponent : ""));
            if (!isFinite(v)) error = true;
            return this.make(error ? T.NumberError : T.RealConst, from, { realValue: v });
        }
        const iv = parseInt(vorkomma, 10);
        if (iv > 2147483647) error = true;
        return this.make(error ? T.NumberError : T.IntConst, from, { intValue: iv });
    }
}
