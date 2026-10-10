import { icon } from "./Icons.js";
import { EosEditor } from "./Editor.js";

type Key = { label: string, insert?: string, action?: string, aria?: string };

/**
 * Hilfsleiste über der Bildschirmtastatur mit den Zeichen, die EOS braucht
 * und die auf der iPad-Tastatur nur über Umwege erreichbar sind.
 */
const KEYS: Key[] = [
    { label: icon("tab"), action: "tab", aria: "Einrücken" },
    { label: ":=", insert: " := " },
    { label: "( )", insert: "(§)" },
    { label: ".", insert: "." },
    { label: ",", insert: ", " },
    { label: "' '", insert: "'§'", aria: "Zeichenkette" },
    { label: ":", insert: ": " },
    { label: "*", insert: "*" },
    { label: "/", insert: "/" },
    { label: "+", insert: "+" },
    { label: "−", insert: "-", aria: "Minus" },
    { label: "=", insert: " = " },
    { label: "<", insert: " < " },
    { label: ">", insert: " > " },
    { label: "<>", insert: " <> " },
    { label: "//", insert: "// " },
];

export class KeyBar {
    el: HTMLElement;

    constructor(root: HTMLElement, private editor: EosEditor, private showInfo: () => void) {
        this.el = document.createElement("div");
        this.el.className = "jp-keybar";
        this.el.setAttribute("role", "toolbar");
        this.el.setAttribute("aria-label", "Sonderzeichen");
        this.el.innerHTML = `
            <div class="jp-keybar-fixed">
                <button data-action="left" aria-label="Cursor nach links">${icon("left")}</button>
                <button data-action="right" aria-label="Cursor nach rechts">${icon("right")}</button>
            </div>
            <div class="jp-keybar-scroll">
                ${KEYS.map((k, i) => `<button data-key="${i}" ${k.aria ? `aria-label="${k.aria}"` : ""}>${k.label}</button>`).join("")}
            </div>
            <div class="jp-keybar-fixed">
                <button data-action="complete" aria-label="Vorschläge anzeigen" class="jp-key-accent">${icon("lightbulb")}</button>
                <button data-action="info" aria-label="Info zur Stelle am Cursor">${icon("info")}</button>
                <button data-action="hide" aria-label="Tastatur ausblenden">${icon("keyboardDown")}</button>
            </div>`;
        root.appendChild(this.el);

        // Fokus im Editor behalten, sonst schließt sich die Tastatur
        this.el.addEventListener("pointerdown", e => {
            if ((<HTMLElement>e.target).closest("button")) e.preventDefault();
        });
        this.el.addEventListener("click", e => {
            const b = (<HTMLElement>e.target).closest<HTMLElement>("button");
            if (!b) return;
            if (b.dataset.key != null) {
                const k = KEYS[parseInt(b.dataset.key)];
                if (k.action == "tab") this.editor.indentMore();
                else if (k.insert) this.editor.insert(k.insert);
            } else {
                switch (b.dataset.action) {
                    case "left": this.editor.moveCursor(-1); break;
                    case "right": this.editor.moveCursor(1); break;
                    case "complete": this.editor.startCompletion(); break;
                    case "info": this.showInfo(); break;
                    case "hide": this.editor.view.contentDOM.blur(); break;
                }
            }
        });

        // Leiste über der Bildschirmtastatur halten
        const vv = window.visualViewport;
        if (vv) {
            const update = () => {
                const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
                document.documentElement.style.setProperty("--keyboard-offset", offset + "px");
                document.documentElement.classList.toggle("keyboard-open", offset > 80);
            };
            vv.addEventListener("resize", update);
            vv.addEventListener("scroll", update);
            update();
        }
    }

    setEditorFocused(focused: boolean) {
        document.documentElement.classList.toggle("editor-focused", focused);
    }
}
