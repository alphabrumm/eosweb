/**
 * Projekte von EOS Web: Ein Projekt ist ein EOS-Programm (wie eine .eos-Datei).
 * Alles liegt im Speicher des Browsers (localStorage) – ohne Login, ohne Server.
 * Austausch über .eos-Dateien im Format des Original-EOS (Windows-1252, CRLF).
 */

export type ProjectInfo = {
    id: string;
    name: string;
    created: number;
    modified: number;
    /** Zeitpunkt des letzten Sicherns als Datei (0 = noch nie) */
    exported: number;
    breakpoints?: number[];
};

const LIST_KEY = "eos.projects";
const CURRENT_KEY = "eos.current";
const TEXT_PREFIX = "eos.text.";

export const NEW_PROGRAM = "k: KREIS\nk.radiusSetzen(30)\nk.füllfarbeSetzen(gelb)\n";

function lsGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function lsSet(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function lsRemove(key: string) {
    try { localStorage.removeItem(key); } catch (e) { }
}

// ------------------------------------------------------------------ Windows-1252

const CP1252_EXTRA: Record<number, number> = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

export function encodeCp1252(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    let n = 0;
    for (const ch of text) {
        const c = ch.codePointAt(0)!;
        if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) out[n++] = c;
        else out[n++] = CP1252_EXTRA[c] ?? 0x3F; // '?'
    }
    return out.subarray(0, n);
}

/** Liest .eos-Dateien: UTF-8, sonst Windows-1252 (Original-EOS) */
export function decodeEos(bytes: Uint8Array): string {
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
        text = new TextDecoder("windows-1252").decode(bytes);
    }
    return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export class ProjectStore {

    list(): ProjectInfo[] {
        try {
            const list = JSON.parse(lsGet(LIST_KEY) || "[]") as ProjectInfo[];
            return list.sort((a, b) => b.modified - a.modified);
        } catch (e) {
            return [];
        }
    }

    private saveList(list: ProjectInfo[]) {
        lsSet(LIST_KEY, JSON.stringify(list));
    }

    get(id: string): ProjectInfo | undefined {
        return this.list().find(p => p.id == id);
    }

    update(id: string, changes: Partial<ProjectInfo>) {
        const list = this.list();
        const p = list.find(p => p.id == id);
        if (!p) return;
        Object.assign(p, changes);
        this.saveList(list);
    }

    getCurrentId(): string | null { return lsGet(CURRENT_KEY); }
    setCurrentId(id: string) { lsSet(CURRENT_KEY, id); }

    /** Liefert das aktuelle Projekt; legt beim allerersten Start eines an. */
    ensureCurrent(starterText: string): ProjectInfo {
        const current = this.getCurrentId();
        let p = current ? this.get(current) : undefined;
        if (!p) p = this.list()[0];
        if (!p) p = this.create("Mein erstes Programm", starterText);
        this.setCurrentId(p.id);
        return p;
    }

    create(name: string, text: string): ProjectInfo {
        const now = Date.now();
        const p: ProjectInfo = {
            id: now.toString(36) + Math.random().toString(36).substring(2, 6),
            name: this.uniqueName(name),
            created: now,
            modified: now,
            exported: 0
        };
        const list = this.list();
        list.push(p);
        this.saveList(list);
        this.writeText(p.id, text);
        return p;
    }

    uniqueName(name: string, exceptId?: string): string {
        const names = new Set(this.list().filter(p => p.id != exceptId).map(p => p.name));
        if (!names.has(name)) return name;
        let i = 2;
        while (names.has(`${name} (${i})`)) i++;
        return `${name} (${i})`;
    }

    readText(id: string): string {
        return lsGet(TEXT_PREFIX + id) ?? NEW_PROGRAM;
    }

    writeText(id: string, text: string): boolean {
        return lsSet(TEXT_PREFIX + id, text);
    }

    delete(id: string) {
        lsRemove(TEXT_PREFIX + id);
        this.saveList(this.list().filter(p => p.id != id));
        if (this.getCurrentId() == id) lsRemove(CURRENT_KEY);
    }

    static fileName(name: string): string {
        return name.replace(/[\\/:*?"<>|]/g, "_").trim() + ".eos";
    }

    static toFileBytes(text: string): Uint8Array {
        return encodeCp1252(text.replace(/\r?\n/g, "\r\n"));
    }

    static projectNameFromFile(filename: string): string {
        return filename.replace(/\.(eos|txt)$/i, "") || "Programm";
    }
}
