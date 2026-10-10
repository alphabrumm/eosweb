/**
 * Hilfe wie im Hilfebereich von EOS: Klassen (aus der Klassenfabrik erzeugt), Befehle, Konstanten.
 */

import { getKlassenfabrik } from "../eos/classes.js";
import { FARBEN, INT_KONSTANTEN, createSystemFunctions } from "../eos/builtins.js";
import { escapeHtml, methodSignature, typeLabel } from "./language.js";

const KLASSEN_INFO: Record<string, string> = {
    RECHTECK: "Rechteck mit waagrechten und senkrechten Seiten (lässt sich drehen).",
    QUADRAT: "Quadrat; die Größe bestimmt die Seitenlänge.",
    FENSTER: "Zeichenfenster. Wird kein Fenster deklariert, erzeugt EOS automatisch eines, in dem alle Figuren zu sehen sind. Wer selbst ein Fenster deklariert, muss die Figuren mit zeichne(…) hineinsetzen.",
    ELLIPSE: "Ellipse mit Mittelpunkt und zwei Radien.",
    KREIS: "Kreis mit Mittelpunkt und Radius.",
    DREIECK: "Dreieck mit drei Eckpunkten.",
    LINIE: "Strecke zwischen zwei Punkten.",
    TEXTFELD: "Rechteck mit Text.",
    TURTLE: "Schildkröte, die beim Laufen eine Spur zeichnet.",
    GRUPPE: "Fasst Figuren zusammen. kopiere(…) übernimmt eine Kopie, schlucke(…) die Figur selbst.",
    FARBE: "Farbe aus Rot-, Grün- und Blauanteil (je 0 bis 255).",
    FIGUR: "Oberklasse aller Figuren.",
    "GEFÜLLTEFIGUR": "Oberklasse aller Figuren mit Füllung.",
};

function klassenHtml(): string {
    const parts: string[] = [];
    for (const k of getKlassenfabrik().klassen) {
        const attrs = k.attribute.filter(a => !a.hidden);
        const methods = k.methoden.filter(m => !m.hidden);
        parts.push(`<details class="eo-help-class"><summary><b>${escapeHtml(k.klassenname)}</b>
            <span>${escapeHtml(KLASSEN_INFO[k.klassenname] || "")}</span></summary>
            <h4>Attribute</h4>
            <ul>${attrs.map(a => `<li><code>${escapeHtml(a.name)}: ${escapeHtml(typeLabel(a))}</code></li>`).join("")}</ul>
            <h4>Methoden</h4>
            <ul>${methods.map(m => `<li><code>${methodSignature(m, -1, true)}</code></li>`).join("")}</ul>
        </details>`);
    }
    return parts.join("");
}

const BEFEHLE = `<h4>Variablen und Objekte anlegen</h4>
<pre>r1, r2: RECHTECK
t: TURTLE
n: integer        // ganze Zahl
x: real           // Kommazahl (mit Punkt: 2.5)
s: string         // Text in Hochkommas: 'Hallo'
fertig: boolean   // wahr oder falsch</pre>
<h4>Zuweisung und Methodenaufruf</h4>
<pre>n := n + 1
r1.füllfarbeSetzen(gelb)
r1.füllfarbe := gelb
t.vor(50)</pre>
<h4>Wiederholungen</h4>
<pre>wiederhole 10 mal
   …
*wiederhole

wiederhole (n) mal      // Anzahl aus einer Variablen
   …
*wiederhole

wiederhole immer
   …
*wiederhole

wiederhole solange n < 10
   …
*wiederhole

wiederhole
   …
*wiederhole bis n > 10

solange n < 10 tue
   …
*solange</pre>
<h4>Bedingung</h4>
<pre>wenn n > 3 dann
   …
sonst
   …
*wenn</pre>
<p>Bedingungen: <code>= &lt;&gt; &lt; &gt; &lt;= &gt;=</code>, verknüpft mit <code>und</code>, <code>oder</code>, <code>nicht</code>.</p>
<h4>Mehrere Befehle für ein Objekt</h4>
<pre>für r1
   linksSetzen(-40)
   verschieben(10, 0)
*für</pre>
<h4>Eigene Methoden</h4>
<pre>methode quadrat(laenge: integer)
   wiederhole 4 mal
      t.vor(laenge)
      t.linksdrehen(90)
   *wiederhole
ende

quadrat(50)</pre>
<p>Mit <code>var</code> vor dem Parameter wird die Variable selbst übergeben (sie kann in der Methode verändert werden). Objekte werden immer mit <code>var</code> übergeben:
<code>methode faerben(var r: RECHTECK)</code></p>
<h4>Kommentare</h4>
<pre>// bis zum Zeilenende
{ in geschweiften Klammern }</pre>`;

function konstantenHtml(): string {
    const farben = FARBEN.filter(f => !/ss$|gruen/.test(f[0])).map(f =>
        `<li><span class="eo-swatch" style="background: rgb(${f[1]},${f[2]},${f[3]})"></span><code>${escapeHtml(f[0])}</code></li>`).join("");
    const gruppe = (g: string) => INT_KONSTANTEN.filter(k => k[2] == g && !/ue/.test(k[0])).map(k => `<code>${escapeHtml(k[0])}</code>`).join(", ");
    const funcs = createSystemFunctions().map(m => `<li><code>${methodSignature(m, -1, true)}</code> – ${escapeHtml(m.doc)}</li>`).join("");
    return `<h4>Farben</h4><ul class="eo-colors">${farben}</ul>
        <p>Eigene Farben: <code>r.füllfarbe.setzergb(255, 128, 0)</code></p>
        <h4>Linienart / Randart</h4><p>${gruppe("Linienart")}</p>
        <h4>Füllart</h4><p>${gruppe("Füllart")}</p>
        <h4>Ausrichtung (Textfeld)</h4><p>${gruppe("Ausrichtung")}</p>
        <h4>Funktionen</h4><ul>${funcs}</ul>
        <h4>Beispiel</h4>
<pre>r: RECHTECK
r.füllfarbeSetzen(gelb)
r.füllartSetzen(schraffiert)
r.linksObenSetzen(-30, 40)
wiederhole immer
   r.drehen(1)
*wiederhole</pre>`;
}

export function helpHtml(): string {
    return `<div class="eo-help">
        <div class="jp-segmented eo-help-tabs" role="tablist">
            <button role="tab" data-help="befehle" aria-selected="true">Befehle</button>
            <button role="tab" data-help="klassen">Klassen</button>
            <button role="tab" data-help="konstanten">Konstanten</button>
        </div>
        <div class="jp-doc eo-help-page" data-page="befehle">${BEFEHLE}</div>
        <div class="jp-doc eo-help-page" data-page="klassen" hidden><p>Tippe auf eine Klasse, um ihre Attribute und Methoden zu sehen. Zu jedem Attribut gibt es eine Methode <code>…Setzen</code>.</p>${klassenHtml()}</div>
        <div class="jp-doc eo-help-page" data-page="konstanten" hidden>${konstantenHtml()}</div>
    </div>`;
}

export function wireHelp(container: HTMLElement) {
    const tabs = container.querySelectorAll<HTMLElement>("[data-help]");
    tabs.forEach(b => b.addEventListener("click", () => {
        tabs.forEach(x => x.setAttribute("aria-selected", String(x == b)));
        container.querySelectorAll<HTMLElement>("[data-page]").forEach(p => p.hidden = p.dataset.page != b.dataset.help);
    }));
}
