/**
 * Die Klassen von EOS – möglichst wörtlich übertragen aus UKlassen.pas (EOS 1.5.9, Martin Pabst).
 *
 * Klassenindex (ci): Vererbung wird über Teilbarkeit abgebildet
 * (FIGUR = 2, GEFÜLLTEFIGUR = 4, RECHTECK = 16, QUADRAT = 32, TEXTFELD = 16·17, …).
 * Ein Objekt der Klasse mit Index a passt auf einen Parameter der Klasse b, wenn a mod b = 0.
 */

import { Attribut, DrawCanvas, EosObjekt, Methode, objMethod, dround, dtrunc } from "./types.js";

const ZPId360 = 0.01745329251994329576923690768488;
const PIh = Math.PI / 2;

// Delphi-Konstanten für Stifte und Pinsel
export const PS = { solid: 0, dash: 1, dot: 2, dashDot: 3, dashDotDot: 4, clear: 5 };
export const BS = { solid: 0, clear: 1, horizontal: 2, vertical: 3, fDiagonal: 4, bDiagonal: 5, cross: 6, diagCross: 7 };

export const CI = {
    FIGUR: 2, GEFUELLTEFIGUR: 4, RECHTECK: 16, QUADRAT: 32, FENSTER: 41, ELLIPSE: 44, LINIE: 46,
    KREIS: 52, GRUPPE: 58, TURTLE: 62, FARBE: 67, TEXTFELD: 272, DREIECK: 364
};

/** Wird von der Oberfläche gesetzt (Textmaße für Textfelder) */
export const textMetrics = {
    width: (s: string, font: string, sizePt: number) => s.length * sizePt * 96 / 72 * 0.55 + 0 * font.length,
    height: (_s: string, _font: string, sizePt: number) => Math.round(sizePt * 96 / 72 * 1.15),
};

export function rgbColor(r: number, g: number, b: number) { return r + 256 * g + 65536 * b; }

type Punkt = { x: number, y: number };

// =====================================================================================
// FARBE
// =====================================================================================

export class Farbe extends EosObjekt {
    r: Attribut; g: Attribut; b: Attribut;
    color = 0;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner);
        this.ci = CI.FARBE; this.klassenname = "FARBE";
        const m = objMethod("setzergb", this, 1);
        m.addParam("Rotwert", "integer").addParam("Grünwert", "integer").addParam("Blauwert", "integer");
        this.addMethode(m);
        this.r = this.addAttribut(new Attribut("rot", this, "integer", 0));
        this.g = this.addAttribut(new Attribut("grün", this, "integer", 0));
        this.b = this.addAttribut(new Attribut("blau", this, "integer", 0));
        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(_a: Attribut | null) {
        for (const a of [this.r, this.g, this.b]) {
            if (a.value < 0) a.value = 0;
            if (a.value > 255) a.value = 255;
        }
        this.color = this.r.value + 256 * this.g.value + 65536 * this.b.value;
        // Änderung an der Farbe an den Besitzer weitermelden (z. B. Füllfarbe einer Gruppe)
    }

    copyfrom(o: EosObjekt) {
        const f = <Farbe>o;
        this.setzergb(f.r.value, f.g.value, f.b.value);
    }

    kopie(name: string, owner: EosObjekt | null) {
        const f = new Farbe(name, owner);
        f.copyfrom(this);
        return f;
    }

    methodenaufruf(nummer: number, args: any[]) {
        if (nummer == 1) this.setzergb(args[0], args[1], args[2]);
    }

    setzergb(r: number, g: number, b: number) {
        this.r.value = r; this.g.value = g; this.b.value = b;
        this.attributaenderung(null);
    }

    setzefarbe(c: number) {
        this.r.value = c & 0xFF;
        this.g.value = (c & 0xFF00) >> 8;
        this.b.value = (c & 0xFF0000) >> 16;
        this.color = c;
    }
}

// =====================================================================================
// FIGUR
// =====================================================================================

export class Figur extends EosObjekt {
    linksalt = 0; rechtsalt = 0; obenalt = 0; untenalt = 0;
    flinks = -10; frechts = 10; foben = 10; funten = -10;
    links: Attribut; oben: Attribut; rechts: Attribut; unten: Attribut;
    rahmenfarbe: Attribut; rahmenstaerke: Attribut; linienart: Attribut;
    sichtbar: Attribut; breite: Attribut; hoehe: Attribut;
    msetzeEcken: Methode; msetzeLinksOben: Methode; msetzerechtsunten: Methode;
    mverschiebenach: Methode; mdrehe: Methode; mstrecke: Methode; mdrehenUm: Methode; mstreckenAn: Methode;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner);
        this.ci = CI.FIGUR; this.klassenname = "FIGUR";

        let m = objMethod("verschieben", this, 1);
        m.addParam("x-Verschiebung", "integer").addParam("y-Verschiebung", "integer");
        this.addMethode(m);

        m = objMethod("eckenSetzen", this, 7);
        m.addParam("links", "integer").addParam("oben", "integer").addParam("rechts", "integer").addParam("unten", "integer");
        this.msetzeEcken = this.addMethode(m);

        m = objMethod("linksObenSetzen", this, 8);
        m.addParam("links", "integer").addParam("oben", "integer");
        this.msetzeLinksOben = this.addMethode(m);

        m = objMethod("rechtsUntenSetzen", this, 9);
        m.addParam("rechts", "integer").addParam("unten", "integer");
        this.msetzerechtsunten = this.addMethode(m);

        m = objMethod("strecken", this, 30);
        m.addParam("Streckungsfaktor", "real");
        this.mstrecke = this.addMethode(m);

        m = objMethod("verschiebenNach", this, 31);
        m.addParam("links", "integer").addParam("oben", "integer");
        this.mverschiebenach = this.addMethode(m);

        m = objMethod("drehen", this, 45);
        m.addParam("Drehwinkel", "real");
        this.mdrehe = this.addMethode(m);

        m = objMethod("drehenUm", this, 146);
        m.addParam("X-Koord. Drehpunkt", "integer").addParam("Y-Koord. Drehpunkt", "integer").addParam("Drehwinkel", "real");
        this.mdrehenUm = this.addMethode(m);

        m = objMethod("streckenAn", this, 147);
        m.addParam("x-Koord. Zentrum", "integer").addParam("y-Koord. Zentrum", "integer").addParam("Faktor", "real");
        this.mstreckenAn = this.addMethode(m);

        this.sichtbar = this.addAttribut(new Attribut("sichtbar", this, "boolean", 0));
        this.sichtbar.value = true;
        this.links = this.addAttribut(new Attribut("links", this, "integer", 0));
        this.oben = this.addAttribut(new Attribut("oben", this, "integer", 0));
        this.rechts = this.addAttribut(new Attribut("rechts", this, "integer", 0));
        this.unten = this.addAttribut(new Attribut("unten", this, "integer", 0));
        this.rahmenstaerke = this.addAttribut(new Attribut("randstärke", this, "integer", 0));
        this.linienart = this.addAttribut(new Attribut("randart", this, "integer", 0));
        this.rahmenfarbe = this.addAttribut(new Attribut("randfarbe", this, "objekt", CI.FARBE));
        this.rahmenfarbe.value = new Farbe("", this);
        this.breite = this.addAttribut(new Attribut("breite", this, "integer", 0));
        this.hoehe = this.addAttribut(new Attribut("höhe", this, "integer", 0));

        this.links.value = -10; this.rechts.value = 10; this.oben.value = 10; this.unten.value = -10;
        this.flinks = -10; this.frechts = 10; this.foben = 10; this.funten = -10;
        this.breite.value = 20; this.hoehe.value = 20;
        this.rahmenstaerke.value = 1; this.linienart.value = PS.solid;

        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        if (this.links.value > this.rechts.value) {
            if (a == this.links) {
                this.rechts.value = this.links.value + dround(this.rechtsalt - this.linksalt);
                this.frechts = this.rechts.value;
            }
            if (a == this.rechts) {
                this.links.value = this.rechts.value - dround(this.rechtsalt - this.linksalt);
                this.flinks = this.links.value;
            }
        }
        if (this.oben.value < this.unten.value) {
            if (a == this.unten) {
                this.oben.value = this.unten.value + dround(this.obenalt - this.untenalt);
                this.foben = this.oben.value;
            }
            if (a == this.oben) {
                this.unten.value = this.oben.value - dround(this.obenalt - this.untenalt);
                this.funten = this.unten.value;
            }
        }
        if (a != this.breite && a != this.hoehe) {
            this.breite.value = Math.abs(this.links.value - this.rechts.value);
            this.hoehe.value = Math.abs(this.oben.value - this.unten.value);
        }
        this.flinks = this.links.value;
        this.frechts = this.rechts.value;
        this.foben = this.oben.value;
        this.funten = this.unten.value;
        this.obenalt = this.foben; this.untenalt = this.funten;
        this.rechtsalt = this.frechts; this.linksalt = this.flinks;
    }

    copyfrom(o: EosObjekt) {
        const f = <Figur>o;
        this.flinks = f.flinks; this.frechts = f.frechts; this.foben = f.foben; this.funten = f.funten;
        this.setzeAttributelinksrechtsobenunten();
        this.sichtbar.value = f.sichtbar.value;
        this.rahmenstaerke.value = f.rahmenstaerke.value;
        this.linienart.value = f.linienart.value;
        (<Farbe>this.rahmenfarbe.value).copyfrom(f.rahmenfarbe.value);
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const f = new Figur(name, owner);
        f.copyfrom(this);
        return f;
    }

    methodenaufruf(nummer: number, args: any[]): any {
        this.linksalt = this.flinks; this.rechtsalt = this.frechts;
        this.obenalt = this.foben; this.untenalt = this.funten;
        switch (nummer) {
            case 1: this.verschiebe(args[0], args[1]); break;
            case 7: this.setzeEcken(args[0], args[1], args[2], args[3]); break;
            case 8: this.setzeLinksOben(args[0], args[1]); break;
            case 9: this.setzerechtsunten(args[0], args[1]); break;
            case 30: this.strecken(args[0]); break;
            case 31: this.verschiebenach(args[0], args[1]); break;
            case 45: this.drehe((this.frechts + this.flinks) / 2, (this.foben + this.funten) / 2, args[0]); break;
            case 146: this.drehe(args[0], args[1], args[2]); break;
            case 147: this.strecke(args[2], args[0], args[1]); break;
        }
    }

    paint(c: DrawCanvas) {
        if (this.sichtbar.value) {
            c.pen.width = this.rahmenstaerke.value;
            c.pen.style = this.linienart.value;
            c.pen.color = (<Farbe>this.rahmenfarbe.value).color;
        }
    }

    setzeEcken(links: number, oben: number, rechts: number, unten: number) {
        this.flinks = links; this.frechts = rechts; this.foben = oben; this.funten = unten;
        this.setzeAttributelinksrechtsobenunten();
        this.attributaenderung(null);
    }

    setzeLinksOben(links: number, oben: number) {
        this.verschiebenach(links, oben);
    }

    setzerechtsunten(rechts: number, unten: number) {
        this.frechts = rechts; this.funten = unten;
        this.setzeAttributelinksrechtsobenunten();
        this.attributaenderung(null);
    }

    spieglex(achse: number) {
        this.flinks = achse - (this.flinks - achse);
        this.frechts = achse - (this.frechts - achse);
        const z = this.flinks; this.flinks = this.frechts; this.frechts = z;
        this.setzeAttributelinksrechtsobenunten();
    }

    spiegley(achse: number) {
        this.foben = achse - (this.foben - achse);
        this.funten = achse - (this.funten - achse);
        const z = this.foben; this.foben = this.funten; this.funten = z;
        this.setzeAttributelinksrechtsobenunten();
    }

    strecke(faktor: number, vx: number, vy: number) {
        if (Math.abs(vx + (this.frechts - vx) * faktor) < 100000) this.frechts = vx + (this.frechts - vx) * faktor;
        if (Math.abs(vx + (this.flinks - vx) * faktor) < 100000) this.flinks = vx + (this.flinks - vx) * faktor;
        if (Math.abs(vy + (this.foben - vy) * faktor) < 100000) this.foben = vy + (this.foben - vy) * faktor;
        if (Math.abs(vy + (this.funten - vy) * faktor) < 100000) this.funten = vy + (this.funten - vy) * faktor;
        this.setzeAttributelinksrechtsobenunten();
    }

    strecken(faktor: number) {
        if (Math.abs(faktor) > 0.00001) this.strecke(faktor, (this.flinks + this.frechts) / 2, (this.foben + this.funten) / 2);
        this.attributaenderung(null);
    }

    verschiebe(dx: number, dy: number) {
        this.flinks += dx; this.frechts += dx; this.foben += dy; this.funten += dy;
        this.setzeAttributelinksrechtsobenunten();
    }

    verschiebenach(links: number, oben: number) {
        this.verschiebe(dround(links - this.flinks), dround(oben - this.foben));
    }

    drehe(_dx: number, _dy: number, _winkel: number) { }

    static drehePunktUm(p: Punkt, dx: number, dy: number, winkel: number) {
        const sinw = Math.sin(winkel * ZPId360), cosw = Math.cos(winkel * ZPId360);
        const sx = p.x - dx, sy = p.y - dy;
        p.x = dx + (sx * cosw - sy * sinw);
        p.y = dy + (sx * sinw + sy * cosw);
    }

    setzeAttributelinksrechtsobenunten() {
        let z: number;
        if (this.flinks > this.frechts) { z = this.flinks; this.flinks = this.frechts; this.frechts = z; }
        if (this.funten > this.foben) { z = this.funten; this.funten = this.foben; this.foben = z; }
        if (Math.abs(this.flinks) < 100000) this.links.value = dround(this.flinks);
        if (Math.abs(this.frechts) < 100000) this.rechts.value = dround(this.frechts);
        if (Math.abs(this.foben) < 100000) this.oben.value = dround(this.foben);
        if (Math.abs(this.funten) < 100000) this.unten.value = dround(this.funten);
        this.breite.value = this.rechts.value - this.links.value;
        this.hoehe.value = this.oben.value - this.unten.value;
    }
}

// =====================================================================================
// GEFÜLLTEFIGUR
// =====================================================================================

export class GefuellteFigur extends Figur {
    fuellfarbe: Attribut; fuellart: Attribut;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.GEFUELLTEFIGUR; this.klassenname = "GEFÜLLTEFIGUR";
        this.fuellfarbe = this.addAttribut(new Attribut("füllfarbe", this, "objekt", CI.FARBE));
        this.fuellfarbe.value = new Farbe("", this);
        (<Farbe>this.fuellfarbe.value).setzergb(255, 255, 255);
        this.fuellart = this.addAttribut(new Attribut("füllart", this, "integer", 0));
        this.fuellart.value = BS.solid;
        this.createSetzeMethoden(inheritedFlag);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const g = <GefuellteFigur>o;
        (<Farbe>this.fuellfarbe.value).copyfrom(g.fuellfarbe.value);
        this.fuellart.value = g.fuellart.value;
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const g = new GefuellteFigur(name, owner);
        g.copyfrom(this);
        return g;
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (this.sichtbar.value) {
            c.brush.color = (<Farbe>this.fuellfarbe.value).color;
            c.brush.style = this.fuellart.value;
        }
    }
}

// =====================================================================================
// RECHTECK
// =====================================================================================

export class Rechteck extends GefuellteFigur {
    wurdegedreht = false;
    ecken: Punkt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.wurdegedreht = false;
        this.ecken = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
        this.ci = CI.RECHTECK; this.zeichenbar = true; this.klassenname = "RECHTECK";
        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        if (a == this.breite && this.breite.value >= 0) {
            this.rechts.value = this.links.value + this.breite.value;
            a = this.rechts;
        }
        if (a == this.hoehe && this.hoehe.value >= 0) {
            this.unten.value = this.oben.value - this.hoehe.value;
            a = this.unten;
        }
        super.attributaenderung(a);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const r = <Rechteck>o;
        this.wurdegedreht = r.wurdegedreht;
        this.ecken = r.ecken.map(p => ({ x: p.x, y: p.y }));
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const r = new Rechteck(name, owner);
        r.copyfrom(this);
        return r;
    }

    drehe(dx: number, dy: number, winkel: number) {
        if (!this.wurdegedreht) this.eckenAusGrenzen();
        for (const p of this.ecken) Figur.drehePunktUm(p, dx, dy, winkel);
        this.grenzensetzen();
    }

    protected eckenAusGrenzen() {
        this.ecken[0] = { x: this.links.value, y: this.oben.value };
        this.ecken[1] = { x: this.links.value, y: this.unten.value };
        this.ecken[2] = { x: this.rechts.value, y: this.unten.value };
        this.ecken[3] = { x: this.rechts.value, y: this.oben.value };
        this.wurdegedreht = true;
    }

    grenzensetzen() {
        let xmin = 10000, ymin = 10000, xmax = -10000, ymax = -10000;
        for (const p of this.ecken) {
            if (p.x < xmin) xmin = dround(p.x);
            if (p.x > xmax) xmax = dround(p.x);
            if (p.y < ymin) ymin = dround(p.y);
            if (p.y > ymax) ymax = dround(p.y);
        }
        this.flinks = xmin; this.frechts = xmax; this.foben = ymax; this.funten = ymin;
        this.setzeAttributelinksrechtsobenunten();
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (!this.sichtbar.value) return;
        if (this.wurdegedreht) {
            c.polygon(this.ecken.map(p => [c.xW(p.x), c.yW(p.y)]));
        } else {
            const x1 = c.xW(this.links.value), x2 = c.xW(this.rechts.value);
            const y1 = c.yW(this.oben.value), y2 = c.yW(this.unten.value);
            c.rectangle(x1, y1, x2 + 1, y2 + 1);
        }
    }

    spieglex(achse: number) {
        if (!this.wurdegedreht) { super.spieglex(achse); return; }
        for (const p of this.ecken) p.x = achse - (p.x - achse);
        this.grenzensetzen();
    }

    spiegley(achse: number) {
        if (!this.wurdegedreht) { super.spiegley(achse); return; }
        for (const p of this.ecken) p.y = achse - (p.y - achse);
        this.grenzensetzen();
    }

    strecke(faktor: number, vx: number, vy: number) {
        if (!this.wurdegedreht) { super.strecke(faktor, vx, vy); return; }
        for (const p of this.ecken) {
            if (Math.abs(vx + (p.x - vx) * faktor) < 100000) p.x = vx + (p.x - vx) * faktor;
            if (Math.abs(vy + (p.y - vy) * faktor) < 100000) p.y = vy + (p.y - vy) * faktor;
        }
        this.grenzensetzen();
    }

    verschiebe(dx: number, dy: number) {
        if (!this.wurdegedreht) { super.verschiebe(dx, dy); return; }
        for (const p of this.ecken) { p.x += dx; p.y += dy; }
        this.grenzensetzen();
    }
}

// =====================================================================================
// QUADRAT
// =====================================================================================

export class Quadrat extends Rechteck {
    seitenlaenge: Attribut;
    fSeitenlaenge = 20;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.QUADRAT; this.klassenname = "QUADRAT";
        this.seitenlaenge = this.addAttribut(new Attribut("seitenlänge", this, "integer", 0));
        this.seitenlaenge.value = this.rechts.value - this.links.value;
        this.fSeitenlaenge = this.seitenlaenge.value;
        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzerechtsunten.hidden = true; this.mstrecke.hidden = true;
        const m = objMethod("strecken", this, 30);
        m.addParam("Faktor", "real");
        this.addMethode(m);
        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        super.attributaenderung(a);
        if (a == this.links) this.frechts = this.flinks + this.fSeitenlaenge;
        else if (a == this.oben) this.funten = this.foben - this.fSeitenlaenge;
        this.setzeAttributelinksrechtsobenunten();
        if (a == this.seitenlaenge) {
            if (this.seitenlaenge.value < 0) this.seitenlaenge.value = Math.abs(this.seitenlaenge.value);
            if (this.seitenlaenge.value == 0) this.seitenlaenge.value = 2;
            this.fSeitenlaenge = this.seitenlaenge.value;
            const s = this.fSeitenlaenge;
            if (!this.wurdegedreht) {
                const l = this.links.value, o = this.oben.value;
                this.ecken = [{ x: l, y: o }, { x: l, y: o - s }, { x: l + s, y: o - s }, { x: l + s, y: o }];
            } else {
                this.aufSeitenlaengeBringen();
            }
            this.grenzensetzen();
        }
    }

    private aufSeitenlaengeBringen() {
        const mx = (this.ecken[0].x + this.ecken[2].x) / 2;
        const my = (this.ecken[0].y + this.ecken[2].y) / 2;
        for (const p of this.ecken) {
            let d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
            if (Math.abs(d) < 0.0001) d = 0.0001;
            p.x = mx + (p.x - mx) * this.fSeitenlaenge / (d * Math.SQRT2);
            p.y = my + (p.y - my) * this.fSeitenlaenge / (d * Math.SQRT2);
        }
    }

    copyfrom(o: EosObjekt) {
        const q = <Quadrat>o;
        this.fSeitenlaenge = q.fSeitenlaenge;
        if (this.fSeitenlaenge < 100000) this.seitenlaenge.value = dround(this.fSeitenlaenge);
        super.copyfrom(o);
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const q = new Quadrat(name, owner);
        q.copyfrom(this);
        return q;
    }

    methodenaufruf(nummer: number, args: any[]) {
        if (nummer == 30) {
            if (this.wurdegedreht) this.strecken(args[0]);
            else this.qstrecke(args[0]);
            return;
        }
        return super.methodenaufruf(nummer, args);
    }

    qstrecke(faktor: number) {
        this.fSeitenlaenge = this.fSeitenlaenge * faktor;
        if (this.fSeitenlaenge < 100000) this.seitenlaenge.value = dround(this.fSeitenlaenge);
        if (!this.wurdegedreht) this.eckenAusGrenzen();
        this.aufSeitenlaengeBringen();
        this.grenzensetzen();
    }
}

// =====================================================================================
// TEXTFELD
// =====================================================================================

export class Textfeld extends Rechteck {
    zeilen: string[] = [];
    groesseAutomatischAnpassen: Attribut;
    ausrichtunghorizontal: Attribut; ausrichtungvertikal: Attribut;
    schriftart: Attribut; schriftgroesse: Attribut; schriftfarbe: Attribut; durchsichtig: Attribut;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.TEXTFELD; this.zeichenbar = true; this.klassenname = "TEXTFELD";
        this.zeilen = [];

        let m = objMethod("zeileHinzufügen", this, 10);
        m.addParam("Text", "string");
        this.addMethode(m);
        m = objMethod("zeilenLöschen", this, 11);
        this.addMethode(m);

        this.groesseAutomatischAnpassen = this.addAttribut(new Attribut("groesseAutomatischAnpassen", this, "boolean", 0));
        this.groesseAutomatischAnpassen.value = true;
        this.ausrichtunghorizontal = this.addAttribut(new Attribut("ausrichtungHorizontal", this, "integer", 0));
        this.ausrichtungvertikal = this.addAttribut(new Attribut("ausrichtungVertikal", this, "integer", 0));
        this.schriftart = this.addAttribut(new Attribut("schriftart", this, "string", 0));
        this.schriftart.value = "Arial";
        this.schriftgroesse = this.addAttribut(new Attribut("schriftgröße", this, "integer", 0));
        this.schriftgroesse.value = 12;
        this.schriftfarbe = this.addAttribut(new Attribut("schriftfarbe", this, "objekt", CI.FARBE));
        this.schriftfarbe.value = new Farbe("", this);
        (<Farbe>this.schriftfarbe.value).setzergb(0, 0, 0);
        this.durchsichtig = this.addAttribut(new Attribut("durchsichtig", this, "boolean", 0));
        this.durchsichtig.value = false;

        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        if (this.groesseAutomatischAnpassen.value) this.groesseAnpassen();
        super.attributaenderung(a);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const t = <Textfeld>o;
        this.schriftart.value = t.schriftart.value;
        this.ausrichtunghorizontal.value = t.ausrichtunghorizontal.value;
        this.ausrichtungvertikal.value = t.ausrichtungvertikal.value;
        this.schriftgroesse.value = t.schriftgroesse.value;
        (<Farbe>this.schriftfarbe.value).copyfrom(t.schriftfarbe.value);
        this.durchsichtig.value = t.durchsichtig.value;
        this.groesseAutomatischAnpassen.value = t.groesseAutomatischAnpassen.value;
        for (const z of t.zeilen) this.zeilen.push(z);
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const t = new Textfeld(name, owner);
        t.copyfrom(this);
        return t;
    }

    private zeilenhoehe(): number {
        const font = this.schriftart.value, size = this.schriftgroesse.value;
        return this.zeilen.length > 1 ? textMetrics.height("HDF|g", font, size) : textMetrics.height(this.zeilen[0], font, size);
    }

    groesseAnpassen() {
        let hges = 0, b = 0, zeilenabstand = 0;
        if (this.zeilen.length >= 1) {
            const h = this.zeilenhoehe();
            zeilenabstand = dround(h / 4);
            hges = this.zeilen.length * h + (this.zeilen.length - 1) * zeilenabstand;
            for (const z of this.zeilen) {
                const w = Math.round(textMetrics.width(z, this.schriftart.value, this.schriftgroesse.value));
                if (w > b) b = w;
            }
        }
        this.rechts.value = this.links.value + b + 2 * zeilenabstand;
        this.unten.value = this.oben.value - hges - 2 * zeilenabstand;
    }

    methodenaufruf(nummer: number, args: any[]) {
        super.methodenaufruf(nummer, args);
        if (nummer == 10) this.zeileHinzufuegen(args[0]);
        else if (nummer == 11) this.zeilen = [];
    }

    zeileHinzufuegen(text: string) {
        this.zeilen.push(text);
        if (this.groesseAutomatischAnpassen.value) this.groesseAnpassen();
        // Grenzen (flinks …) an die neuen Attributwerte anpassen
        super.attributaenderung(null);
    }

    strecke(faktor: number, vx: number, vy: number) {
        super.strecke(faktor, vx, vy);
        if (this.groesseAutomatischAnpassen.value) this.groesseAnpassen();
    }

    paint(c: DrawCanvas) {
        if (!this.durchsichtig.value && this.sichtbar.value) super.paint(c);
        if (!this.sichtbar.value || this.zeilen.length < 1) return;
        c.font.name = this.schriftart.value;
        c.font.size = this.schriftgroesse.value;
        c.font.color = (<Farbe>this.schriftfarbe.value).color;
        c.brush.style = BS.clear;
        const h = this.zeilen.length > 1 ? c.textHeight("HDF|g") : c.textHeight(this.zeilen[0]);
        const zeilenabstand = dround(h / 4);
        const hges = this.zeilen.length * h + (this.zeilen.length - 1) * zeilenabstand;
        const oben = this.oben.value, unten = this.unten.value, links = this.links.value, rechts = this.rechts.value;
        let yo: number;
        switch (this.ausrichtungvertikal.value) {
            case 0: yo = oben - dround((oben - unten - hges) / 2); break;
            case 1: yo = oben - zeilenabstand; break;
            case 2: yo = unten + hges + zeilenabstand; break;
            default: yo = oben;
        }
        for (const z of this.zeilen) {
            const b = c.textWidth(z);
            let xo: number;
            switch (this.ausrichtunghorizontal.value) {
                case 0: xo = links + dround((rechts - links - b) / 2); break;
                case 1: xo = links + zeilenabstand; break;
                case 2: xo = rechts - b - zeilenabstand; break;
                default: xo = links;
            }
            c.textOut(c.xW(xo), c.yW(yo), z);
            yo = yo - h - zeilenabstand;
        }
        c.brush.style = BS.solid;
    }
}

// =====================================================================================
// ELLIPSE
// =====================================================================================

export class Ellipse extends GefuellteFigur {
    radiusx: Attribut; radiusy: Attribut; mittex: Attribut; mittey: Attribut;
    fRadiusx = 10; fRadiusy = 10; fMittex = 0; fMittey = 0;
    winkel = 0;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.ELLIPSE; this.zeichenbar = true; this.klassenname = "ELLIPSE";
        this.winkel = 0;
        const m = objMethod("mittelpunktSetzen", this, 31);
        m.addParam("x", "integer").addParam("y", "integer");
        this.addMethode(m);
        this.radiusx = this.addAttribut(new Attribut("radiusx", this, "integer", 0)); this.radiusx.value = 10;
        this.radiusy = this.addAttribut(new Attribut("radiusy", this, "integer", 0)); this.radiusy.value = 10;
        this.mittex = this.addAttribut(new Attribut("mittex", this, "integer", 0)); this.mittex.value = 0;
        this.mittey = this.addAttribut(new Attribut("mittey", this, "integer", 0)); this.mittey.value = 0;
        this.fRadiusx = 10; this.fRadiusy = 10; this.fMittex = 0; this.fMittey = 0;
        this.attributaenderung(null);
        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzeLinksOben.hidden = true;
        this.msetzerechtsunten.hidden = true; this.mverschiebenach.hidden = true;
        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        if (a == this.radiusx) this.fRadiusx = this.radiusx.value;
        if (a == this.radiusy) this.fRadiusy = this.radiusy.value;
        if (a == this.mittex) this.fMittex = this.mittex.value;
        if (a == this.mittey) this.fMittey = this.mittey.value;
        this.flinks = this.fMittex - this.fRadiusx;
        this.frechts = this.fMittex + this.fRadiusx;
        this.funten = this.fMittey - this.fRadiusy;
        this.foben = this.fMittey + this.fRadiusy;
        this.setzeAttributelinksrechtsobenunten();
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const e = <Ellipse>o;
        this.fMittex = e.fMittex; this.fMittey = e.fMittey;
        this.fRadiusx = e.fRadiusx; this.fRadiusy = e.fRadiusy;
        this.winkel = e.winkel;
        this.setzeAttributeVonDouble();
        this.attributaenderung(null);
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const e = new Ellipse(name, owner);
        e.copyfrom(this);
        return e;
    }

    drehe(dx: number, dy: number, winkel: number) {
        const p = { x: this.fMittex, y: this.fMittey };
        Figur.drehePunktUm(p, dx, dy, winkel);
        this.fMittex = p.x; this.fMittey = p.y;
        this.winkel = this.winkel + winkel;
        this.winkel = this.winkel - 360 * dtrunc(this.winkel / 360);
        this.setzeAttributeVonDouble();
        this.attributaenderung(null);
    }

    methodenaufruf(nummer: number, args: any[]) {
        switch (nummer) {
            case 1: this.verschiebe(args[0], args[1]); return;
            case 31: this.verschiebenach(args[0], args[1]); return;
            case 45: this.drehe(this.fMittex, this.fMittey, args[0]); return;
        }
        return super.methodenaufruf(nummer, args);
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (!this.sichtbar.value) return;
        if (Math.abs(this.winkel) < 0.00001) {
            c.ellipse(c.xW(this.flinks), c.yW(this.foben), c.xW(this.frechts), c.yW(this.funten));
            return;
        }
        let prx = dround(this.fRadiusx), pry = dround(this.fRadiusy);
        if (prx > 10000) prx = 10000;
        if (pry > 10000) pry = 10000;
        const mx = c.xW(this.fMittex), my = c.yW(this.fMittey);
        let anz = dround(3.14 * (prx + pry) / 8) * 4;
        if (anz < 12) anz = 12;
        if (anz > 1000) anz = 1000;
        let w = this.winkel * 0.017453292;
        const v1x = prx * Math.cos(w), v1y = -prx * Math.sin(w);
        const v2x = pry * Math.cos(w + PIh), v2y = -pry * Math.sin(w + PIh);
        anz = Math.floor(anz / 4);
        w = 0;
        const dw = PIh / anz;
        const punkte: number[][] = new Array(anz * 4);
        for (let i = 0; i < anz; i++) {
            for (let k = 0; k < 4; k++) {
                punkte[i + k * anz] = [
                    dround(v1x * Math.cos(w + k * PIh) + v2x * Math.sin(w + k * PIh) + mx),
                    dround(v1y * Math.cos(w + k * PIh) + v2y * Math.sin(w + k * PIh) + my)];
            }
            w += dw;
        }
        // Grenzen aus den Punkten bestimmen (wie TEllipse.Grenzensetzen)
        let xmin = 10000, ymin = 10000, xmax = -10000, ymax = -10000;
        for (const p of punkte) {
            if (p[0] - mx < xmin) xmin = p[0] - mx;
            if (p[0] - mx > xmax) xmax = p[0] - mx;
            if (p[1] - my < ymin) ymin = p[1] - my;
            if (p[1] - my > ymax) ymax = p[1] - my;
        }
        this.flinks = xmin + this.fMittex; this.frechts = xmax + this.fMittex;
        this.foben = ymax + this.fMittey; this.funten = ymin + this.fMittey;
        this.setzeAttributelinksrechtsobenunten();
        c.polygon(punkte);
    }

    setzeAttributeVonDouble() {
        if (this.fRadiusx < 100000) this.radiusx.value = dround(this.fRadiusx);
        if (this.fRadiusy < 100000) this.radiusy.value = dround(this.fRadiusy);
        if (Math.abs(this.fMittex) < 100000) this.mittex.value = dround(this.fMittex);
        if (Math.abs(this.fMittey) < 100000) this.mittey.value = dround(this.fMittey);
    }

    spieglex(achse: number) {
        super.spieglex(achse);
        this.fMittex = achse - (this.fMittex - achse);
        this.winkel = 180 - this.winkel;
        this.setzeAttributeVonDouble();
    }

    spiegley(achse: number) {
        super.spiegley(achse);
        this.fMittey = achse - (this.fMittey - achse);
        this.winkel = 360 - this.winkel;
        this.setzeAttributeVonDouble();
    }

    strecke(faktor: number, vx: number, vy: number) {
        if (Math.abs(vx + (this.fMittex - vx) * faktor) < 100000) this.fMittex = vx + (this.fMittex - vx) * faktor;
        if (this.fRadiusx * faktor < 100000) this.fRadiusx = this.fRadiusx * faktor;
        if (Math.abs(vy + (this.fMittey - vy) * faktor) < 100000) this.fMittey = vy + (this.fMittey - vy) * faktor;
        if (this.fRadiusy * faktor < 100000) this.fRadiusy = this.fRadiusy * faktor;
        this.setzeAttributeVonDouble();
        this.attributaenderung(null);
    }

    verschiebe(dx: number, dy: number) {
        this.fMittex += dx; this.fMittey += dy;
        this.setzeAttributeVonDouble();
        this.attributaenderung(null);
    }

    verschiebenach(x: number, y: number) {
        this.verschiebe(dround(x - this.fMittex), dround(y - this.fMittey));
    }
}

// =====================================================================================
// KREIS
// =====================================================================================

export class Kreis extends GefuellteFigur {
    dRadius = 10; dMittex = 0; dMittey = 0;
    radius: Attribut; mittex: Attribut; mittey: Attribut;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.KREIS; this.klassenname = "KREIS"; this.zeichenbar = true;
        const m = objMethod("mittelpunktSetzen", this, 31);
        m.addParam("x", "integer").addParam("y", "integer");
        this.addMethode(m);
        this.radius = this.addAttribut(new Attribut("radius", this, "integer", 0)); this.radius.value = 10;
        this.mittex = this.addAttribut(new Attribut("mittex", this, "integer", 0)); this.mittex.value = 0;
        this.mittey = this.addAttribut(new Attribut("mittey", this, "integer", 0)); this.mittey.value = 0;
        this.dRadius = 10; this.dMittex = 0; this.dMittey = 0;
        this.attributaenderung(this.mittex); this.attributaenderung(this.mittey); this.attributaenderung(this.radius);
        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzeLinksOben.hidden = true;
        this.msetzerechtsunten.hidden = true; this.mverschiebenach.hidden = true;
        this.createSetzeMethoden(inheritedFlag);
    }

    aktualisiereAttribute() {
        this.radius.value = dround(this.dRadius);
        this.mittex.value = dround(this.dMittex);
        this.mittey.value = dround(this.dMittey);
    }

    attributaenderung(a: Attribut | null) {
        if (a == this.radius) this.dRadius = this.radius.value;
        if (a == this.mittex) this.dMittex = this.mittex.value;
        if (a == this.mittey) this.dMittey = this.mittey.value;
        this.flinks = this.mittex.value - this.radius.value;
        this.frechts = this.mittex.value + this.radius.value;
        this.funten = this.mittey.value - this.radius.value;
        this.foben = this.mittey.value + this.radius.value;
        this.setzeAttributelinksrechtsobenunten();
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const k = <Kreis>o;
        this.dMittex = k.dMittex; this.dMittey = k.dMittey; this.dRadius = k.dRadius;
        this.mittex.value = k.mittex.value; this.mittey.value = k.mittey.value; this.radius.value = k.radius.value;
        this.attributaenderung(null);
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const k = new Kreis(name, owner);
        k.copyfrom(this);
        return k;
    }

    drehe(dx: number, dy: number, winkel: number) {
        const p = { x: this.dMittex, y: this.dMittey };
        Figur.drehePunktUm(p, dx, dy, winkel);
        this.dMittex = p.x; this.dMittey = p.y;
        this.aktualisiereAttribute();
        this.attributaenderung(null);
    }

    methodenaufruf(nummer: number, args: any[]) {
        switch (nummer) {
            case 1: this.verschiebe(args[0], args[1]); return;
            case 31: this.verschiebenach(args[0], args[1]); return;
        }
        return super.methodenaufruf(nummer, args);
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (!this.sichtbar.value) return;
        c.ellipse(c.xW(this.dMittex - this.dRadius), c.yW(this.dMittey + this.dRadius),
            c.xW(this.dMittex + this.dRadius), c.yW(this.dMittey - this.dRadius));
    }

    spieglex(achse: number) {
        this.dMittex = achse - (this.dMittex - achse);
        this.aktualisiereAttribute();
        this.attributaenderung(null);
    }

    spiegley(achse: number) {
        this.dMittey = achse - (this.dMittey - achse);
        this.aktualisiereAttribute();
        this.attributaenderung(null);
    }

    strecke(faktor: number, vx: number, vy: number) {
        if (Math.abs(vx + (this.dMittex - vx) * faktor) < 100000) this.dMittex = vx + (this.dMittex - vx) * faktor;
        if (Math.abs(vx + (this.dMittey - vy) * faktor) < 100000) this.dMittey = vy + (this.dMittey - vy) * faktor;
        if (Math.abs(this.dRadius * faktor) < 100000) this.dRadius = this.dRadius * faktor;
        this.aktualisiereAttribute();
        this.attributaenderung(null);
    }

    verschiebe(dx: number, dy: number) {
        this.dMittex += dx; this.dMittey += dy;
        this.aktualisiereAttribute();
        this.attributaenderung(null);
    }

    verschiebenach(x: number, y: number) {
        this.verschiebe(x - this.mittex.value, y - this.mittey.value);
    }
}

// =====================================================================================
// LINIE
// =====================================================================================

export class Linie extends Figur {
    fx1 = -10; fy1 = 10; fx2 = 10; fy2 = -10;
    x1: Attribut; y1: Attribut; x2: Attribut; y2: Attribut;
    farbe: Attribut; dicke: Attribut;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.LINIE; this.zeichenbar = true; this.klassenname = "LINIE";

        let m = objMethod("punkt1Setzen", this, 70);
        m.addParam("x", "integer").addParam("y", "integer");
        this.addMethode(m);
        m = objMethod("punkt2Setzen", this, 71);
        m.addParam("x", "integer").addParam("y", "integer");
        this.addMethode(m);
        m = objMethod("endpunkteSetzen", this, 72);
        m.addParam("x1", "integer").addParam("y1", "integer").addParam("x2", "integer").addParam("y2", "integer");
        this.addMethode(m);

        this.x1 = this.addAttribut(new Attribut("x1", this, "integer", 0));
        this.y1 = this.addAttribut(new Attribut("y1", this, "integer", 0));
        this.x2 = this.addAttribut(new Attribut("x2", this, "integer", 0));
        this.y2 = this.addAttribut(new Attribut("y2", this, "integer", 0));
        this.farbe = this.addAttribut(new Attribut("farbe", this, "objekt", CI.FARBE));
        this.farbe.value = new Farbe("farbe", this);
        this.dicke = this.addAttribut(new Attribut("linienStärke", this, "integer", 0));
        this.linienart.name = "linienart";

        this.x1.value = -10; this.y1.value = 10; this.x2.value = 10; this.y2.value = -10;
        this.fx1 = -10; this.fy1 = 10; this.fx2 = 10; this.fy2 = -10;
        this.attributaenderung(this.x1);

        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzeLinksOben.hidden = true; this.msetzerechtsunten.hidden = true;
        this.rahmenfarbe.hidden = true; this.rahmenstaerke.hidden = true;

        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        super.attributaenderung(a);
        if (a == this.x1) this.fx1 = this.x1.value;
        if (a == this.x2) this.fx2 = this.x2.value;
        if (a == this.y1) this.fy1 = this.y1.value;
        if (a == this.y2) this.fy2 = this.y2.value;
        if (a == this.oben) this.foben = this.oben.value;
        if (a == this.unten) this.funten = this.unten.value;
        if (a == this.rechts) this.frechts = this.rechts.value;
        if (a == this.links) this.flinks = this.links.value;
        if (a == this.x1 || a == this.x2 || a == this.y1 || a == this.y2) {
            if (this.fx1 < this.fx2) { this.flinks = this.fx1; this.frechts = this.fx2; }
            else { this.frechts = this.fx1; this.flinks = this.fx2; }
            if (this.fy1 < this.fy2) { this.funten = this.fy1; this.foben = this.fy2; }
            else { this.foben = this.fy1; this.funten = this.fy2; }
        } else if (a == this.links || a == this.rechts || a == this.oben || a == this.unten) {
            if (this.flinks < this.frechts) { this.fx1 = this.flinks; this.fx2 = this.frechts; }
            else { this.fx1 = this.frechts; this.fx2 = this.flinks; }
            if (this.foben < this.funten) { this.fy1 = this.foben; this.fy2 = this.funten; }
            else { this.fy1 = this.funten; this.fy2 = this.foben; }
        }
        this.x1.value = dround(this.fx1); this.x2.value = dround(this.fx2);
        this.y1.value = dround(this.fy1); this.y2.value = dround(this.fy2);
        this.links.value = dround(this.flinks); this.rechts.value = dround(this.frechts);
        this.oben.value = dround(this.foben); this.unten.value = dround(this.funten);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const l = <Linie>o;
        (<Farbe>this.farbe.value).copyfrom(l.farbe.value);
        this.dicke.value = l.dicke.value;
        this.fx1 = l.fx1; this.fx2 = l.fx2; this.fy1 = l.fy1; this.fy2 = l.fy2;
        this.setzeAttributex1y1x2y2();
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const l = new Linie(name, owner);
        l.copyfrom(this);
        return l;
    }

    drehe(dx: number, dy: number, winkel: number) {
        const p1 = { x: this.fx1, y: this.fy1 }, p2 = { x: this.fx2, y: this.fy2 };
        Figur.drehePunktUm(p1, dx, dy, winkel);
        Figur.drehePunktUm(p2, dx, dy, winkel);
        this.fx1 = p1.x; this.fy1 = p1.y; this.fx2 = p2.x; this.fy2 = p2.y;
        this.setzeAttributex1y1x2y2();
    }

    methodenaufruf(nummer: number, args: any[]) {
        switch (nummer) {
            case 70: this.setzePunkt1(args[0], args[1]); break;
            case 71: this.setzePunkt2(args[0], args[1]); break;
            case 72: this.setzePunkte(args[0], args[1], args[2], args[3]); break;
        }
        return super.methodenaufruf(nummer, args);
    }

    paint(c: DrawCanvas) {
        c.pen.style = this.linienart.value;
        c.pen.color = (<Farbe>this.farbe.value).color;
        c.pen.width = this.dicke.value;
        if (!this.sichtbar.value) return;
        c.brush.style = BS.clear;
        c.moveTo(c.xW(this.fx1), c.yW(this.fy1));
        c.lineTo(c.xW(this.fx2), c.yW(this.fy2));
        c.brush.style = BS.solid;
    }

    setzeAttributex1y1x2y2() {
        this.x1.value = dround(this.fx1); this.x2.value = dround(this.fx2);
        this.y1.value = dround(this.fy1); this.y2.value = dround(this.fy2);
        this.attributaenderung(null);
    }

    setzePunkt1(x: number, y: number) { this.fx1 = x; this.fy1 = y; this.setzeAttributex1y1x2y2(); }
    setzePunkt2(x: number, y: number) { this.fx2 = x; this.fy2 = y; this.setzeAttributex1y1x2y2(); }
    setzePunkte(x1: number, y1: number, x2: number, y2: number) {
        this.fx1 = x1; this.fy1 = y1; this.fx2 = x2; this.fy2 = y2;
        this.setzeAttributex1y1x2y2();
    }

    spieglex(achse: number) {
        super.spieglex(achse);
        this.fx1 = achse - (this.fx1 - achse);
        this.fx2 = achse - (this.fx2 - achse);
        this.setzeAttributex1y1x2y2();
    }

    spiegley(achse: number) {
        super.spiegley(achse);
        this.fy1 = achse - (this.fy1 - achse);
        this.fy2 = achse - (this.fy2 - achse);
        this.setzeAttributex1y1x2y2();
    }

    strecke(faktor: number, vx: number, vy: number) {
        super.strecke(faktor, vx, vy);
        if (Math.abs(vx + (this.fx1 - vx) * faktor) < 100000) this.fx1 = vx + (this.fx1 - vx) * faktor;
        if (Math.abs(vx + (this.fx2 - vx) * faktor) < 100000) this.fx2 = vx + (this.fx2 - vx) * faktor;
        if (Math.abs(vy + (this.fy1 - vx) * faktor) < 100000) this.fy1 = vy + (this.fy1 - vy) * faktor;
        if (Math.abs(vy + (this.fy2 - vx) * faktor) < 100000) this.fy2 = vy + (this.fy2 - vy) * faktor;
        this.setzeAttributex1y1x2y2();
    }

    verschiebe(dx: number, dy: number) {
        this.fx1 += dx; this.fx2 += dx; this.fy1 += dy; this.fy2 += dy;
        this.setzeAttributex1y1x2y2();
    }
}

// =====================================================================================
// GRUPPE
// =====================================================================================

export class Gruppe extends GefuellteFigur {
    flinksalt = 0; frechtsalt = 0; fobenalt = 0; funtenalt = 0;
    figur: Figur[] = [];

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.zeichenbar = true;
        this.ci = CI.GRUPPE; this.klassenname = "GRUPPE";
        this.flinksalt = this.flinks; this.frechtsalt = this.frechts;
        this.fobenalt = this.foben; this.funtenalt = this.funten;
        this.figur = [];

        let m = objMethod("kopiere", this, 2);
        m.addParam("figur", "objekt", CI.FIGUR);
        this.addMethode(m);
        m = objMethod("schlucke", this, 22);
        m.addParam("figur", "objekt", CI.FIGUR);
        this.addMethode(m);
        this.addMethode(objMethod("spiegleX", this, 20));
        this.addMethode(objMethod("spiegleY", this, 21));

        this.createSetzeMethoden(inheritedFlag);
    }

    kopiereObjekt(o: Figur, schlucken: boolean) {
        let kopie: Figur;
        if (!schlucken) {
            kopie = <Figur>o.kopie("", this);
            if (kopie instanceof Turtle) kopie.turtlesichtbar.value = false;
        } else {
            kopie = o;
        }
        this.figur.push(kopie);
        if (this.figur.length == 1) {
            this.flinks = o.flinks; this.frechts = o.frechts; this.foben = o.foben; this.funten = o.funten;
        } else {
            if (o.flinks < this.flinks) this.flinks = o.flinks;
            if (o.frechts > this.frechts) this.frechts = o.frechts;
            if (o.foben > this.foben) this.foben = o.foben;
            if (o.funten < this.funten) this.funten = o.funten;
        }
        this.flinksalt = this.flinks; this.frechtsalt = this.frechts;
        this.fobenalt = this.foben; this.funtenalt = this.funten;
        this.setzeAttributelinksrechtsobenunten();
    }

    /** Wörtlich wie im Original (inklusive der eigenwilligen Bestimmung von oben/unten). */
    ermittleGrenzen() {
        let links = 10000, rechts = -10000, oben = 10000, unten = -10000;
        for (const f of this.figur) {
            if (f instanceof Gruppe) f.ermittleGrenzen();
            if (f.flinks < links) links = f.flinks;
            if (f.frechts > rechts) rechts = f.frechts;
            if (f.foben < oben) oben = f.foben;
            if (f.funten > unten) unten = f.funten;
        }
        this.flinks = links; this.frechts = rechts; this.funten = unten; this.foben = oben;
        this.setzeAttributelinksrechtsobenunten();
    }

    attributaenderung(a: Attribut | null) {
        super.attributaenderung(a);
        if (a == this.fuellfarbe) {
            for (const f of this.figur) if (f instanceof GefuellteFigur) {
                (<Farbe>f.fuellfarbe.value).color = (<Farbe>this.fuellfarbe.value).color;
                (<Farbe>f.fuellfarbe.value).setzefarbe((<Farbe>this.fuellfarbe.value).color);
                f.attributaenderung(f.fuellfarbe);
            }
        }
        if (a == this.fuellart) {
            for (const f of this.figur) if (f instanceof GefuellteFigur) {
                f.fuellart.value = this.fuellart.value;
                f.attributaenderung(f.fuellart);
            }
        }
        if (a == this.linienart) {
            for (const f of this.figur) {
                f.linienart.value = this.linienart.value;
                f.attributaenderung(f.linienart);
            }
        }
        if (a == this.rahmenfarbe) {
            for (const f of this.figur) {
                (<Farbe>f.rahmenfarbe.value).setzefarbe((<Farbe>this.rahmenfarbe.value).color);
                f.attributaenderung(f.rahmenfarbe);
                if (f instanceof Linie) {
                    (<Farbe>f.farbe.value).setzefarbe((<Farbe>this.rahmenfarbe.value).color);
                    f.attributaenderung(f.farbe);
                }
            }
        }
        if (a == this.sichtbar) {
            for (const f of this.figur) f.sichtbar.value = this.sichtbar.value;
        }
        if (a == this.links) this.verschiebe(dround(this.links.value - this.flinksalt), 0);
        else if (a == this.rechts) this.verschiebe(dround(this.rechts.value - this.frechtsalt), 0);
        else if (a == this.oben) this.verschiebe(0, dround(this.oben.value - this.fobenalt));
        else if (a == this.unten) this.verschiebe(0, dround(this.unten.value - this.funtenalt));
        else if (a == this.breite) {
            if (this.breite.value > 0) this.strecken(this.breite.value / (this.frechts - this.flinks));
            else this.breite.value = this.rechts.value - this.links.value;
        } else if (a == this.hoehe) {
            if (this.hoehe.value > 0) this.strecken(this.hoehe.value / (this.foben - this.funten));
            else this.hoehe.value = this.oben.value - this.unten.value;
        }
        this.flinksalt = this.flinks; this.frechtsalt = this.frechts;
        this.fobenalt = this.foben; this.funtenalt = this.funten;
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        for (const f of (<Gruppe>o).figur) this.figur.push(<Figur>f.kopie("", this));
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const g = new Gruppe(name, owner);
        g.copyfrom(this);
        return g;
    }

    methodenaufruf(nummer: number, args: any[]) {
        this.ermittleGrenzen();
        super.methodenaufruf(nummer, args);
        switch (nummer) {
            case 2: this.kopiereObjekt(args[0], false); break;
            case 20: this.spieglex(dround((this.links.value + this.rechts.value) / 2)); break;
            case 21: this.spiegley(dround((this.oben.value + this.unten.value) / 2)); break;
            case 22: this.kopiereObjekt(args[0], true); break;
        }
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (this.sichtbar.value) for (const f of this.figur) f.paint(c);
    }

    verschiebe(dx: number, dy: number) {
        this.testGrenzen();
        this.flinks += dx; this.frechts += dx; this.funten += dy; this.foben += dy;
        this.setzeAttributelinksrechtsobenunten();
        for (const f of this.figur) f.verschiebe(dx, dy);
    }

    spieglex(achse: number) {
        this.testGrenzen();
        super.spieglex(achse);
        for (const f of this.figur) f.spieglex(achse);
        this.korrigiereobenuntenlinksrechts();
    }

    spiegley(achse: number) {
        this.testGrenzen();
        super.spiegley(achse);
        for (const f of this.figur) f.spiegley(achse);
        this.korrigiereobenuntenlinksrechts();
    }

    strecke(faktor: number, vx: number, vy: number) {
        this.testGrenzen();
        super.strecke(faktor, vx, vy);
        for (const f of this.figur) f.strecke(faktor, vx, vy);
        this.korrigiereobenuntenlinksrechts();
    }

    korrigiereobenuntenlinksrechts() {
        let z: number;
        if (this.foben < this.funten) { z = this.foben; this.foben = this.funten; this.funten = z; }
        if (this.frechts < this.flinks) { z = this.frechts; this.frechts = this.flinks; this.flinks = z; }
        this.flinksalt = this.flinks; this.frechtsalt = this.frechts;
        this.fobenalt = this.foben; this.funtenalt = this.funten;
    }

    testGrenzen() {
        let l = 10000, r = -10000, o = -10000, u = 10000;
        for (const f of this.figur) {
            if (f.flinks < l) l = f.flinks;
            if (f.frechts > r) r = f.frechts;
            if (f.foben > o) o = f.foben;
            if (f.funten < u) u = f.funten;
        }
        if (Math.abs(this.links.value - l) > 1e-6) this.links.value = l;
        if (Math.abs(this.rechts.value - r) > 1e-6) this.rechts.value = r;
        if (Math.abs(this.oben.value - o) > 1e-6) this.oben.value = o;
        if (Math.abs(this.unten.value - u) > 1e-6) this.unten.value = u;
    }

    drehe(dx: number, dy: number, winkel: number) {
        for (const f of this.figur) f.drehe(dx, dy, winkel);
        this.testGrenzen();
    }
}

// =====================================================================================
// TURTLE
// =====================================================================================

type Segment = { x1: number, y1: number, x2: number, y2: number, farbe: number, linienart: number, linienstaerke: number };

export class Turtle extends Figur {
    farbe: Attribut; linienstaerke: Attribut; turtlesichtbar: Attribut;
    turtleX: Attribut; turtleY: Attribut; kurs: Attribut;
    penstate = true;
    x = 0; y = 0; richtung = 0;
    xneu = 0; yneu = 0;
    segmente: Segment[] = [];
    aufpunkt = false; vorpunkt = false;
    /** wird vom Interpreter gesetzt: prüft eine Bildschirmstelle (wahr = Zeichnung vorhanden) */
    punktTest: ((t: Turtle, x: number, y: number) => boolean) | null = null;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.TURTLE; this.zeichenbar = true; this.klassenname = "TURTLE";
        this.segmente = [];
        this.x = 0; this.y = 0; this.penstate = true; this.richtung = 0;

        let m = objMethod("vor", this, 50); m.addParam("Streckenlänge", "real"); this.addMethode(m);
        m = objMethod("zurück", this, 51); m.addParam("Streckenlänge", "real"); this.addMethode(m);
        m = objMethod("linksdrehen", this, 52); m.addParam("Winkel", "real"); this.addMethode(m);
        m = objMethod("rechtsdrehen", this, 53); m.addParam("Winkel", "real"); this.addMethode(m);
        // Kurzformen aus neueren EOS-Versionen (in den Beispielen verwendet)
        m = objMethod("links", this, 52); m.addParam("Winkel", "real"); this.addMethode(m);
        m = objMethod("rechts", this, 53); m.addParam("Winkel", "real"); this.addMethode(m);
        m = objMethod("setzeXY", this, 59); m.addParam("x", "real").addParam("y", "real"); this.addMethode(m);
        this.addMethode(objMethod("stiftAuf", this, 54));
        this.addMethode(objMethod("stiftAb", this, 55));
        this.addMethode(objMethod("allesLöschen", this, 56));
        this.addMethode(objMethod("aufPunkt", this, 57, "boolean"));
        this.addMethode(objMethod("vorPunkt", this, 58, "boolean"));

        this.farbe = this.addAttribut(new Attribut("farbe", this, "objekt", CI.FARBE));
        this.farbe.value = new Farbe("", this);
        this.linienstaerke = this.addAttribut(new Attribut("linienstärke", this, "integer", 0));
        this.turtlesichtbar = this.addAttribut(new Attribut("turtleSichtbar", this, "boolean", 0));
        this.turtleX = this.addAttribut(new Attribut("x", this, "real", 0));
        this.turtleY = this.addAttribut(new Attribut("y", this, "real", 0));
        this.kurs = this.addAttribut(new Attribut("kurs", this, "real", 0));
        this.linienstaerke.value = 3; this.turtlesichtbar.value = true;

        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzeLinksOben.hidden = true;
        this.msetzerechtsunten.hidden = true; this.mverschiebenach.hidden = true;
        this.rahmenfarbe.hidden = true; this.rahmenstaerke.hidden = true;

        this.createSetzeMethoden(inheritedFlag);
    }

    attributaenderung(a: Attribut | null) {
        if (a == this.turtleX) { this.xneu = this.turtleX.value; this.yneu = this.y; this.createSegment(); }
        if (a == this.turtleY) { this.yneu = this.turtleY.value; this.xneu = this.x; this.createSegment(); }
        if (a == this.kurs) this.richtung = this.kurs.value;
        super.attributaenderung(a);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        const t = <Turtle>o;
        this.linienart.value = t.linienart.value;
        (<Farbe>this.farbe.value).copyfrom(t.farbe.value);
        this.linienstaerke.value = t.linienstaerke.value;
        this.penstate = t.penstate;
        this.turtlesichtbar.value = t.turtlesichtbar.value;
        this.x = t.x; this.y = t.y; this.richtung = t.richtung;
        this.segmente = t.segmente.map(s => ({ ...s }));
        this.punktTest = t.punktTest;
        this.syncAttribute();
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const t = new Turtle(name, owner);
        t.copyfrom(this);
        return t;
    }

    createSegment() {
        const s: Segment = { x1: this.x, y1: this.y, x2: this.xneu, y2: this.yneu, farbe: 0, linienart: 0, linienstaerke: 0 };
        this.x = this.xneu; this.y = this.yneu;
        if (!this.penstate) return;
        if (s.x1 < this.flinks) { this.flinks = s.x1; this.links.value = dround(this.flinks); }
        if (s.x2 < this.flinks) { this.flinks = s.x2; this.links.value = dround(this.flinks); }
        if (s.x1 > this.frechts) { this.frechts = s.x1; this.rechts.value = dround(this.frechts); }
        if (s.x2 > this.frechts) { this.frechts = s.x2; this.rechts.value = dround(this.frechts); }
        if (s.y1 < this.funten) { this.funten = s.y1; this.unten.value = dround(this.funten); }
        if (s.y2 < this.funten) { this.funten = s.y2; this.unten.value = dround(this.funten); }
        if (s.y1 > this.foben) { this.foben = s.y1; this.oben.value = dround(this.foben); }
        if (s.y2 > this.foben) { this.foben = s.y2; this.oben.value = dround(this.foben); }
        s.farbe = (<Farbe>this.farbe.value).color;
        s.linienart = this.linienart.value;
        s.linienstaerke = this.linienstaerke.value;
        this.segmente.push(s);
    }

    drehe(dx: number, dy: number, winkel: number) {
        for (const s of this.segmente) {
            const p1 = { x: s.x1, y: s.y1 }, p2 = { x: s.x2, y: s.y2 };
            Figur.drehePunktUm(p1, dx, dy, winkel);
            Figur.drehePunktUm(p2, dx, dy, winkel);
            s.x1 = p1.x; s.y1 = p1.y; s.x2 = p2.x; s.y2 = p2.y;
        }
        this.grenzenSetzen();
    }

    grenzenSetzen() {
        if (this.segmente.length > 0) {
            this.flinks = 100000; this.frechts = -100000; this.foben = -100000; this.funten = 100000;
        }
        for (const s of this.segmente) {
            if (s.x1 < this.flinks) this.flinks = s.x1;
            if (s.x2 < this.flinks) this.flinks = s.x2;
            if (s.x1 > this.frechts) this.frechts = s.x1;
            if (s.x2 > this.frechts) this.frechts = s.x2;
            if (s.y1 < this.funten) this.funten = s.y1;
            if (s.y2 < this.funten) this.funten = s.y2;
            if (s.y1 > this.foben) this.foben = s.y1;
            if (s.y2 > this.foben) this.foben = s.y2;
        }
    }

    private richtungNormalisieren() {
        if (this.richtung > 360 || this.richtung < 0)
            this.richtung = this.richtung - Math.trunc(Math.trunc(this.richtung) / 360) * 360;
    }

    private syncAttribute() {
        this.turtleX.value = this.x;
        this.turtleY.value = this.y;
        this.kurs.value = this.richtung;
    }

    methodenaufruf(nummer: number, args: any[]): any {
        super.methodenaufruf(nummer, args);
        let result: any = undefined;
        switch (nummer) {
            case 50:
                this.xneu = this.x + Math.cos(this.richtung * ZPId360) * args[0];
                this.yneu = this.y + Math.sin(this.richtung * ZPId360) * args[0];
                this.createSegment(); break;
            case 51:
                this.xneu = this.x - Math.cos(this.richtung * ZPId360) * args[0];
                this.yneu = this.y - Math.sin(this.richtung * ZPId360) * args[0];
                this.createSegment(); break;
            case 52: this.richtung += args[0]; this.richtungNormalisieren(); break;
            case 53: this.richtung -= args[0]; this.richtungNormalisieren(); break;
            case 54: this.penstate = false; break;
            case 55: this.penstate = true; break;
            case 56: this.segmente = []; break;
            case 57: result = this.testPunkte().auf; break;
            case 58: result = this.testPunkte().vor; break;
            case 59: this.xneu = args[0]; this.yneu = args[1]; this.createSegment(); break;
        }
        this.syncAttribute();
        return result;
    }

    testPunkte(): { auf: boolean, vor: boolean } {
        if (!this.punktTest) return { auf: false, vor: false };
        const xvor = this.x + Math.cos(this.richtung * ZPId360);
        const yvor = this.y + Math.sin(this.richtung * ZPId360);
        return { auf: this.punktTest(this, this.x, this.y), vor: this.punktTest(this, xvor, yvor) };
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (!this.sichtbar.value) return;
        for (const s of this.segmente) {
            c.pen.color = s.farbe;
            c.pen.style = s.linienart;
            c.pen.width = s.linienstaerke;
            c.moveTo(c.xW(s.x1), c.yW(s.y1));
            c.lineTo(c.xW(s.x2), c.yW(s.y2));
        }
        if (this.turtlesichtbar.value) {
            const tr = 20, x = this.x, y = this.y, r = this.richtung;
            c.pen.color = 0x0000FF; // clRed (BGR)
            c.pen.style = PS.solid;
            c.pen.width = 2;
            const px = (w: number, f: number) => c.xW(x + f * tr * Math.cos(w * ZPId360));
            const py = (w: number, f: number) => c.yW(y + f * tr * Math.sin(w * ZPId360));
            c.moveTo(px(r, 1), py(r, 1));
            c.lineTo(px(r + 120, 0.5), py(r + 120, 0.5));
            c.lineTo(px(r + 240, 0.5), py(r + 240, 0.5));
            c.lineTo(px(r, 1), py(r, 1));
            c.setPixel(c.xW(x), c.yW(y), 0x0000FF);
        }
    }

    spieglex(achse: number) {
        super.spieglex(achse);
        for (const s of this.segmente) { s.x1 = achse - (s.x1 - achse); s.x2 = achse - (s.x2 - achse); }
        this.x = achse - (this.x - achse);
        this.richtung = -this.richtung; this.richtungNormalisieren();
    }

    spiegley(achse: number) {
        super.spiegley(achse);
        for (const s of this.segmente) { s.y1 = achse - (s.y1 - achse); s.y2 = achse - (s.y2 - achse); }
        this.y = achse - (this.y - achse);
        this.richtung = 180 - this.richtung; this.richtungNormalisieren();
    }

    strecke(faktor: number, vx: number, vy: number) {
        super.strecke(faktor, vx, vy);
        for (const s of this.segmente) {
            if (Math.abs(vx + faktor * (s.x1 - vx)) < 100000) s.x1 = vx + faktor * (s.x1 - vx);
            if (Math.abs(vx + faktor * (s.x2 - vx)) < 100000) s.x2 = vx + faktor * (s.x2 - vx);
            if (Math.abs(vx + faktor * (s.y1 - vy)) < 100000) s.y1 = vy + faktor * (s.y1 - vy);
            if (Math.abs(vx + faktor * (s.y2 - vy)) < 100000) s.y2 = vy + faktor * (s.y2 - vy);
        }
        this.x = vx + faktor * (this.x - vx);
        this.y = vy + faktor * (this.y - vy);
    }

    verschiebe(dx: number, dy: number) {
        super.verschiebe(dx, dy);
        for (const s of this.segmente) { s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy; }
        this.x += dx; this.y += dy;
    }
}

// =====================================================================================
// DREIECK
// =====================================================================================

export class Dreieck extends GefuellteFigur {
    punkte: Punkt[] = [];

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner, true);
        this.ci = CI.DREIECK; this.klassenname = "DREIECK"; this.zeichenbar = true;
        for (const a of [this.links, this.rechts, this.oben, this.unten, this.breite, this.hoehe]) a.hidden = true;
        this.msetzeEcken.hidden = true; this.msetzeLinksOben.hidden = true; this.msetzerechtsunten.hidden = true;
        this.punkte = [{ x: -10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }];
        this.grenzenueberpruefen();
        const m = objMethod("eckenSetzen", this, 101);
        m.addParam("x1", "integer").addParam("y1", "integer").addParam("x2", "integer")
            .addParam("y2", "integer").addParam("x3", "integer").addParam("y3", "integer");
        this.addMethode(m);
        this.addMethode(objMethod("spiegleX", this, 20));
        this.addMethode(objMethod("spiegleY", this, 21));
        this.createSetzeMethoden(inheritedFlag);
    }

    copyfrom(o: EosObjekt) {
        super.copyfrom(o);
        this.punkte = (<Dreieck>o).punkte.map(p => ({ x: p.x, y: p.y }));
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const d = new Dreieck(name, owner);
        d.copyfrom(this);
        return d;
    }

    drehen(winkel: number) {
        let xs = 0, ys = 0;
        for (const p of this.punkte) { xs += p.x; ys += p.y; }
        this.drehe(xs / 3, ys / 3, winkel);
    }

    drehe(dx: number, dy: number, winkel: number) {
        for (const p of this.punkte) Figur.drehePunktUm(p, dx, dy, winkel);
        this.grenzenueberpruefen();
    }

    grenzenueberpruefen() {
        let xmin = 10000, xmax = -10000, ymin = 10000, ymax = -10000;
        for (const p of this.punkte) {
            if (p.x < xmin) xmin = p.x;
            if (p.x > xmax) xmax = p.x;
            if (p.y < ymin) ymin = p.y;
            if (p.y > ymax) ymax = p.y;
        }
        this.flinks = xmin; this.frechts = xmax; this.foben = ymin; this.funten = ymax;
        this.setzeAttributelinksrechtsobenunten();
    }

    methodenaufruf(nummer: number, args: any[]) {
        if (nummer != 45) super.methodenaufruf(nummer, args);
        switch (nummer) {
            case 20: this.spieglex((this.flinks + this.frechts) / 2); break;
            case 21: this.spiegley((this.foben + this.funten) / 2); break;
            case 45: this.drehen(args[0]); break;
            case 101:
                this.punkte = [{ x: args[0], y: args[1] }, { x: args[2], y: args[3] }, { x: args[4], y: args[5] }];
                this.grenzenueberpruefen();
                break;
        }
    }

    paint(c: DrawCanvas) {
        super.paint(c);
        if (this.sichtbar.value) c.polygon(this.punkte.map(p => [c.xW(p.x), c.yW(p.y)]));
    }

    spieglex(achse: number) {
        for (const p of this.punkte) p.x = achse - (p.x - achse);
        this.grenzenueberpruefen();
    }

    spiegley(achse: number) {
        for (const p of this.punkte) p.y = achse - (p.y - achse);
        this.grenzenueberpruefen();
    }

    strecke(faktor: number, vx: number, vy: number) {
        super.strecke(faktor, vx, vy);
        for (const p of this.punkte) {
            if (Math.abs(faktor * (p.x - vx) + vx) < 100000) p.x = faktor * (p.x - vx) + vx;
            if (Math.abs(faktor * (p.y - vy) + vy) < 100000) p.y = faktor * (p.y - vy) + vy;
        }
        this.grenzenueberpruefen();
    }

    verschiebe(dx: number, dy: number) {
        super.verschiebe(dx, dy);
        for (const p of this.punkte) { p.x += dx; p.y += dy; }
        this.grenzenueberpruefen();
    }
}

// =====================================================================================
// FENSTER
// =====================================================================================

export class Fenster extends EosObjekt {
    x: Attribut; y: Attribut; breite: Attribut; hoehe: Attribut; aname: Attribut;
    strichabstand: Attribut; hintergrundfarbe: Attribut; gitterfarbe: Attribut;
    gitterEin = true;
    /** Zeichenliste (ohne Turtles) und Turtles, wie in TDrawCanvas */
    objects: EosObjekt[] = [];
    turtles: Turtle[] = [];
    /** Name der EOS-Variablen (für die Anzeige) */
    variablenname = "";
    /** Zähler, der bei jeder Änderung der Zeichnung erhöht wird */
    version = 0;

    constructor(name: string, owner: EosObjekt | null, inheritedFlag = false) {
        super(name, owner);
        this.ci = CI.FENSTER; this.klassenname = "FENSTER";
        this.objects = []; this.turtles = []; this.gitterEin = true;

        let m = objMethod("verschiebe", this, 1);
        m.addParam("x-Verschiebung", "integer").addParam("y-Verschiebung", "integer");
        this.addMethode(m);
        m = objMethod("zeichne", this, 2);
        m.addParam("Figur", "objekt", CI.FIGUR);
        this.addMethode(m);
        this.addMethode(objMethod("gitterein", this, 80));
        this.addMethode(objMethod("gitteraus", this, 81));

        this.strichabstand = this.addAttribut(new Attribut("strichabstand", this, "integer", 0));
        this.strichabstand.value = 10;
        this.aname = this.addAttribut(new Attribut("name", this, "string", 0));
        this.aname.value = "Fenster";
        this.x = this.addAttribut(new Attribut("links", this, "integer", 0));
        this.y = this.addAttribut(new Attribut("oben", this, "integer", 0));
        this.breite = this.addAttribut(new Attribut("breite", this, "integer", 0));
        this.hoehe = this.addAttribut(new Attribut("höhe", this, "integer", 0));
        this.hintergrundfarbe = this.addAttribut(new Attribut("hintergrundfarbe", this, "objekt", CI.FARBE));
        this.hintergrundfarbe.value = new Farbe("", this);
        (<Farbe>this.hintergrundfarbe.value).setzefarbe(0x808081);
        this.gitterfarbe = this.addAttribut(new Attribut("gitterfarbe", this, "objekt", CI.FARBE));
        this.gitterfarbe.value = new Farbe("", this);
        (<Farbe>this.gitterfarbe.value).setzefarbe(0xC0C0C1);
        this.breite.value = 439; this.hoehe.value = 350;

        this.createSetzeMethoden(inheritedFlag);
    }

    get hintergrund(): number { return (<Farbe>this.hintergrundfarbe.value).color; }
    get gitter(): number { return (<Farbe>this.gitterfarbe.value).color; }

    attributaenderung(a: Attribut | null) {
        if (a == this.aname || a == this.strichabstand || a == this.hintergrundfarbe || a == this.gitterfarbe) {
            if (this.strichabstand.value < 1) this.strichabstand.value = 1;
            this.version++;
            return;
        }
        if (this.x.value < 0) this.x.value = 0;
        if (this.y.value < 0) this.y.value = 0;
        if (this.breite.value < 10) this.breite.value = 10;
        if (this.hoehe.value < 10) this.hoehe.value = 10;
    }

    kopie(name: string, owner: EosObjekt | null): EosObjekt {
        const k = new Fenster(name, owner);
        k.aname.value = this.aname.value;
        k.gitterEin = this.gitterEin;
        k.strichabstand.value = this.strichabstand.value;
        return k;
    }

    copyfrom(o: EosObjekt) {
        const f = <Fenster>o;
        this.aname.value = f.aname.value;
        this.gitterEin = f.gitterEin;
        this.strichabstand.value = f.strichabstand.value;
        (<Farbe>this.hintergrundfarbe.value).copyfrom(f.hintergrundfarbe.value);
        (<Farbe>this.gitterfarbe.value).copyfrom(f.gitterfarbe.value);
        this.version++;
    }

    addObjekt(o: EosObjekt | null) {
        if (!o || !o.zeichenbar) return;
        if (o instanceof Turtle) {
            if (!this.turtles.includes(o)) this.turtles.push(o);
        } else if (!this.objects.includes(o)) this.objects.push(o);
        this.version++;
    }

    removeObjekt(o: EosObjekt) {
        this.objects = this.objects.filter(x => x != o);
        this.turtles = this.turtles.filter(x => x != o);
        this.version++;
    }

    methodenaufruf(nummer: number, args: any[]) {
        switch (nummer) {
            case 1: this.x.value += args[0]; this.y.value += args[1]; break;
            case 2: this.addObjekt(args[0]); break;
            case 80: this.gitterEin = true; break;
            case 81: this.gitterEin = false; break;
        }
        this.version++;
    }
}

// =====================================================================================
// Klassenfabrik
// =====================================================================================

type Ctor = new (name: string, owner: EosObjekt | null, inheritedFlag?: boolean) => EosObjekt;

const KLASSEN: Ctor[] = [Rechteck, Quadrat, Fenster, Ellipse, Kreis, Dreieck, Linie, Textfeld, Turtle, Gruppe, Farbe, Figur, GefuellteFigur];

export class Klassenfabrik {
    klassen: EosObjekt[];

    constructor() {
        this.klassen = KLASSEN.map(K => {
            const o = new K("", null);
            o.name = o.klassenname;
            return o;
        });
    }

    gibtEs(name: string): boolean { return this.getKlasseByName(name) != null; }

    getKlasseByName(name: string): EosObjekt | null {
        const n = name.toLowerCase();
        return this.klassen.find(k => k.klassenname.toLowerCase() == n) || null;
    }

    getKlasse(ci: number): EosObjekt | null {
        return this.klassen.find(k => k.ci == ci) || null;
    }

    erstelleObjekt(klassenname: string, objektname: string): EosObjekt | null {
        const k = this.getKlasseByName(klassenname);
        return k ? k.kopie(objektname, null) : null;
    }
}

let fabrik: Klassenfabrik | null = null;
/** Gemeinsame Klassenfabrik für Syntaxprüfung, Hilfe und Vervollständigung (nur lesen!) */
export function getKlassenfabrik(): Klassenfabrik {
    if (!fabrik) fabrik = new Klassenfabrik();
    return fabrik;
}
