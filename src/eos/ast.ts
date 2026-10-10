/** Syntaxbaum von EOS-Programmen */

import type { Token } from "./scanner.js";
import type { Methode, TypeRef } from "./types.js";

export type Pos = { from: number, to: number, line: number, col: number };

export function posOf(t: Token): Pos {
    return { from: t.from, to: t.to, line: t.line, col: t.col };
}

/** Ein Glied einer Punktkette wie  r.füllfarbe.rot  oder  t.vor(10) */
export type ChainPart = {
    name: string;
    pos: Pos;
    kind: "var" | "attr" | "method" | "fuerAttr" | "fuerMethod" | "userMethod" | "system";
    /** Argumente bei Methodenaufrufen */
    args?: Expr[];
    /** Signatur bei Methodenaufrufen (zum Prüfen von var-Parametern) */
    methode?: Methode;
    /** Typ nach diesem Glied */
    type: TypeRef;
};

export type Chain = { parts: ChainPart[], pos: Pos };

export type Expr =
    | { k: "int", value: number, pos: Pos, type: TypeRef }
    | { k: "real", value: number, pos: Pos, type: TypeRef }
    | { k: "string", value: string, pos: Pos, type: TypeRef }
    | { k: "bool", value: boolean, pos: Pos, type: TypeRef }
    | { k: "chain", chain: Chain, pos: Pos, type: TypeRef }
    | { k: "neg", e: Expr, pos: Pos, type: TypeRef }
    | { k: "not", e: Expr, pos: Pos, type: TypeRef }
    | { k: "bin", op: string, l: Expr, r: Expr, pos: Pos, type: TypeRef };

export type MethodDecl = {
    name: string;
    pos: Pos;
    params: { name: string, type: TypeRef, isVar: boolean }[];
    body: Stmt[];
    endPos: Pos;
    methode: Methode;
};

export type Stmt =
    | { k: "decl", pos: Pos, names: { name: string, pos: Pos }[], type: TypeRef, className: string }
    | { k: "assign", pos: Pos, target: Chain, expr: Expr }
    | { k: "call", pos: Pos, chain: Chain }
    | { k: "wiederholeImmer", pos: Pos, body: Stmt[], endPos: Pos }
    | { k: "wiederholeN", pos: Pos, count: Expr, body: Stmt[], endPos: Pos }
    | { k: "wiederholeSolange", pos: Pos, cond: Expr, body: Stmt[], endPos: Pos }
    | { k: "wiederholeEnd", pos: Pos, body: Stmt[], endPos: Pos, bis: boolean, cond: Expr }
    | { k: "solange", pos: Pos, cond: Expr, body: Stmt[], endPos: Pos }
    | { k: "wenn", pos: Pos, cond: Expr, then: Stmt[], sonst: Stmt[] | null, sonstPos: Pos | null, endPos: Pos }
    | { k: "fuer", pos: Pos, obj: Chain, body: Stmt[], endPos: Pos }
    | { k: "methode", pos: Pos, decl: MethodDecl };

export type Program = {
    body: Stmt[];
    methods: MethodDecl[];
    /** Wird ein Standardfenster automatisch erzeugt? (kein FENSTER deklariert, aber Figuren) */
    fensterAutomatisch: boolean;
};

export type Declaration = { name: string, type: TypeRef, className: string, pos: Pos, scope: string | null };

export class EosError extends Error {
    constructor(message: string, public pos: Pos, public kind: "syntax" | "laufzeit") {
        super(message);
    }
}
