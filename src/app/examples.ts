/** Beispielprogramme aus der EOS-Distribution, nach Themen geordnet. */

const files = import.meta.glob("../examples/*.eos", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export type Example = { file: string, title: string, text: string };
export type ExampleGroup = { title: string, items: Example[] };

const GROUPS: [string, [string, string][]][] = [
    ["Erste Schritte", [
        ["Aufgaben 1a,b", "Kreis und Rechteck"],
        ["Aufgabe 1c", "Der Ball rollt"],
        ["Rechteck", "Rechteck verschieben und drehen"],
        ["DreieckTest", "Dreieck"],
        ["Fensterfarbe", "Farben des Fensters"],
        ["Auto_einfach", "Auto (mit Attributen)"],
        ["Auto1", "Auto (mit Methoden)"],
        ["Schneemann", "Schneemann"],
        ["Zug", "Zug aus Gruppen"],
    ]],
    ["Turtle", [
        ["Aufgabe 2", "Haus vom Nikolaus"],
        ["Aufgabe 2b", "Haus vom Nikolaus in Farbe"],
        ["Aufgabe 2a", "Haus vom Nikolaus dreht sich"],
        ["Stern", "Stern"],
        ["Stern1", "Stern mit Farbverlauf"],
        ["TurtleTest", "Vielecke mit Methode"],
        ["TurtleTest 2", "Turtle folgt dem Kreisrand"],
        ["Kochkurve", "Kochsche Schneeflocke (Rekursion)"],
        ["Baum", "Baum (Rekursion)"],
        ["Farn1", "Farn (Rekursion)"],
    ]],
    ["Bewegung, Gruppen, Text", [
        ["Drehtest", "Drehendes Rechteck"],
        ["Ellipse drehen", "Gruppe mit Ellipse drehen"],
        ["Aufgabe 3", "Rechtecke einzeln und als Gruppe drehen"],
        ["GruppeTest", "Gruppe spiegeln"],
        ["KlassenTest", "Alle Figuren in einer Gruppe"],
        ["Textfeldtest", "Textfeld"],
        ["Zufall", "Zufall"],
        ["SinCosRoundTest", "Kreisbahn mit sin und cos"],
        ["FürTest", "für-Block"],
    ]],
    ["Variablen und Methoden", [
        ["methodetest", "Methode mit Parametern"],
        ["methodetest2", "var-Parameter"],
        ["StringTest", "Zeichenketten"],
    ]],
];

export function exampleGroups(): ExampleGroup[] {
    const byName = new Map<string, string>();
    for (const [path, text] of Object.entries(files)) {
        byName.set(path.replace(/^.*\//, "").replace(/\.eos$/, ""), text.replace(/\r\n?/g, "\n"));
    }
    return GROUPS.map(([title, items]) => ({
        title,
        items: items.filter(([f]) => byName.has(f)).map(([f, t]) => ({ file: f, title: t, text: byName.get(f)! }))
    }));
}
