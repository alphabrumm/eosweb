/**
 * Der Editor (CodeMirror 6) – touchfreundlich wie in JPad, mit EOS-Hervorhebung,
 * automatischem Einrücken, Haltepunkten (Tippen auf die Zeilennummer) und Programmzeiger.
 */

import { EditorState, Extension, StateEffect, StateField, Compartment, RangeSet, EditorSelection, Transaction } from "@codemirror/state";
import {
    EditorView, keymap, lineNumbers, highlightActiveLineGutter, Decoration, DecorationSet, highlightSpecialChars, dropCursor, GutterMarker, gutter, layer, RectangleMarker
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, toggleComment } from "@codemirror/commands";
import { indentOnInput, bracketMatching, indentUnit } from "@codemirror/language";
import {
    autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, acceptCompletion,
    completionStatus, hasNextSnippetField, nextSnippetField, clearSnippet
} from "@codemirror/autocomplete";
import { setDiagnostics, Diagnostic } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { eosLanguageSupport, formatText } from "./eosLanguage.js";
import { eosCompletions } from "./language.js";

// ----- Programmzeiger und Fehlerzeile -----

type LineMark = { line: number, kind: "pointer" | "exception" };
const setLineMarks = StateEffect.define<LineMark[]>();

const lineMarkField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setLineMarks)) {
                const ranges = e.value
                    .filter(m => m.line >= 1 && m.line <= tr.state.doc.lines)
                    .map(m => Decoration.line({ class: m.kind == "pointer" ? "jp-line-pointer" : "jp-line-exception" })
                        .range(tr.state.doc.line(m.line).from));
                deco = Decoration.set(ranges, true);
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

// ----- Haltepunkte -----

const breakpointEffect = StateEffect.define<{ pos: number, on: boolean }>({
    map: (val, mapping) => ({ pos: mapping.mapPos(val.pos), on: val.on })
});
const clearBreakpoints = StateEffect.define<null>();

class BreakpointMarker extends GutterMarker {
    toDOM() {
        const s = document.createElement("span");
        s.className = "jp-bp";
        s.setAttribute("aria-label", "Haltepunkt");
        return s;
    }
}
const bpMarker = new BreakpointMarker();

const breakpointState = StateField.define<RangeSet<GutterMarker>>({
    create() { return RangeSet.empty; },
    update(set, tr) {
        set = set.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(clearBreakpoints)) set = RangeSet.empty;
            if (e.is(breakpointEffect)) {
                if (e.value.on) set = set.update({ add: [bpMarker.range(e.value.pos)] });
                else set = set.update({ filter: from => from != e.value.pos });
            }
        }
        return set;
    }
});

function hasBreakpoint(view: EditorView, pos: number): boolean {
    let has = false;
    view.state.field(breakpointState).between(pos, pos, () => { has = true; });
    return has;
}

/**
 * Enter innerhalb eines Methodenaufrufs: zum nächsten Parameterfeld bzw. hinter die Klammer springen
 * (wie in JPad), statt die Zeile mitten im Aufruf umzubrechen.
 */
function enterInSnippet(view: EditorView): boolean {
    if (hasNextSnippetField(view.state)) return nextSnippetField(view);
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const line = view.state.doc.lineAt(sel.head);
    const rest = view.state.sliceDoc(sel.head, line.to);
    if (!/^\)+\s*$/.test(rest)) return false;
    clearSnippet(view);
    view.dispatch({ selection: { anchor: sel.head + rest.replace(/\s*$/, "").length }, scrollIntoView: true, userEvent: "select" });
    return true;
}

/** Typografische Anführungszeichen der iPad-Tastatur durch ' ersetzen */
const fixQuotes = EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || !tr.isUserEvent("input")) return tr;
    let found = false;
    tr.changes.iterChanges((_a, _b, _c, _d, ins) => { if (/[‘’‚´`]/.test(ins.toString())) found = true; });
    if (!found) return tr;
    const changes: { from: number, to: number, insert: string }[] = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, ins) => changes.push({ from: fromA, to: toA, insert: ins.toString().replace(/[‘’‚´`]/g, "'") }));
    return { changes, selection: tr.selection, scrollIntoView: tr.scrollIntoView, userEvent: "input.type" };
});

/**
 * Hervorhebung der Cursorzeile als eigene Ebene hinter dem Text.
 *
 * CodeMirrors highlightActiveLine() setzt die Klasse „cm-activeLine“ direkt an den Zeilen im
 * bearbeitbaren Bereich. Auf iPhone/iPad passiert das beim ersten Tipp eines Doppeltipps – Safari
 * verliert dadurch den Ankerpunkt der Wortauswahl und markiert alles vom Textanfang bis zum Wort
 * (außer in der Zeile, in der der Cursor schon stand). Diese Ebene liegt außerhalb des
 * contenteditable-Elements und verändert die Zeilen nicht.
 */
const activeLineLayer = layer({
    above: false,
    class: "pad-activeline-layer",
    update: (update) => update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged || update.focusChanged,
    markers: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return [];
        const block = view.lineBlockAt(sel.head);
        const scroller = view.scrollDOM.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
        const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
        const top = (view.documentTop + block.top * view.scaleY - baseTop) / view.scaleY;
        const left = (content.left - baseLeft) / view.scaleX;
        return [new RectangleMarker("pad-activeline", left, top, content.width / view.scaleX, block.height)];
    }
});

export type EditorListener = {
    onDocChanged?: () => void;
    onCursorActivity?: () => void;
    onFocusChanged?: (focused: boolean) => void;
    onHistoryChanged?: (canUndo: boolean, canRedo: boolean) => void;
    onBreakpointsChanged?: () => void;
    onReadOnlyTap?: () => void;
};

export class EosEditor {
    view: EditorView;
    private fontSizeCompartment = new Compartment();
    private editableCompartment = new Compartment();
    private extensions: Extension[];
    private editable = true;

    constructor(parent: HTMLElement, private listener: EditorListener, fontSize: number) {
        const toggleBp = (view: EditorView, pos: number) => {
            const on = !hasBreakpoint(view, pos);
            view.dispatch({ effects: breakpointEffect.of({ pos, on }) });
            listener.onBreakpointsChanged?.();
            return true;
        };
        this.extensions = [
            gutter({
                class: "jp-bp-gutter",
                markers: v => v.state.field(breakpointState),
                initialSpacer: () => bpMarker,
                domEventHandlers: { mousedown: (view, line) => toggleBp(view, line.from) }
            }),
            lineNumbers({ domEventHandlers: { mousedown: (view, line) => toggleBp(view, line.from) } }),
            breakpointState,
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            dropCursor(),
            indentOnInput(),
            indentUnit.of("   "),
            EditorState.tabSize.of(3),
            bracketMatching({
                renderMatch: (match) => match.end && match.matched
                    ? [Decoration.mark({ class: "cm-matchingBracket" }).range(match.end.from, match.end.to)]
                    : []
            }),
            closeBrackets(),
            activeLineLayer,
            highlightSelectionMatches(),
            ...eosLanguageSupport(),
            lineMarkField,
            fixQuotes,
            autocompletion({
                override: [eosCompletions],
                activateOnTyping: true,
                activateOnTypingDelay: 60,
                icons: true,
                maxRenderedOptions: 80,
                interactionDelay: 0,
                optionClass: () => "jp-completion-option",
            }),
            keymap.of([
                ...closeBracketsKeymap,
                ...completionKeymap,
                { key: "Enter", run: enterInSnippet },
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                { key: "Mod-/", run: toggleComment },
                indentWithTab,
            ]),
            EditorView.contentAttributes.of({
                autocapitalize: "off",
                autocorrect: "off",
                spellcheck: "false",
                "aria-label": "Quelltext",
            }),
            this.fontSizeCompartment.of(this.fontSizeTheme(fontSize)),
            this.editableCompartment.of(EditorView.editable.of(true)),
            EditorView.domEventHandlers({
                pointerdown: () => { if (!this.editable) listener.onReadOnlyTap?.(); return false; }
            }),
            EditorView.updateListener.of(update => {
                if (update.docChanged) listener.onDocChanged?.();
                if (update.docChanged || update.selectionSet) listener.onCursorActivity?.();
                if (update.focusChanged) listener.onFocusChanged?.(update.view.hasFocus);
                if (update.transactions.length > 0) {
                    listener.onHistoryChanged?.(undoDepth(update.state) > 0, redoDepth(update.state) > 0);
                }
                if (update.docChanged && update.startState.field(breakpointState).size > 0) listener.onBreakpointsChanged?.();
            }),
        ];
        this.view = new EditorView({
            state: EditorState.create({ doc: "", extensions: this.extensions }),
            parent
        });
    }

    private fontSizeTheme(size: number): Extension {
        return EditorView.theme({
            "&": { fontSize: size + "px" },
            ".cm-content, .cm-gutters": { lineHeight: "1.6" }
        });
    }

    setFontSize(size: number) {
        this.view.dispatch({ effects: this.fontSizeCompartment.reconfigure(this.fontSizeTheme(size)) });
    }

    /** Neuen Text setzen (neue Rückgängig-Historie) */
    setText(text: string, breakpoints: number[] = []) {
        const state = EditorState.create({ doc: text, extensions: this.extensions });
        this.view.setState(state);
        this.view.dispatch({ effects: this.editableCompartment.reconfigure(EditorView.editable.of(this.editable)) });
        this.setBreakpoints(breakpoints);
        this.listener.onHistoryChanged?.(false, false);
    }

    getText(): string { return this.view.state.doc.toString(); }

    setEditable(on: boolean) {
        this.editable = on;
        this.view.dispatch({ effects: this.editableCompartment.reconfigure(EditorView.editable.of(on)) });
        if (!on) this.view.contentDOM.blur();
    }

    // ----- Haltepunkte -----

    getBreakpoints(): number[] {
        const lines: number[] = [];
        const doc = this.view.state.doc;
        this.view.state.field(breakpointState).between(0, doc.length, from => { lines.push(doc.lineAt(from).number); });
        return [...new Set(lines)].sort((a, b) => a - b);
    }

    setBreakpoints(lines: number[]) {
        const doc = this.view.state.doc;
        const effects: StateEffect<any>[] = [clearBreakpoints.of(null)];
        for (const l of lines) if (l >= 1 && l <= doc.lines) effects.push(breakpointEffect.of({ pos: doc.line(l).from, on: true }));
        this.view.dispatch({ effects });
    }

    // ----- Markierungen -----

    setLineMark(line: number | null, kind: "pointer" | "exception" = "pointer", reveal = true) {
        this.view.dispatch({ effects: setLineMarks.of(line ? [{ line, kind }] : []) });
        if (line && reveal) this.revealLine(line, 1, false);
    }

    setError(err: { from: number, to: number, message: string } | null) {
        const docLength = this.view.state.doc.length;
        const diagnostics: Diagnostic[] = [];
        if (err) {
            let from = Math.min(err.from, docLength), to = Math.min(Math.max(err.to, from), docLength);
            if (from == to) {
                const line = this.view.state.doc.lineAt(from);
                if (from > line.from) from--; else if (to < line.to) to++;
            }
            diagnostics.push({ from, to, severity: "error", message: err.message });
        }
        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }

    revealLine(line: number, column: number, setCursor: boolean) {
        const doc = this.view.state.doc;
        if (line < 1 || line > doc.lines) return;
        const l = doc.line(line);
        const pos = Math.min(l.from + Math.max(0, column - 1), l.to);
        this.view.dispatch({
            selection: setCursor ? EditorSelection.cursor(pos) : undefined,
            effects: EditorView.scrollIntoView(pos, { y: "nearest", yMargin: 60 })
        });
    }

    // ----- Befehle -----

    focus() { this.view.focus(); }
    undo() { undo(this.view); }
    redo() { redo(this.view); }
    startCompletion() { startCompletion(this.view); }
    acceptCompletion() { return completionStatus(this.view.state) == "active" && acceptCompletion(this.view); }
    getCursorOffset(): number { return this.view.state.selection.main.head; }

    /** Fügt Text ein; "§" markiert die neue Cursorposition. */
    insert(text: string) {
        const view = this.view;
        let cursorDelta = text.indexOf("§");
        if (cursorDelta >= 0) text = text.replace("§", ""); else cursorDelta = text.length;
        const range = view.state.selection.main;
        view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: { anchor: range.from + cursorDelta },
            userEvent: "input.type",
            scrollIntoView: true
        });
    }

    moveCursor(delta: number) {
        const view = this.view;
        const head = Math.max(0, Math.min(view.state.doc.length, view.state.selection.main.head + delta));
        view.dispatch({ selection: { anchor: head }, scrollIntoView: true });
    }

    indentMore() { indentWithTab.run!(this.view); }

    /** Programm neu einrücken. Liefert false, wenn sich nichts geändert hat. */
    format(): boolean {
        const old = this.getText();
        const neu = formatText(old);
        if (neu == old) return false;
        // Minimalen Bereich ersetzen, damit Cursor und Haltepunkte erhalten bleiben
        const changes: { from: number, to: number, insert: string }[] = [];
        const oldLines = old.split("\n"), newLines = neu.split("\n");
        let pos = 0;
        for (let i = 0; i < oldLines.length; i++) {
            if (oldLines[i] != newLines[i]) changes.push({ from: pos, to: pos + oldLines[i].length, insert: newLines[i] });
            pos += oldLines[i].length + 1;
        }
        this.view.dispatch({ changes, annotations: Transaction.userEvent.of("input.format") });
        return true;
    }
}
