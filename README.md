# wEOS

**EOS – Einfache objektorientierte Sprache** als Web-App für iPad, Tablet und Browser.
EOS ist eine Lernsprache mit Entwicklungsumgebung von [Martin Pabst](https://www.pabst-software.de/doku.php?id=programme:eos:start)
für den Einstieg in die objektorientierte Programmierung ab Jahrgangsstufe 6.
wEOS bildet Sprache, Klassen und Ablaufsteuerung nach dem Delphi-Quelltext von EOS 1.5.9 in TypeScript nach.
Bedienung und Gestaltung entsprechen JPad.

## Was wEOS kann

- Alle Sprachelemente von EOS: Deklarationen, Zuweisungen, `wiederhole … mal / immer / solange / bis`,
  `solange … tue`, `wenn … dann … sonst`, `für`, eigene Methoden mit Wert- und `var`-Parametern
- Alle Klassen: RECHTECK, QUADRAT, KREIS, ELLIPSE, DREIECK, LINIE, TEXTFELD, TURTLE, GRUPPE, FENSTER, FARBE
  mit denselben Attributen, Methoden und `…Setzen`-Methoden; Farben, Linien- und Füllarten
- Syntaxprüfung während der Eingabe mit den Fehlermeldungen von EOS (teils verständlicher formuliert)
- Tempo in den 30 Stufen des Originals (plus „maximal“), Pause, Einzelschritt, Haltepunkte (Tippen auf die Zeilennummer),
  Variablenansicht mit Attributen; geänderte Werte erscheinen rot
- Editor für Touch und Hardware-Tastatur: Hilfsleiste mit `:=`, `( )`, `' '` …, Vorschläge nach `objekt.`,
  Parameterhilfe, automatisches Einrücken, Bausteine für alle Kontrollstrukturen
- Hilfe mit Befehlen, allen Klassen und Konstanten; Beispielprogramme aus der EOS-Distribution
- **Ohne Login, ohne Server:** Programme bleiben im Browser und lassen sich als `.eos`-Datei sichern und öffnen.
  Das Format entspricht dem Original (Windows-1252, CRLF), Dateien laufen also in beide Richtungen.
- Offline nutzbar nach „Zum Home-Bildschirm“ (PWA); Zeichnung als PNG sichern;
  Koordinaten anzeigen durch Antippen der Zeichenfläche

## Lehrkraftansicht

Schülerinnen und Schüler sehen keine Beispielprogramme. Lehrkräfte öffnen die App einmal mit
`?lehrkraft` am Ende der Adresse (z. B. `https://alphabrumm.github.io/eosweb/?lehrkraft`).
Das Gerät merkt sich die Einstellung; im Menü lässt sie sich wieder beenden (oder mit `?lehrkraft=0`).
Die Lehrkraftansicht ist eine Komfortfunktion, kein Zugriffsschutz.

## Bauen

```
npm install
npm run build          # Ergebnis in dist/ – auf jeden Webspace mit HTTPS hochladen
npm run build-single   # alles in einer Datei: eos-web.html
npm test               # führt alle Beispielprogramme ohne Oberfläche aus
```

Bei jedem Push auf `main` baut GitHub Actions die App und veröffentlicht sie auf GitHub Pages
(Einstellungen → Pages → Source: „GitHub Actions“).

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/eos/scanner.ts` | Scanner (UScanner.pas) |
| `src/eos/parser.ts` | Syntaxprüfung und Syntaxbaum (USyntaxcheck.pas) |
| `src/eos/classes.ts` | Klassen der Grafik (UKlassen.pas) |
| `src/eos/builtins.ts` | Konstanten und Funktionen (UVariablen.pas) |
| `src/eos/runtime.ts` | Interpreter (UInterpreter.pas) |
| `src/eos/runner.ts` | Tempo, Einzelschritt, Haltepunkte (UMain.pas) |
| `src/eos/painter.ts` | Zeichnen auf Canvas wie die Windows-GDI (UDaten.pas) |
| `src/app/` | Oberfläche (Editor, Grafik, Variablen, Hilfe, Projekte) |

## Abweichungen vom Original

- `t.links(…)`, `t.rechts(…)` gibt es als Kurzform von `linksdrehen`/`rechtsdrehen` (wie in neueren EOS-Versionen).
- `setzeXY(x, y)` verwendet die Parameter in der angegebenen Reihenfolge; das Attribut `kurs` zeigt die aktuelle Richtung.
- `wiederhole 0 mal` führt den Block nicht aus; Division durch 0 und endlose Rekursion melden einen Laufzeitfehler.
- In Bedingungen sind nur Wahrheitswerte erlaubt (das Original wertete andere Werte stillschweigend als falsch).
- Ist die Anzeige kleiner als das Original-Zeichenfenster (440 × 350), wird die Zeichnung verkleinert.

## Rechtliches

EOS ist Freeware von Martin Pabst; eine Veröffentlichung ist laut seiner Website nur mit seinem Einverständnis erlaubt.
Vor einer öffentlichen Bereitstellung bitte mit ihm klären. Die Beispielprogramme stammen aus der EOS-Distribution.
Gestaltung übernommen aus JPad.
