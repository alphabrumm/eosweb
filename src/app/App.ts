/**
 * Oberfläche von EOS Web: Kopfzeile, Editor, Grafik, Variablen, Fehler, Menü.
 * Aufbau und Gestaltung wie JPad, damit sich beide Apps gleich bedienen lassen.
 */

import { EosEditor } from "./Editor.js";
import { KeyBar } from "./KeyBar.js";
import { Dialogs } from "./Dialogs.js";
import { icon } from "./Icons.js";
import { GraphicsView } from "./Graphics.js";
import { VariablesView } from "./Variables.js";
import { helpHtml, wireHelp } from "./Help.js";
import { ProjectInfo, ProjectStore, NEW_PROGRAM, decodeEos } from "./ProjectStore.js";
import { exampleGroups } from "./examples.js";
import { escapeHtml, infoAt, signatureHelp } from "./language.js";
import { parse } from "../eos/parser.js";
import { EosError } from "../eos/ast.js";
import { Runner, RunState, SPEED_MAX, speedLabel } from "../eos/runner.js";
import { textMetrics } from "../eos/classes.js";

type View = "code" | "graphics" | "variables" | "problems";
type SideView = Exclude<View, "code">;
type ThemeChoice = "auto" | "light" | "dark";

declare var APP_VERSION: string;

export const STARTER = `// EOS 1.5 - Programm
// Willkommen bei EOS! Tippe oben auf ▶, um das Programm zu starten.
k: KREIS
k.radiusSetzen(30)
k.füllfarbeSetzen(gelb)
wiederhole 100 mal
   k.verschieben(1, 0)
*wiederhole
`;

function ls(key: string, def: string): string {
    try { return localStorage.getItem(key) ?? def; } catch (e) { return def; }
}
function lsSet(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch (e) { }
}

export class App {
    store = new ProjectStore();
    project!: ProjectInfo;
    editor!: EosEditor;
    dialogs!: Dialogs;
    keyBar!: KeyBar;
    graphics!: GraphicsView;
    variables!: VariablesView;
    runner: Runner;

    root: HTMLElement;
    el: Record<string, HTMLElement> = {};

    view: View = "code";
    sideView: SideView = "graphics";
    syntaxError: EosError | null = null;
    runtimeError: EosError | null = null;
    private saveTimer: any;
    private checkTimer: any;
    private loadingText = false;

    constructor(root: HTMLElement) {
        this.root = root;
        this.runner = new Runner({
            onState: s => this.onRunState(s),
            onLine: line => this.onLine(line),
            onRender: () => this.graphics.renderAll(),
            onError: e => this.onRuntimeError(e),
            onWindows: () => {
                if (this.runner.runtime) this.graphics.setRuntime(this.runner.runtime);
            },
            onVariables: () => { if (this.isVisible("variables")) this.variables.update(this.runner.runtime); },
        });
    }

    // =====================================================================
    // Start
    // =====================================================================

    /** Lehrkraftansicht: einmal mit ?lehrkraft (oder #lehrkraft) öffnen, danach merkt sich das Gerät die Einstellung. */
    private applyTeacherMode() {
        const url = new URL(location.href);
        const q = url.searchParams.get("lehrkraft") ?? (/^#lehrkraft(=|$)/.test(url.hash) ? url.hash.replace(/^#lehrkraft=?/, "") : null);
        if (q != null) {
            if (q == "0" || q == "aus" || q == "nein") { try { localStorage.removeItem("eos.lehrkraft"); } catch (e) { } }
            else lsSet("eos.lehrkraft", "1");
            url.searchParams.delete("lehrkraft");
            if (/^#lehrkraft/.test(url.hash)) url.hash = "";
            try { history.replaceState(null, "", url.toString()); } catch (e) { }
        }
        this.root.classList.toggle("is-teacher", ls("eos.lehrkraft", "0") == "1");
    }

    start() {
        this.applyTeacherMode();
        this.applyTheme(this.getThemeChoice());
        matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applyTheme(this.getThemeChoice()));
        this.setupTextMetrics();

        this.project = this.store.ensureCurrent(STARTER);
        this.buildShell();
        this.dialogs = new Dialogs(this.root);

        this.editor = new EosEditor(this.el.editorHost, {
            onDocChanged: () => this.onDocChanged(),
            onCursorActivity: () => this.updateSignatureSoon(),
            onFocusChanged: focused => this.keyBar.setEditorFocused(focused),
            onHistoryChanged: (u, r) => {
                this.el.undo.toggleAttribute("disabled", !u);
                this.el.redo.toggleAttribute("disabled", !r);
            },
            onBreakpointsChanged: () => this.onBreakpointsChanged(),
            onReadOnlyTap: () => this.toast("Das Programm läuft. Zum Bearbeiten erst beenden (■).", "info"),
        }, this.getFontSize());
        (window as any).eos = this;

        this.keyBar = new KeyBar(this.root, this.editor, () => this.showInfo());
        this.graphics = new GraphicsView(this.el.graphicsHost);
        this.variables = new VariablesView(this.el.variablesHost);
        this.runner.setSpeed(this.getSpeed());

        this.loadProject(this.project);
        this.setView("code");
        this.root.removeAttribute("aria-busy");
        this.root.querySelector(".jp-boot")?.remove();
        this.root.dataset.runstate = "stopped";

        const flush = () => this.saveNow();
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState == "hidden") flush(); });

        // Tastenkürzel (Hardware-Tastatur)
        document.addEventListener("keydown", e => {
            if ((e.key == "Enter" && (e.metaKey || e.ctrlKey)) || e.key == "F9") { e.preventDefault(); this.runOrResume(); }
            else if (e.key == "F8") { e.preventDefault(); this.stepOrStart(); }
            else if (e.key == "Escape" && (this.runner.state == "running" || this.runner.state == "paused")) { this.runner.stop(); }
        });

        // Dateien per Drag & Drop öffnen
        document.addEventListener("dragover", e => { e.preventDefault(); });
        document.addEventListener("drop", e => {
            e.preventDefault();
            const files = [...(e.dataTransfer?.files || [])];
            if (files.length) this.importFiles(files);
        });
    }

    private setupTextMetrics() {
        const c = document.createElement("canvas").getContext("2d")!;
        textMetrics.width = (s, font, size) => {
            c.font = `${Math.round(size * 96 / 72)}px "${font}", Arial, Helvetica, sans-serif`;
            return c.measureText(s).width;
        };
        textMetrics.height = (_s, _font, size) => Math.round(Math.round(size * 96 / 72) * 1.15);
    }

    // =====================================================================
    // Grundgerüst
    // =====================================================================

    private buildShell() {
        const groups = exampleGroups();
        this.root.insertAdjacentHTML("beforeend", `
        <header class="jp-topbar">
            <button class="jp-iconbtn" data-ref="menuBtn" aria-label="Menü öffnen">${icon("menu")}</button>
            <button class="jp-project" data-ref="projectBtn" aria-label="Programm umbenennen">
                <span class="jp-project-name" data-ref="projectName"></span>
                <span class="jp-project-state" data-ref="projectState"></span>
            </button>
            <div class="jp-topbar-spacer"></div>
            <div class="jp-toolgroup jp-edit-tools">
                <button class="jp-iconbtn" data-ref="undo" aria-label="Rückgängig" title="Rückgängig">${icon("undo")}</button>
                <button class="jp-iconbtn" data-ref="redo" aria-label="Wiederholen" title="Wiederholen">${icon("redo")}</button>
                <button class="jp-iconbtn jp-wide-only" data-ref="formatBtn" aria-label="Einrückung ordnen" title="Einrückung ordnen">${icon("format")}</button>
                <button class="jp-iconbtn" data-ref="helpBtn" aria-label="Hilfe" title="Hilfe">${icon("help")}</button>
                <button class="jp-iconbtn" data-ref="saveBtn" aria-label="Programm als Datei sichern" title="Programm als Datei sichern">${icon("save")}<span class="jp-dot"></span></button>
            </div>
            <div class="jp-toolgroup jp-run-tools">
                <button class="jp-iconbtn jp-step" data-ref="stepBtn" aria-label="Einzelschritt" title="Einzelschritt (F8)">${icon("stepOver")}</button>
                <button class="jp-iconbtn jp-stop" data-ref="stopBtn" aria-label="Programm beenden" title="Programm beenden">${icon("stop")}</button>
                <button class="jp-run" data-ref="pauseBtn" aria-label="Pause">${icon("pause")}</button>
                <button class="jp-run" data-ref="runBtn" aria-label="Programm starten" title="Programm starten (F9)">${icon("play")}</button>
            </div>
        </header>

        <main class="jp-main">
            <section class="jp-pane jp-pane-code" aria-label="Quelltext">
                <div class="eo-runbanner" data-ref="runBanner">
                    <span data-ref="runBannerText">Das Programm läuft.</span>
                    <button class="eo-banner-btn" data-ref="bannerStop">${icon("edit")}<span>Bearbeiten</span></button>
                </div>
                <div class="jp-editor" data-ref="editorHost"></div>
                <div class="jp-signature" data-ref="signature" hidden></div>
            </section>
            <section class="jp-pane jp-pane-side">
                <div class="jp-segmented jp-side-switch" role="tablist">
                    <button role="tab" data-side="graphics">${icon("graphics")}<span>Grafik</span></button>
                    <button role="tab" data-side="variables">${icon("variables")}<span>Variablen</span></button>
                    <button role="tab" data-side="problems">${icon("problems")}<span>Fehler</span><span class="jp-badge" data-ref="sideBadge"></span></button>
                </div>
                <div class="eo-graphics">
                    <div class="eo-windows" data-ref="graphicsHost"></div>
                    <div class="eo-speedbar">
                        <span class="eo-speed-icon" aria-hidden="true">${icon("turtle")}</span>
                        <input type="range" min="1" max="${SPEED_MAX}" step="1" data-ref="speed" aria-label="Ausführungstempo">
                        <span class="eo-speed-icon" aria-hidden="true">${icon("rabbit")}</span>
                        <span class="eo-speed-label" data-ref="speedLabel"></span>
                        <button class="jp-iconbtn" data-ref="imageBtn" aria-label="Zeichnung als Bild sichern" title="Zeichnung als Bild sichern">${icon("image")}</button>
                    </div>
                </div>
                <div class="eo-variables" data-ref="variablesHost"></div>
                <div class="jp-problems" data-ref="problems"></div>
            </section>
        </main>

        <nav class="jp-bottomnav" aria-label="Ansicht">
            <button data-view="code">${icon("code")}<span>Code</span></button>
            <button data-view="graphics">${icon("graphics")}<span>Grafik</span></button>
            <button data-view="variables">${icon("variables")}<span>Variablen</span></button>
            <button data-view="problems">${icon("problems")}<span>Fehler</span><span class="jp-badge" data-ref="navBadge"></span></button>
        </nav>

        <div class="jp-drawer-backdrop" data-ref="drawerBackdrop"></div>
        <aside class="jp-drawer" data-ref="drawer" aria-label="Menü" inert>
            <div class="jp-drawer-head">
                <div class="jp-brand"><span class="jp-brand-mark">E</span>EOS</div>
                <button class="jp-iconbtn" data-ref="drawerClose" aria-label="Menü schließen">${icon("close")}</button>
            </div>
            <div class="jp-drawer-body">
                <h2>Programme</h2>
                <div class="jp-menu-actions">
                    <button data-ref="newProjectBtn">${icon("plus")}<span>Neues Programm</span></button>
                    <button data-ref="openFileBtn">${icon("open")}<span>Programm aus Datei öffnen (.eos)</span></button>
                    <button data-ref="saveFileBtn">${icon("save")}<span>Programm als Datei sichern</span></button>
                    <button data-ref="helpMenuBtn">${icon("help")}<span>Hilfe zu EOS</span></button>
                </div>
                <ul class="jp-projectlist" data-ref="projectList"></ul>

                <div class="eo-teacher-only">
                <h2>Beispiele</h2>
                <div class="eo-examples">
                ${groups.map((g, gi) => `<details class="eo-example-group"><summary>${icon("book")}<span>${escapeHtml(g.title)}</span></summary>
                    <div class="jp-menu-actions">${g.items.map((e, i) => `<button data-example="${gi}:${i}"><span>${escapeHtml(e.title)}</span></button>`).join("")}</div>
                </details>`).join("")}
                </div>
                </div>

                <h2>Darstellung</h2>
                <div class="jp-segmented" data-ref="themeSwitch">
                    <button data-theme-choice="light">${icon("sun")}<span>Hell</span></button>
                    <button data-theme-choice="dark">${icon("moon")}<span>Dunkel</span></button>
                    <button data-theme-choice="auto">${icon("auto")}<span>System</span></button>
                </div>
                <div class="jp-setting-row">
                    <span>Schriftgröße</span>
                    <div class="jp-stepper">
                        <button data-ref="fontSmaller" aria-label="Schrift kleiner">A−</button>
                        <span data-ref="fontSizeLabel"></span>
                        <button data-ref="fontBigger" aria-label="Schrift größer">A+</button>
                    </div>
                </div>

                <div class="eo-teacher-only">
                <h2>Für Lehrkräfte</h2>
                <label class="eo-check"><input type="checkbox" data-ref="noAttrAssign">
                    <span>Zuweisungen an Attribute verbieten (nur Setzen-Methoden erlaubt, z.&nbsp;B. <code>r.linksSetzen(10)</code> statt <code>r.links := 10</code>)</span></label>
                <div class="jp-menu-actions eo-teacher-off">
                    <button data-ref="teacherOffBtn">${icon("close")}<span>Lehrkraftansicht auf diesem Gerät beenden</span></button>
                </div>
                </div>

                <h2>Über EOS Web</h2>
                <p class="jp-about">EOS – die <b>E</b>infache <b>O</b>bjektorientierte <b>S</b>prache – ist eine Lernsprache mit
                Entwicklungsumgebung von <a href="https://www.pabst-software.de/doku.php?id=programme:eos:start" target="_blank" rel="noopener">Martin Pabst</a>.
                EOS Web bildet Sprache und Klassen nach dem Quelltext von EOS 1.5.9 im Browser nach, damit EOS auch auf dem iPad läuft.
                Deine Programme bleiben auf diesem Gerät, bis du sie als .eos-Datei sicherst. Diese Dateien öffnet auch das Original-EOS.</p>
                <p class="jp-hint">Tipp: Teilen → „Zum Home-Bildschirm“ – dann läuft EOS Web auch offline, und Safari löscht deine Programme nicht.</p>
                <p class="jp-version">Version ${typeof APP_VERSION != "undefined" ? APP_VERSION : ""}</p>
            </div>
        </aside>
        <input type="file" multiple data-ref="fileInput" hidden>
        `);

        this.root.querySelectorAll<HTMLElement>("[data-ref]").forEach(e => this.el[e.dataset.ref!] = e);

        // ----- Kopfzeile -----
        this.el.menuBtn.addEventListener("click", () => this.openDrawer());
        this.el.drawerClose.addEventListener("click", () => this.closeDrawer());
        this.el.drawerBackdrop.addEventListener("click", () => this.closeDrawer());
        this.el.projectBtn.addEventListener("click", () => this.renameProject());
        this.el.undo.addEventListener("click", () => this.editor.undo());
        this.el.redo.addEventListener("click", () => this.editor.redo());
        this.el.formatBtn.addEventListener("click", () => this.formatCode());
        this.el.helpBtn.addEventListener("click", () => this.showHelp());
        this.el.saveBtn.addEventListener("click", () => this.exportProject());
        this.root.querySelectorAll<HTMLElement>(".jp-topbar .jp-edit-tools button:not([data-ref=saveBtn]):not([data-ref=helpBtn])")
            .forEach(b => b.addEventListener("pointerdown", e => e.preventDefault()));

        // ----- Programmlauf -----
        this.el.runBtn.addEventListener("click", () => this.runOrResume());
        this.el.pauseBtn.addEventListener("click", () => this.runner.pause());
        this.el.stopBtn.addEventListener("click", () => this.runner.stop());
        this.el.stepBtn.addEventListener("click", () => this.stepOrStart());
        this.el.bannerStop.addEventListener("click", () => this.runner.stop());
        const speed = <HTMLInputElement>this.el.speed;
        speed.value = String(this.getSpeed());
        speed.addEventListener("input", () => this.setSpeed(parseInt(speed.value)));
        this.el.imageBtn.addEventListener("click", () => this.exportImage());

        // ----- Ansichten -----
        this.root.querySelectorAll<HTMLElement>(".jp-bottomnav [data-view]").forEach(b =>
            b.addEventListener("click", () => this.setView(<View>b.dataset.view)));
        this.root.querySelectorAll<HTMLElement>(".jp-side-switch [data-side]").forEach(b =>
            b.addEventListener("click", () => this.setSideView(<SideView>b.dataset.side)));

        // ----- Menü -----
        this.el.newProjectBtn.addEventListener("click", () => this.newProject());
        this.el.openFileBtn.addEventListener("click", () => { (<HTMLInputElement>this.el.fileInput).value = ""; this.el.fileInput.click(); });
        this.el.fileInput.addEventListener("change", () => {
            const files = [...((<HTMLInputElement>this.el.fileInput).files || [])];
            if (files.length) this.importFiles(files);
        });
        this.el.saveFileBtn.addEventListener("click", () => { this.closeDrawer(); this.exportProject(); });
        this.el.teacherOffBtn.addEventListener("click", () => {
            try { localStorage.removeItem("eos.lehrkraft"); } catch (e) { }
            this.root.classList.remove("is-teacher");
            this.toast("Lehrkraftansicht beendet. Wieder einschalten: Adresse mit ?lehrkraft öffnen.");
        });
        this.el.helpMenuBtn.addEventListener("click", () => { this.closeDrawer(); this.showHelp(); });
        this.root.querySelectorAll<HTMLElement>("[data-example]").forEach(b => b.addEventListener("click", () => {
            const [g, i] = b.dataset.example!.split(":").map(Number);
            this.openExample(groups[g].items[i].title, groups[g].items[i].text);
        }));
        this.el.themeSwitch.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(b =>
            b.addEventListener("click", () => this.setThemeChoice(<ThemeChoice>b.dataset.themeChoice)));
        this.el.fontSmaller.addEventListener("click", () => this.changeFontSize(-1));
        this.el.fontBigger.addEventListener("click", () => this.changeFontSize(+1));
        const noAttr = <HTMLInputElement>this.el.noAttrAssign;
        noAttr.checked = ls("eos.keineZuweisungZuAttributen", "0") == "1";
        noAttr.addEventListener("change", () => {
            lsSet("eos.keineZuweisungZuAttributen", noAttr.checked ? "1" : "0");
            this.checkSyntax();
        });
        this.renderSettings();

        // Breites Layout (iPad quer, Laptop) oder Reiter-Layout (Handy, iPad hoch)
        const mq = matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)");
        const applyLayout = () => {
            this.root.dataset.layout = mq.matches ? "split" : "tabs";
            this.setView(this.view);
        };
        mq.addEventListener("change", applyLayout);
        applyLayout();
    }

    // =====================================================================
    // Ansichten
    // =====================================================================

    setView(view: View) {
        this.view = view;
        if (view != "code") this.sideView = view;
        this.root.dataset.view = view;
        this.root.dataset.side = this.sideView;
        this.root.querySelectorAll<HTMLElement>(".jp-bottomnav [data-view]").forEach(b =>
            b.setAttribute("aria-current", String(b.dataset.view == view)));
        this.root.querySelectorAll<HTMLElement>(".jp-side-switch [data-side]").forEach(b =>
            b.setAttribute("aria-selected", String(b.dataset.side == this.sideView)));
        if (view != "code") this.editor?.view.contentDOM.blur();
        if (this.isVisible("variables")) this.variables?.update(this.runner.runtime);
        requestAnimationFrame(() => this.graphics?.renderAll(true));
    }

    setSideView(side: SideView) {
        this.sideView = side;
        if (this.root.dataset.layout == "tabs") this.setView(side);
        else this.setView(this.view == "code" ? "code" : side);
    }

    private isVisible(v: SideView): boolean {
        if (this.root.dataset.layout == "split") return this.sideView == v;
        return this.view == v;
    }

    private showGraphics() {
        if (this.root.dataset.layout == "tabs") this.setView("graphics");
        else if (this.sideView == "problems") this.setSideView("graphics");
    }

    // =====================================================================
    // Programm laden, speichern, prüfen
    // =====================================================================

    private loadProject(p: ProjectInfo) {
        this.runner.stop(true);
        this.root.dataset.runstate = "stopped";
        this.editor.setEditable(true);
        this.project = p;
        this.store.setCurrentId(p.id);
        this.loadingText = true;
        this.editor.setText(this.store.readText(p.id), p.breakpoints || []);
        this.loadingText = false;
        this.runtimeError = null;
        this.graphics.setRuntime(null);
        this.variables.clear();
        this.runner.breakpoints = new Set(p.breakpoints || []);
        this.checkSyntax();
        this.renderProjectTitle();
    }

    private onDocChanged() {
        if (this.loadingText) return;
        this.project.modified = Date.now();
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveNow(), 400);
        clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => this.checkSyntax(), 250);
        if (this.runtimeError) {
            this.runtimeError = null;
            this.editor.setLineMark(null);
            this.renderProblems();
        }
    }

    private saveNow() {
        clearTimeout(this.saveTimer);
        if (!this.editor) return;
        const ok = this.store.writeText(this.project.id, this.editor.getText());
        this.store.update(this.project.id, { modified: this.project.modified, breakpoints: this.editor.getBreakpoints() });
        if (!ok) this.toast("Der Speicher des Browsers ist voll. Sichere dein Programm als Datei!", "problems");
        this.renderProjectTitle();
    }

    private onBreakpointsChanged() {
        const bps = this.editor.getBreakpoints();
        this.runner.breakpoints = new Set(bps);
        this.store.update(this.project.id, { breakpoints: bps });
    }

    private parseOptions() {
        return { keineZuweisungZuAttributen: ls("eos.keineZuweisungZuAttributen", "0") == "1" };
    }

    checkSyntax() {
        clearTimeout(this.checkTimer);
        const r = parse(this.editor.getText(), this.parseOptions());
        this.syntaxError = r.error;
        this.editor.setError(r.error ? { from: r.error.pos.from, to: r.error.pos.to, message: r.error.message } : null);
        this.renderProblems();
        return r;
    }

    // =====================================================================
    // Programmlauf
    // =====================================================================

    runOrResume() {
        if (this.runner.state == "paused") { this.runner.resume(); return; }
        if (this.runner.state == "running") return;
        this.startProgram(false);
    }

    stepOrStart() {
        if (this.runner.state == "paused") { this.runner.step(); return; }
        if (this.runner.state == "running") { this.runner.pause(); return; }
        this.startProgram(true);
    }

    private startProgram(paused: boolean) {
        this.saveNow();
        const r = this.checkSyntax();
        if (r.error) {
            this.toast("Das Programm enthält noch einen Fehler (Zeile " + r.error.pos.line + ").", "problems");
            if (this.root.dataset.layout == "tabs") this.setView("problems");
            else this.setSideView("problems");
            return;
        }
        this.runtimeError = null;
        this.renderProblems();
        this.editor.setLineMark(null);
        this.showGraphics();
        // Grafikfläche zuerst sichtbar machen, damit die Größe stimmt
        requestAnimationFrame(() => this.runner.start(r.program!, paused));
    }

    private setSpeed(level: number) {
        lsSet("eos.speed", String(level));
        this.runner.setSpeed(level);
        this.renderSpeed();
    }

    private getSpeed(): number {
        const v = parseInt(ls("eos.speed", "30"));
        return isNaN(v) ? 30 : Math.max(1, Math.min(SPEED_MAX, v));
    }

    private renderSpeed() {
        this.el.speedLabel.textContent = speedLabel(this.getSpeed());
        (<HTMLInputElement>this.el.speed).value = String(this.getSpeed());
    }

    private onRunState(s: RunState) {
        this.root.dataset.runstate = s;
        const active = s == "running" || s == "paused";
        this.editor.setEditable(!active);
        this.el.runBannerText.textContent = s == "paused" ? "Das Programm ist angehalten." : "Das Programm läuft.";
        if (!active) this.editor.setLineMark(this.runtimeError ? this.runtimeError.pos.line : null, "exception", !!this.runtimeError);
        if (s == "finished") this.toast("Programm beendet.", "check");
    }

    private onLine(line: number | null) {
        if (this.runtimeError) return;
        this.editor.setLineMark(line, "pointer");
    }

    private onRuntimeError(e: EosError) {
        this.runtimeError = e;
        this.editor.setLineMark(e.pos.line, "exception");
        this.renderProblems();
        this.toast("Laufzeitfehler in Zeile " + e.pos.line + ": " + e.message, "problems");
    }

    // =====================================================================
    // Fehlerliste
    // =====================================================================

    renderProblems() {
        const list = this.el.problems;
        const items: { kind: string, err: EosError }[] = [];
        if (this.syntaxError) items.push({ kind: "Tipp", err: this.syntaxError });
        if (this.runtimeError) items.push({ kind: "Laufzeitfehler", err: this.runtimeError });
        list.innerHTML = "";
        if (items.length == 0) {
            list.innerHTML = `<div class="jp-empty">${icon("check")}<p>Keine Fehler gefunden.</p><p class="jp-hint">Tippe auf ▶, um dein Programm zu starten.</p></div>`;
        }
        for (const { kind, err } of items) {
            const b = document.createElement("button");
            b.className = "jp-problem is-error";
            b.innerHTML = `<span class="jp-problem-where">${kind} · Zeile ${err.pos.line}, Spalte ${err.pos.col}</span>
                <span class="jp-problem-msg">${escapeHtml(err.message)}</span>`;
            b.addEventListener("click", () => {
                this.setView("code");
                this.editor.revealLine(err.pos.line, err.pos.col, true);
                if (this.runner.state != "running" && this.runner.state != "paused") this.editor.focus();
            });
            list.appendChild(b);
        }
        const count = items.length;
        for (const badge of [this.el.navBadge, this.el.sideBadge]) {
            badge.textContent = count > 0 ? String(count) : "";
            badge.hidden = count == 0;
        }
    }

    // =====================================================================
    // Parameterhilfe, Info, Hilfe
    // =====================================================================

    private signatureTimer: any;
    updateSignatureSoon() {
        clearTimeout(this.signatureTimer);
        this.signatureTimer = setTimeout(() => {
            const info = signatureHelp(this.editor.view.state, this.editor.getCursorOffset());
            const bar = this.el.signature;
            if (!info) { bar.hidden = true; return; }
            bar.innerHTML = `<code>${info.html}</code>`;
            bar.hidden = false;
        }, 120);
    }

    showInfo() {
        const html = infoAt(this.editor.view.state, this.editor.getCursorOffset());
        if (!html) {
            this.toast("Zu dieser Stelle gibt es keine Informationen. Setze den Cursor auf einen Namen.");
            return;
        }
        this.dialogs.sheet("Info", `<div class="jp-doc">${html}</div>`);
    }

    showHelp() {
        this.dialogs.sheet("Hilfe zu EOS", helpHtml());
        const c = document.querySelector<HTMLElement>(".jp-sheet .eo-help");
        if (c) wireHelp(c);
    }

    formatCode() {
        if (this.runner.state == "running" || this.runner.state == "paused") return;
        this.toast(this.editor.format() ? "Einrückung geordnet." : "Die Einrückung ist bereits in Ordnung.");
    }

    // =====================================================================
    // Projekte
    // =====================================================================

    renderProjectTitle() {
        this.el.projectName.textContent = this.project.name;
        const unsaved = this.project.modified > this.project.exported;
        this.el.projectState.textContent = unsaved
            ? (this.project.exported == 0 ? "noch nie als Datei gesichert" : "Änderungen nicht als Datei gesichert")
            : "als Datei gesichert";
        this.root.classList.toggle("is-unsaved", unsaved);
    }

    async renameProject() {
        const name = await this.dialogs.prompt({
            title: "Programm umbenennen", label: "Name", value: this.project.name, confirm: "Umbenennen",
            validate: v => v.trim().length == 0 ? "Bitte gib einen Namen ein." : null
        });
        if (!name || name.trim() == this.project.name) return;
        this.project.name = this.store.uniqueName(name.trim(), this.project.id);
        this.store.update(this.project.id, { name: this.project.name });
        this.renderProjectTitle();
        this.renderProjectList();
    }

    renderProjectList() {
        const ul = this.el.projectList;
        ul.innerHTML = "";
        const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
        for (const p of this.store.list()) {
            const li = document.createElement("li");
            const isCurrent = p.id == this.project.id;
            li.className = "jp-projectitem" + (isCurrent ? " is-current" : "");
            li.innerHTML = `
                <button class="jp-projectitem-open">${icon(isCurrent ? "check" : "file")}
                    <span><span class="jp-projectitem-name">${escapeHtml(p.name)}</span>
                    <span class="jp-projectitem-date">geändert ${fmt.format(new Date(p.modified))}</span></span>
                </button>
                <button class="jp-iconbtn jp-projectitem-del" aria-label="Programm „${escapeHtml(p.name)}“ löschen">${icon("trash")}</button>`;
            li.querySelector(".jp-projectitem-open")!.addEventListener("click", () => {
                if (!isCurrent) this.switchToProject(p.id);
                this.closeDrawer();
            });
            li.querySelector(".jp-projectitem-del")!.addEventListener("click", () => this.deleteProject(p));
            ul.appendChild(li);
        }
    }

    switchToProject(id: string) {
        this.saveNow();
        const p = this.store.get(id);
        if (p) this.loadProject(p);
        this.setView("code");
    }

    async newProject() {
        const name = await this.dialogs.prompt({
            title: "Neues Programm", label: "Name", placeholder: "z. B. Auto", confirm: "Anlegen",
            validate: v => v.trim().length == 0 ? "Bitte gib einen Namen ein." : null
        });
        if (!name) return;
        this.saveNow();
        const p = this.store.create(name.trim(), NEW_PROGRAM);
        this.loadProject(p);
        this.closeDrawer();
        this.setView("code");
        setTimeout(() => { this.editor.revealLine(2, 1, true); this.editor.focus(); }, 80);
    }

    openExample(title: string, text: string) {
        this.saveNow();
        const p = this.store.create(title, text);
        p.exported = p.modified;
        this.store.update(p.id, { exported: p.modified });
        this.loadProject(p);
        this.closeDrawer();
        this.setView("code");
        this.toast(`Beispiel „${title}“ geöffnet. Starte es mit ▶.`, "book");
    }

    async deleteProject(p: ProjectInfo) {
        const ok = await this.dialogs.confirm({
            title: `„${p.name}“ löschen?`,
            text: p.exported >= p.modified ? "Das Programm wird von diesem Gerät gelöscht. Deine gesicherte Datei bleibt erhalten."
                : "Das Programm wird von diesem Gerät gelöscht. Es wurde nicht als Datei gesichert und ist danach verloren.",
            confirm: "Löschen", danger: true
        });
        if (!ok) return;
        this.store.delete(p.id);
        if (p.id == this.project.id) {
            const next = this.store.list()[0] || this.store.create("Mein Programm", NEW_PROGRAM);
            this.loadProject(next);
        }
        this.renderProjectList();
    }

    private async shareOrDownload(file: File): Promise<boolean> {
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) {
            try {
                await nav.share({ files: [file] });
                return true;
            } catch (e: any) {
                if (e && e.name == "AbortError") return false;
            }
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return true;
    }

    async exportProject() {
        this.saveNow();
        const filename = ProjectStore.fileName(this.project.name);
        const bytes = ProjectStore.toFileBytes(this.editor.getText());
        const file = new File([bytes as BlobPart], filename, { type: "text/plain" });
        if (!await this.shareOrDownload(file)) return;
        this.project.exported = Date.now();
        this.store.update(this.project.id, { exported: this.project.exported, modified: this.project.modified });
        this.renderProjectTitle();
        this.toast(`„${filename}“ gesichert.`, "check");
    }

    async exportImage() {
        const blob = await this.graphics.exportImage();
        if (!blob) return;
        const file = new File([blob], ProjectStore.fileName(this.project.name).replace(/\.eos$/, ".png"), { type: "image/png" });
        if (await this.shareOrDownload(file)) this.toast("Zeichnung als Bild gesichert.", "check");
    }

    async importFiles(files: File[]) {
        let last: ProjectInfo | null = null;
        for (const f of files) {
            try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                if (bytes.length > 2_000_000) throw new Error("Die Datei ist zu groß für ein EOS-Programm.");
                const text = decodeEos(bytes);
                if (/[\u0000-\u0008\u000E-\u001F]/.test(text.substring(0, 2000))) {
                    throw new Error(`„${f.name}“ ist keine Textdatei. EOS-Programme haben die Endung .eos.`);
                }
                last = this.store.create(ProjectStore.projectNameFromFile(f.name), text);
                last.exported = last.modified;
                this.store.update(last.id, { exported: last.modified });
            } catch (e: any) {
                this.dialogs.alert({ title: "Datei lässt sich nicht öffnen", text: e?.message || String(e) });
            }
        }
        if (last) {
            this.saveNow();
            this.loadProject(last);
            this.closeDrawer();
            this.setView("code");
            this.toast(files.length > 1 ? `${files.length} Programme geöffnet.` : `„${last.name}“ geöffnet.`, "check");
        }
    }

    // =====================================================================
    // Menü & Einstellungen
    // =====================================================================

    openDrawer() {
        this.saveNow();
        this.renderProjectList();
        this.renderSettings();
        this.root.classList.add("drawer-open");
        this.el.drawer.removeAttribute("inert");
        (<HTMLElement>this.el.drawerClose).focus({ preventScroll: true });
    }

    closeDrawer() {
        this.root.classList.remove("drawer-open");
        this.el.drawer.setAttribute("inert", "");
    }

    getThemeChoice(): ThemeChoice { return <ThemeChoice>ls("eos.theme", "auto"); }

    effectiveTheme(): "light" | "dark" {
        const c = this.getThemeChoice();
        if (c == "auto") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        return c;
    }

    setThemeChoice(c: ThemeChoice) {
        lsSet("eos.theme", c);
        this.applyTheme(c);
        this.renderSettings();
    }

    applyTheme(c: ThemeChoice) {
        document.documentElement.dataset.theme = c;
        const eff = this.effectiveTheme();
        document.documentElement.dataset.effective = eff;
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", eff == "dark" ? "#151922" : "#F3F5F9"));
    }

    getFontSize(): number { return parseInt(ls("eos.fontSize", "")) || 16; }

    changeFontSize(delta: number) {
        const size = Math.max(12, Math.min(26, this.getFontSize() + delta));
        lsSet("eos.fontSize", String(size));
        this.editor?.setFontSize(size);
        this.renderSettings();
    }

    renderSettings() {
        const c = this.getThemeChoice();
        this.el.themeSwitch.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(b =>
            b.setAttribute("aria-pressed", String(b.dataset.themeChoice == c)));
        this.el.fontSizeLabel.textContent = this.getFontSize() + " pt";
        this.renderSpeed();
    }

    // =====================================================================
    // Hinweise
    // =====================================================================

    private toastTimer: any;
    toast(text: string, iconName: string = "info") {
        let t = this.root.querySelector<HTMLElement>(".jp-toast");
        if (!t) {
            t = document.createElement("div");
            t.className = "jp-toast";
            t.setAttribute("role", "status");
            this.root.appendChild(t);
        }
        t.innerHTML = icon(iconName) + `<span>${escapeHtml(text)}</span>`;
        t.classList.add("is-visible");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t!.classList.remove("is-visible"), text.length > 60 ? 5000 : 3200);
    }
}
