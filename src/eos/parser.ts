/**
 * Parser und Syntaxprüfung für EOS.
 * Aufbau und Fehlermeldungen folgen USyntaxcheck.pas; das Ergebnis ist ein Syntaxbaum,
 * den der Interpreter ausführt. Wie im Original wird beim ersten Fehler abgebrochen.
 */

import { Scanner, T, Token } from "./scanner.js";
import { Chain, ChainPart, Declaration, EosError, Expr, MethodDecl, Pos, Program, Stmt, posOf } from "./ast.js";
import { CI, getKlassenfabrik } from "./classes.js";
import { createGlobals } from "./builtins.js";
import { EosObjekt, Methode, TypeRef, VType } from "./types.js";

type Sym = { name: string, type: TypeRef, methode?: Methode };

const T_BOOL: TypeRef = { vt: "boolean", ci: 0 };
const T_INT: TypeRef = { vt: "integer", ci: 0 };
const T_REAL: TypeRef = { vt: "real", ci: 0 };
const T_STRING: TypeRef = { vt: "string", ci: 0 };
const T_NONE: TypeRef = { vt: "keiner", ci: 0 };

export type ParseOptions = { keineZuweisungZuAttributen?: boolean };

export type ParseResult = {
    program: Program | null;
    error: EosError | null;
    declarations: Declaration[];
    methods: MethodDecl[];
    tokens: Token[];
};

export function klassenName(ci: number): string {
    return getKlassenfabrik().getKlasse(ci)?.klassenname || "?";
}

export function typName(t: TypeRef): string {
    switch (t.vt) {
        case "boolean": return "Boolean";
        case "integer": return "Integer";
        case "real": return "Real";
        case "string": return "String";
        case "char": return "Char";
        case "objekt": return klassenName(t.ci);
        default: return "";
    }
}

class Scope {
    globals: Sym[] = [];
    locals: Sym[] | null = null;

    get(name: string): Sym | null {
        const n = name.toLowerCase();
        if (this.locals) {
            for (const s of this.locals) if (s.name.toLowerCase() == n) return s;
        }
        for (let i = this.globals.length - 1; i >= 0; i--) if (this.globals[i].name.toLowerCase() == n) return this.globals[i];
        return null;
    }

    add(s: Sym) {
        (this.locals || this.globals).push(s);
    }
}

export function parse(text: string, options: ParseOptions = {}): ParseResult {
    const scanner = new Scanner(text);
    const tokens = scanner.tokenize();
    const p = new Parser(tokens, options);
    let program: Program | null = null;
    let error: EosError | null = null;
    try {
        program = p.parseProgram();
    } catch (e) {
        if (e instanceof EosError) error = e;
        else throw e;
    }
    return { program, error, declarations: p.declarations, methods: p.methodDecls, tokens };
}

class Parser {
    private i = 0;
    private scope = new Scope();
    private depth = 0;
    private fuerProto: EosObjekt | null = null;
    private inMethod: MethodDecl | null = null;
    private fabrik = getKlassenfabrik();
    /** Methoden nach Position des Schlüsselworts "methode" */
    private methodsByToken = new Map<number, MethodDecl>();
    declarations: Declaration[] = [];
    methodDecls: MethodDecl[] = [];

    constructor(private tokens: Token[], private options: ParseOptions) {
        for (const g of createGlobals()) {
            this.scope.globals.push({ name: g.name, type: g.type, methode: g.methode });
        }
    }

    // ---------------------------------------------------------------- Hilfen

    private peek(o = 0): Token { return this.tokens[Math.min(this.i + o, this.tokens.length - 1)]; }
    private read(): Token { const t = this.peek(); if (this.i < this.tokens.length - 1) this.i++; return t; }

    private error(msg: string, t: Token | Pos): never {
        throw new EosError(msg, "type" in t ? posOf(t) : t, "syntax");
    }

    private expect(type: T, msg: string): Token {
        const t = this.read();
        if (t.type != type) this.error(msg, t);
        return t;
    }

    // ---------------------------------------------------------------- Programm

    parseProgram(): Program {
        this.findeMethoden();
        const body = this.block();
        const t = this.peek();
        if (t.type == T.Ende) this.error("Zu diesem ende gibt es keine Methode.", t);
        if (t.type != T.EOF) this.error(t.text + " ist hier nicht zulässig.", t);

        // Standardfenster nötig? (AnalysiereObFensterAutomatisch)
        let fensterDeklariert = false, figurDa = false;
        for (const d of this.declarations) {
            if (d.scope != null || d.type.vt != "objekt") continue;
            if (d.type.ci == CI.FENSTER) fensterDeklariert = true;
            if (d.type.ci % 2 == 0) figurDa = true;
        }
        return { body, methods: this.methodDecls, fensterAutomatisch: !fensterDeklariert && figurDa };
    }

    /** Erster Durchgang: alle selbstgeschriebenen Methoden registrieren (findeMethoden) */
    private findeMethoden() {
        const start = this.i;
        while (this.peek().type != T.EOF) {
            const t = this.read();
            if (t.type != T.Methode) continue;
            const tokIndex = this.i - 1;
            const nameTok = this.read();
            if (nameTok.type != T.Identifier) this.error("Nach methode wird der Name der Methode erwartet.", nameTok);
            const m = new Methode(nameTok.text, "selbst");
            const decl: MethodDecl = { name: nameTok.text, pos: posOf(nameTok), params: [], body: [], endPos: posOf(nameTok), methode: m };
            m.decl = decl;
            if (this.peek().type == T.KlammAuf) {
                this.read();
                if (this.peek().type != T.KlammZu) {
                    do {
                        this.methodenparameter(decl);
                    } while (this.peek().type == T.Strichpunkt && this.read());
                }
                this.expect(T.KlammZu, ") erwartet.");
            }
            (decl as any).bodyStart = this.i;
            // Rumpf überlesen
            let e = this.peek();
            while (e.type != T.Ende && e.type != T.EOF) { this.read(); e = this.peek(); }
            if (e.type == T.EOF) this.error("Die Methode " + decl.name + " muss mit ende abgeschlossen werden.", nameTok);
            if (this.scope.get(decl.name)?.methode?.kind == "selbst") {
                this.error("Eine Methode mit dem Namen " + decl.name + " gibt es schon.", nameTok);
            }
            this.scope.globals.push({ name: decl.name, type: T_NONE, methode: m });
            this.methodsByToken.set(tokIndex, decl);
            this.methodDecls.push(decl);
        }
        this.i = start;
    }

    private methodenparameter(decl: MethodDecl) {
        let t = this.read();
        let isVar = false;
        if (t.type == T.Var) { isVar = true; t = this.read(); }
        if (t.type != T.Identifier) this.error("Bezeichner erwartet.", t);
        const names: Token[] = [];
        while (true) {
            const n = t.text.toLowerCase();
            if (decl.params.some(p => p.name.toLowerCase() == n) || names.some(x => x.text.toLowerCase() == n)) {
                this.error("Einen Parameter mit dem Namen " + t.text + " gibt es schon.", t);
            }
            names.push(t);
            const s = this.read();
            if (s.type == T.Doppelpunkt) break;
            if (s.type != T.Komma) this.error("Komma oder Doppelpunkt erwartet.", s);
            t = this.read();
            if (t.type != T.Identifier) this.error("Bezeichner erwartet.", t);
        }
        const typTok = this.read();
        const type = this.typeFromToken(typTok, "Parametertyp erwartet.");
        if (type.vt == "objekt" && !isVar) {
            this.error("Objekte sind nur als Variablenparameter (mit var), nicht als Werteparameter zulässig.", typTok);
        }
        for (const n of names) {
            decl.params.push({ name: n.text, type, isVar });
            decl.methode.addParam(n.text, type.vt, type.ci, isVar);
        }
    }

    private typeFromToken(t: Token, msg: string): TypeRef {
        switch (t.type) {
            case T.Integer: return { vt: "integer", ci: 0 };
            case T.Real: return { vt: "real", ci: 0 };
            case T.Char: return { vt: "char", ci: 0 };
            case T.Boolean: return { vt: "boolean", ci: 0 };
            case T.String: return { vt: "string", ci: 0 };
            case T.Identifier: {
                const k = this.fabrik.getKlasseByName(t.text);
                if (!k) this.error("Den Variablentyp/die Klasse " + t.text + " gibt es nicht.", t);
                return { vt: "objekt", ci: k.ci };
            }
        }
        this.error(msg, t);
    }

    // ---------------------------------------------------------------- Anweisungen

    private block(): Stmt[] {
        const stmts: Stmt[] = [];
        while (true) {
            const t = this.peek();
            switch (t.type) {
                case T.Identifier: {
                    const n = this.peek(1).type;
                    stmts.push(n == T.Komma || n == T.Doppelpunkt ? this.variablendeklaration() : this.anweisung());
                    continue;
                }
                case T.Wiederhole: stmts.push(this.wiederhole()); continue;
                case T.Solange: stmts.push(this.solange()); continue;
                case T.Wenn: stmts.push(this.wenn()); continue;
                case T.Fuer: stmts.push(this.fuer()); continue;
                case T.Methode: stmts.push(this.methode()); continue;
            }
            break;
        }
        const t = this.peek();
        if (this.depth == 0) {
            if (t.type != T.EOF && t.type != T.Ende) this.error(this.nichtZulaessig(t), t);
        } else if (![T.SternWiederhole, T.SternSolange, T.SternWenn, T.Sonst, T.SternFuer].includes(t.type)) {
            if (t.type == T.EOF) this.error("*wiederhole, *solange, *wenn oder *für erwartet.", t);
            this.error(this.nichtZulaessig(t), t);
        }
        return stmts;
    }

    private nichtZulaessig(t: Token): string {
        if (t.type == T.StringConst || t.type == T.IntConst || t.type == T.RealConst) {
            return t.text + " ist hier nicht zulässig. Eine Anweisung beginnt mit einem Bezeichner oder einem Schlüsselwort.";
        }
        if (t.type == T.SternWenn || t.type == T.SternWiederhole || t.type == T.SternSolange || t.type == T.SternFuer || t.type == T.Sonst) {
            return t.text + " ist hier nicht zulässig – dazu fehlt der passende Anfang (wiederhole, solange, wenn, für).";
        }
        return t.text + " ist hier nicht zulässig.";
    }

    private variablendeklaration(): Stmt {
        const first = this.peek();
        if (this.depth > 0) this.error("Variablendeklaration ist innerhalb von Wiederholungen und Bedingungen (wiederhole, solange, wenn, für) nicht zulässig.", first);
        const names: { name: string, pos: Pos }[] = [];
        while (true) {
            const t = this.read();
            if (t.type != T.Identifier) this.error("Bezeichner erwartet.", t);
            if (this.scope.get(t.text) || names.some(n => n.name.toLowerCase() == t.text.toLowerCase())) {
                this.error("Eine Variable/ein Objekt mit dem Namen " + t.text + " gibt es schon.", t);
            }
            if (this.fabrik.gibtEs(t.text)) {
                // Im Original erlaubt, führt aber leicht zu Verwechslungen – nur bei FENSTER etc. als Name verbieten wir nichts
            }
            names.push({ name: t.text, pos: posOf(t) });
            const s = this.read();
            if (s.type == T.Doppelpunkt) break;
            if (s.type != T.Komma) this.error("Komma oder Doppelpunkt erwartet.", s);
        }
        const typTok = this.read();
        const type = this.typeFromToken(typTok, "Variablentyp erwartet.");
        const className = type.vt == "objekt" ? klassenName(type.ci) : typName(type);
        for (const n of names) {
            this.scope.add({ name: n.name, type });
            this.declarations.push({ name: n.name, type, className, pos: n.pos, scope: this.inMethod ? this.inMethod.name : null });
        }
        return { k: "decl", pos: this.span(first, typTok), names, type, className };
    }

    private span(a: Token, b: Token): Pos {
        return { from: a.from, to: b.to, line: a.line, col: a.col };
    }

    private anweisung(): Stmt {
        const first = this.peek();
        const chain = this.attributMethode(true);
        const last = chain.parts[chain.parts.length - 1];
        if (chain.parts.length == 1 && last.kind == "var" && this.peek().type == T.MalWort) {
            this.error("Hier fehlt wohl ein Schlüsselwort: wiederhole (" + last.name + ") mal", first);
        }
        if (last.type.vt == "keiner") {
            return { k: "call", pos: chain.pos, chain };
        }
        // Linkswert → Zuweisung
        const z = this.read();
        if (z.type != T.Zuweisung) {
            if (z.type == T.Gleich) this.error("Zuweisungen schreibt man mit := (Doppelpunkt und Gleichheitszeichen).", z);
            if (last.kind == "method" || last.kind == "fuerMethod" || last.kind == "system") {
                this.error("Der Wert, den " + last.name + " zurückgibt, wird hier nicht verwendet. Weise ihn einer Variablen zu (x := ...).", z);
            }
            if (z.type == T.KlammAuf && (last.kind == "attr" || last.kind == "var" || last.kind == "fuerAttr")) {
                this.error(last.name + " ist ein Attribut/eine Variable, keine Methode. Zuweisen mit := oder die Setzen-Methode verwenden.", z);
            }
            this.error(":= erwartet.", z);
        }
        if (last.kind == "method" || last.kind == "fuerMethod" || last.kind == "system" || last.kind == "userMethod") {
            this.error("Einem Methodenergebnis kann nichts zugewiesen werden.", z);
        }
        if ((last.kind == "attr" || last.kind == "fuerAttr") && this.options.keineZuweisungZuAttributen) {
            this.error("Einem Attribut darf kein Wert zugewiesen werden! Verwende die Setzen-Methode (z. B. " + last.name + "Setzen(...)).", z);
        }
        const expr = this.term(last.type);
        return { k: "assign", pos: { ...chain.pos, to: expr.pos.to }, target: chain, expr };
    }

    /**
     * Untersucht Ketten wie r1.füllfarbe.rot oder t.vor(10).
     * linkswert: Wird ein Wert/Linkswert erwartet (false = Term).
     */
    private attributMethode(linkswert: boolean): Chain {
        const t = this.read();
        if (t.type != T.Identifier) this.error("Bezeichner erwartet.", t);
        const parts: ChainPart[] = [];
        let proto: EosObjekt | null = null;
        let part: ChainPart | null = null;

        if (this.fuerProto) {
            const a = this.fuerProto.getAttribut(t.text);
            if (a) {
                part = { name: t.text, pos: posOf(t), kind: "fuerAttr", type: { vt: a.vt, ci: a.ci } };
            } else {
                const m = this.fuerProto.getMethode(t.text);
                if (m) part = this.methodenaufruf(t, m, "fuerMethod");
            }
        }
        if (!part) {
            const s = this.scope.get(t.text);
            if (s) {
                if (s.methode) part = this.methodenaufruf(t, s.methode, s.methode.kind == "selbst" ? "userMethod" : "system");
                else part = { name: t.text, pos: posOf(t), kind: "var", type: s.type };
            }
        }
        if (!part) {
            if (this.fabrik.gibtEs(t.text)) {
                this.error(t.text + " ist der Name einer Klasse. Lege zuerst ein Objekt an, z. B. " + t.text.toLowerCase().substring(0, 1) + ": " + t.text.toUpperCase(), t);
            }
            this.error("Den Bezeichner " + t.text + " gibt es nicht.", t);
        }
        parts.push(part);
        const name = t.text;

        while (this.peek().type == T.Punkt) {
            this.read();
            const cur = parts[parts.length - 1].type;
            if (cur.vt != "objekt") this.error(name + " hat keine Eigenschaften/Methoden.", this.peek());
            const n = this.read();
            if (n.type != T.Identifier) this.error("Nach dem Punkt wird der Name einer Eigenschaft/Methode erwartet.", n);
            proto = this.fabrik.getKlasse(cur.ci);
            const a = proto?.getAttribut(n.text);
            if (a) {
                parts.push({ name: n.text, pos: posOf(n), kind: "attr", type: { vt: a.vt, ci: a.ci } });
                continue;
            }
            const m = proto?.getMethode(n.text);
            if (!m) {
                this.error(n.text + " ist nicht der Name eines Attributs/einer Methode von " + parts.map(x => x.name).join(".") +
                    " (Klasse " + klassenName(cur.ci) + ").", n);
            }
            parts.push(this.methodenaufruf(n, m, "method"));
        }
        const last = parts[parts.length - 1];
        if (!linkswert && last.type.vt == "keiner") {
            this.error("Die Methode " + last.name + " gibt nichts zurück.", last.pos);
        }
        return { parts, pos: { from: t.from, to: this.tokens[this.i - 1].to, line: t.line, col: t.col } };
    }

    private methodenaufruf(nameTok: Token, m: Methode, kind: ChainPart["kind"]): ChainPart {
        const k = this.read();
        if (k.type != T.KlammAuf) {
            if (m.params.length == 0) this.error("( erwartet. Methoden ruft man immer mit Klammern auf: " + nameTok.text + "()", k);
            this.error("( erwartet.", k);
        }
        const args: Expr[] = [];
        for (let i = 0; i < m.params.length; i++) {
            const p = m.params[i];
            if (this.peek().type == T.KlammZu) {
                this.error("Parameter erwartet (" + p.name + "). " + nameTok.text + " braucht " + m.params.length +
                    (m.params.length == 1 ? " Parameter." : " Parameter: " + m.params.map(x => x.name).join(", ") + "."), this.peek());
            }
            if (m.kind == "selbst" && p.isVar) {
                const st = this.peek();
                const c = this.attributMethode(true);
                const lt = c.parts[c.parts.length - 1];
                if (lt.kind == "method" || lt.kind == "fuerMethod" || lt.kind == "system" || lt.kind == "userMethod") {
                    this.error("Für den var-Parameter " + p.name + " muss eine Variable angegeben werden.", st);
                }
                if (lt.type.vt != p.vt || lt.type.ci != p.ci) {
                    this.error("Der Typ des Parameters " + p.name + " der Methode " + m.name + " stimmt nicht.", st);
                }
                args.push({ k: "chain", chain: c, pos: c.pos, type: lt.type });
            } else {
                try {
                    args.push(this.term({ vt: p.vt, ci: p.ci }));
                } catch (e) {
                    if (e instanceof EosError && e.message.startsWith("Bezeichner oder Funktionsaufruf erwartet.")) {
                        e.message = "Parameter erwartet (" + p.name + ").";
                    }
                    throw e;
                }
            }
            if (i < m.params.length - 1) {
                const c = this.read();
                if (c.type != T.Komma) {
                    if (c.type == T.KlammZu) {
                        this.error(nameTok.text + " braucht " + m.params.length + " Parameter: " + m.params.map(x => x.name).join(", ") + ".", c);
                    }
                    this.error(", erwartet.", c);
                }
            }
        }
        const z = this.read();
        if (z.type != T.KlammZu) {
            if (z.type == T.Komma) {
                this.error(m.params.length == 0 ? nameTok.text + " hat keine Parameter." :
                    "Zu viele Parameter: " + nameTok.text + " braucht nur " + m.params.length + ".", z);
            }
            this.error(") erwartet.", z);
        }
        return {
            name: nameTok.text, pos: { from: nameTok.from, to: z.to, line: nameTok.line, col: nameTok.col },
            kind, args, methode: m, type: m.ret ? { ...m.ret } : T_NONE
        };
    }

    private wiederhole(): Stmt {
        const w = this.read();
        const pos = posOf(w);
        this.depth++;
        const t = this.peek();
        let stmt: Stmt;
        if (t.type == T.Immer) {
            this.read();
            const body = this.block();
            this.depth--;
            const e = this.expect(T.SternWiederhole, "*wiederhole erwartet.");
            stmt = { k: "wiederholeImmer", pos, body, endPos: posOf(e) };
        } else if (t.type == T.Solange) {
            this.read();
            const cond = this.term(T_BOOL);
            const body = this.block();
            this.depth--;
            const e = this.expect(T.SternWiederhole, "*wiederhole erwartet.");
            stmt = { k: "wiederholeSolange", pos, cond, body, endPos: posOf(e) };
        } else if (t.type == T.IntConst) {
            this.read();
            const count: Expr = { k: "int", value: t.intValue!, pos: posOf(t), type: T_INT };
            this.expect(T.MalWort, "mal erwartet.");
            const body = this.block();
            this.depth--;
            const e = this.expect(T.SternWiederhole, "*wiederhole erwartet.");
            stmt = { k: "wiederholeN", pos, count, body, endPos: posOf(e) };
        } else if (t.type == T.KlammAuf) {
            this.read();
            const count = this.term(T_INT);
            this.expect(T.KlammZu, ") erwartet.");
            this.expect(T.MalWort, "mal erwartet.");
            const body = this.block();
            this.depth--;
            const e = this.expect(T.SternWiederhole, "*wiederhole erwartet.");
            stmt = { k: "wiederholeN", pos, count, body, endPos: posOf(e) };
        } else {
            if (t.type == T.Identifier && this.peek(1).type == T.MalWort) {
                this.error("Steht die Anzahl in einer Variablen, muss sie in Klammern stehen: wiederhole (" + t.text + ") mal", t);
            }
            if (t.type == T.RealConst) this.error("Die Anzahl der Wiederholungen muss eine ganze Zahl sein.", t);
            const body = this.block();
            this.depth--;
            const e = this.expect(T.SternWiederhole, "*wiederhole erwartet.");
            const b = this.read();
            if (b.type != T.Bis && b.type != T.Solange) this.error("bis oder solange erwartet.", b);
            const cond = this.term(T_BOOL);
            stmt = { k: "wiederholeEnd", pos, body, endPos: posOf(e), bis: b.type == T.Bis, cond };
        }
        return stmt;
    }

    private solange(): Stmt {
        const s = this.read();
        this.depth++;
        const cond = this.term(T_BOOL);
        this.expect(T.Tue, "tue erwartet.");
        const body = this.block();
        this.depth--;
        const e = this.expect(T.SternSolange, "*solange erwartet.");
        return { k: "solange", pos: posOf(s), cond, body, endPos: posOf(e) };
    }

    private wenn(): Stmt {
        const w = this.read();
        const cond = this.term(T_BOOL);
        this.expect(T.Dann, "dann erwartet.");
        this.depth++;
        const then = this.block();
        let sonst: Stmt[] | null = null;
        let sonstPos: Pos | null = null;
        let t = this.read();
        if (t.type == T.Sonst) {
            sonstPos = posOf(t);
            sonst = this.block();
            t = this.read();
        }
        this.depth--;
        if (t.type != T.SternWenn) this.error("*wenn erwartet.", t);
        return { k: "wenn", pos: posOf(w), cond, then, sonst, sonstPos, endPos: posOf(t) };
    }

    private fuer(): Stmt {
        const f = this.read();
        if (this.fuerProto) this.error("für-Blöcke können nicht geschachtelt werden!", f);
        const obj = this.attributMethode(true);
        const last = obj.parts[obj.parts.length - 1];
        if (last.type.vt != "objekt") this.error("Nach für wird ein Objekt erwartet.", obj.pos);
        this.fuerProto = this.fabrik.getKlasse(last.type.ci);
        this.depth++;
        const body = this.block();
        this.depth--;
        const e = this.expect(T.SternFuer, "*für erwartet.");
        this.fuerProto = null;
        return { k: "fuer", pos: posOf(f), obj, body, endPos: posOf(e) };
    }

    private methode(): Stmt {
        const mt = this.peek();
        if (this.depth > 0) this.error("Methoden dürfen nicht innerhalb von Wiederholungen oder Bedingungen stehen.", mt);
        if (this.inMethod) this.error("Methoden dürfen nicht innerhalb von Methoden stehen (fehlt ein ende?).", mt);
        const decl = this.methodsByToken.get(this.i)!;
        this.i = (decl as any).bodyStart;
        const savedLocals = this.scope.locals;
        this.scope.locals = decl.params.map(p => ({ name: p.name, type: p.type }));
        for (const p of decl.params) {
            this.declarations.push({ name: p.name, type: p.type, className: typName(p.type), pos: decl.pos, scope: decl.name });
        }
        this.inMethod = decl;
        decl.body = this.block();
        const e = this.read();
        if (e.type != T.Ende) this.error("Eine Methode wurde nicht mit ende abgeschlossen.", e);
        decl.endPos = posOf(e);
        this.inMethod = null;
        this.scope.locals = savedLocals;
        return { k: "methode", pos: posOf(mt), decl };
    }

    // ---------------------------------------------------------------- Terme

    private term(want: TypeRef): Expr {
        const e = this.andOr();
        const vt = e.type.vt;
        switch (want.vt) {
            case "string":
                if (!["integer", "real", "boolean", "string"].includes(vt)) this.error("Typ String erwartet.", e.pos);
                break;
            case "real":
                if (vt != "integer" && vt != "real") this.error("Typ Real (Zahl) erwartet.", e.pos);
                break;
            case "integer":
                if (vt == "real") this.error("Typ Integer (ganze Zahl) erwartet. Tipp: round(...) rundet eine Kommazahl.", e.pos);
                if (vt != "integer") this.error("Typ Integer erwartet.", e.pos);
                break;
            case "char":
                if (vt != "char") this.error("Typ Char erwartet.", e.pos);
                break;
            case "boolean":
                if (vt != "boolean") this.error("Hier wird eine Bedingung erwartet (z. B. x > 3, wahr oder falsch).", e.pos);
                break;
            case "objekt":
                if (vt != "objekt" || e.type.ci % want.ci != 0) {
                    this.error("Hier wird ein Objekt der Klasse " + klassenName(want.ci) + " erwartet.", e.pos);
                }
                break;
        }
        return e;
    }

    private bin(op: string, l: Expr, r: Expr, type: TypeRef): Expr {
        return { k: "bin", op, l, r, type, pos: { from: l.pos.from, to: r.pos.to, line: l.pos.line, col: l.pos.col } };
    }

    private andOr(): Expr {
        let l = this.vergleich();
        while (this.peek().type == T.Und || this.peek().type == T.Oder) {
            const op = this.read();
            if (l.type.vt != "boolean") this.error("Vor " + op.text + " wird ein boolescher Wert erwartet.", op);
            const r = this.vergleich();
            if (r.type.vt != "boolean") this.error("Nach " + op.text + " wird ein boolescher Wert erwartet.", r.pos);
            l = this.bin(op.type == T.Und ? "und" : "oder", l, r, T_BOOL);
        }
        return l;
    }

    private vergleich(): Expr {
        const l = this.plusMinus();
        const t = this.peek();
        if (t.type == T.GleichGleich) this.error("Vergleiche schreibt man in EOS mit einem einfachen =.", t);
        const ops: Partial<Record<T, string>> = {
            [T.Kleiner]: "<", [T.Groesser]: ">", [T.Gleich]: "=", [T.KleinerGleich]: "<=", [T.GroesserGleich]: ">=", [T.Ungleich]: "<>"
        };
        const op = ops[t.type];
        if (!op) return l;
        this.read();
        if (l.type.vt != "integer" && l.type.vt != "real") this.error("Vor <, >, <=, >=, <>, = wird ein Integer- oder Real-Wert erwartet.", l.pos);
        const r = this.plusMinus();
        if (r.type.vt != "integer" && r.type.vt != "real") this.error("Nach <, >, <=, >=, <>, = wird ein Integer- oder Real-Wert erwartet.", r.pos);
        return this.bin(op, l, r, T_BOOL);
    }

    private plusMinus(): Expr {
        let l = this.malGeteilt();
        while (this.peek().type == T.Plus || this.peek().type == T.Minus) {
            const op = this.read();
            const plus = op.type == T.Plus;
            const ok = (vt: VType) => vt == "integer" || vt == "real" || (plus && vt == "string");
            if (!ok(l.type.vt)) {
                this.error(plus ? "Vor + wird ein Integer-, Real- oder String-Wert erwartet." : "Vor - wird ein Integer- oder Real-Wert erwartet.", l.pos);
            }
            const r = this.malGeteilt();
            if (!ok(r.type.vt)) {
                this.error(plus ? "Nach + wird ein Integer-, Real- oder String-Wert erwartet." : "Nach - wird ein Integer- oder Real-Wert erwartet.", r.pos);
            }
            let type: TypeRef;
            if (l.type.vt == "string" || r.type.vt == "string") type = T_STRING;
            else if (l.type.vt == "real" || r.type.vt == "real") type = T_REAL;
            else type = T_INT;
            l = this.bin(plus ? "+" : "-", l, r, type);
        }
        return l;
    }

    private malGeteilt(): Expr {
        let l = this.notMinus();
        while (this.peek().type == T.Mal || this.peek().type == T.Geteilt) {
            const op = this.read();
            if (l.type.vt != "integer" && l.type.vt != "real") this.error("Vor " + op.text + " wird ein Integer- oder Real-Wert erwartet.", l.pos);
            const r = this.notMinus();
            if (r.type.vt != "integer" && r.type.vt != "real") this.error("Nach " + op.text + " wird ein Integer- oder Real-Wert erwartet.", r.pos);
            const type = l.type.vt == "real" || r.type.vt == "real" ? T_REAL : T_INT;
            l = this.bin(op.type == T.Mal ? "*" : "/", l, r, type);
        }
        return l;
    }

    private notMinus(): Expr {
        const t = this.peek();
        if (t.type == T.Minus) {
            this.read();
            const e = this.atom();
            if (e.type.vt != "integer" && e.type.vt != "real") this.error("Nach \"-\" wird ein Integer- oder Real-Wert erwartet.", e.pos);
            return { k: "neg", e, type: e.type, pos: { from: t.from, to: e.pos.to, line: t.line, col: t.col } };
        }
        if (t.type == T.Nicht) {
            this.read();
            const e = this.atom();
            if (e.type.vt != "boolean") this.error("Nach nicht wird ein boolescher Wert erwartet.", e.pos);
            return { k: "not", e, type: T_BOOL, pos: { from: t.from, to: e.pos.to, line: t.line, col: t.col } };
        }
        return this.atom();
    }

    private atom(): Expr {
        const t = this.peek();
        switch (t.type) {
            case T.Wahr: this.read(); return { k: "bool", value: true, pos: posOf(t), type: T_BOOL };
            case T.Falsch: this.read(); return { k: "bool", value: false, pos: posOf(t), type: T_BOOL };
            case T.IntConst: this.read(); return { k: "int", value: t.intValue!, pos: posOf(t), type: T_INT };
            case T.RealConst: this.read(); return { k: "real", value: t.realValue!, pos: posOf(t), type: T_REAL };
            case T.StringConst:
                this.read();
                if (t.unterminated) this.error("Die Zeichenkette wurde nicht mit ' abgeschlossen.", t);
                return { k: "string", value: t.stringValue!, pos: posOf(t), type: T_STRING };
            case T.KlammAuf: {
                this.read();
                const e = this.andOr();
                this.expect(T.KlammZu, ") erwartet.");
                return e;
            }
            case T.Identifier: {
                const c = this.attributMethode(false);
                return { k: "chain", chain: c, pos: c.pos, type: c.parts[c.parts.length - 1].type };
            }
            case T.NumberError:
                this.error(t.text + " ist keine zulässige Zahl.", t);
        }
        let s = "Bezeichner oder Funktionsaufruf erwartet.";
        if (t.type != T.EOF && t.text.trim() != "") s += " " + t.text + " macht hier keinen Sinn.";
        this.error(s, t);
    }
}
