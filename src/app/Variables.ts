/**
 * Variablenansicht (wie „Variablen zeigen“ in EOS): lokale Variablen der aktuellen Methode
 * und globale Variablen; Objekte mit ihren Attributen. Geänderte Werte erscheinen rot.
 */

import { Cell, Runtime, valueToString } from "../eos/runtime.js";
import { EosObjekt } from "../eos/types.js";
import { escapeHtml } from "./language.js";
import { cssColor } from "../eos/painter.js";
import { Farbe } from "../eos/classes.js";

export class VariablesView {
    private last = new Map<string, string>();

    constructor(private host: HTMLElement) {
        this.clear();
    }

    clear(text = "Starte das Programm. Hier siehst du dann, welche Werte die Variablen und die Attribute deiner Objekte haben.") {
        this.last.clear();
        this.host.innerHTML = `<div class="jp-empty"><p>${escapeHtml(text)}</p></div>`;
    }

    private val(key: string, s: string): string {
        const changed = this.last.has(key) && this.last.get(key) != s;
        this.next.set(key, s);
        return `<span class="eo-val${changed ? " is-changed" : ""}">${escapeHtml(s)}</span>`;
    }

    private next = new Map<string, string>();

    private objHtml(prefix: string, o: EosObjekt): string {
        const items: string[] = [];
        for (const a of o.attribute) {
            if (a.hidden) continue;
            if (a.vt == "objekt") {
                if (a.value instanceof Farbe) {
                    const f = a.value;
                    const s = `${f.r.value}, ${f.g.value}, ${f.b.value}`;
                    items.push(`<span class="eo-attr"><b>${escapeHtml(a.name)}</b> = <span class="eo-swatch" style="background:${cssColor(f.color)}"></span>${this.val(prefix + "." + a.name, s)}</span>`);
                }
                continue;
            }
            items.push(`<span class="eo-attr"><b>${escapeHtml(a.name)}</b> = ${this.val(prefix + "." + a.name, valueToString(a.value, { vt: a.vt, ci: a.ci }))}</span>`);
        }
        return items.join("");
    }

    private cellHtml(scope: string, c: Cell): string {
        const key = scope + ":" + c.name.toLowerCase();
        if (c.type.vt == "objekt") {
            const o = c.value as EosObjekt;
            return `<div class="eo-var is-object"><div class="eo-var-head"><b>${escapeHtml(c.name)}</b><span class="eo-var-type">${escapeHtml(o.klassenname)}</span></div>
                <div class="eo-attrs">${this.objHtml(key, o)}</div></div>`;
        }
        return `<div class="eo-var"><b>${escapeHtml(c.name)}</b> = ${this.val(key, valueToString(c.value, c.type))}<span class="eo-var-type">${escapeHtml(typeName(c))}</span></div>`;
    }

    update(rt: Runtime | null) {
        if (!rt) { this.clear(); return; }
        const v = rt.variablen();
        this.next = new Map();
        let html = "";
        if (v.lokal.length) {
            html += `<h3>Lokal in ${escapeHtml(v.methode || "")}</h3>` + v.lokal.map(c => this.cellHtml("l:" + v.methode, c)).join("");
        }
        if (v.global.length) {
            html += (v.lokal.length ? "<h3>Global</h3>" : "") + v.global.map(c => this.cellHtml("g", c)).join("");
        }
        if (!html) html = `<div class="jp-empty"><p>Seit Beginn des Programmlaufs wurden noch keine Variablen deklariert.</p></div>`;
        this.host.innerHTML = html;
        for (const [k, s] of this.next) this.last.set(k, s);
    }
}

function typeName(c: Cell): string {
    switch (c.type.vt) {
        case "integer": return "Integer";
        case "real": return "Real";
        case "boolean": return "Boolean";
        case "string": return "String";
        case "char": return "Char";
    }
    return "";
}
