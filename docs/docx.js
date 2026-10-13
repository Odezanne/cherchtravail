"use strict";
/* Création de fichiers Word (.docx) directement dans le navigateur, sans bibliothèque externe.
   Un .docx est une archive zip de quelques fichiers XML : on l'assemble ici (zip sans compression). */

const Docx = (() => {
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(octets) {
    let c = 0xffffffff;
    for (let i = 0; i < octets.length; i++) c = CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(fichiers) {
    const enc = new TextEncoder(); const morceaux = []; const central = []; let pos = 0;
    const d = new Date();
    const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const [nom, contenu] of fichiers) {
      const n = enc.encode(nom); const data = typeof contenu === "string" ? enc.encode(contenu) : contenu;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, heure, true); h.setUint16(12, jour, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, heure, true); c.setUint16(14, jour, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true);
      c.setUint32(42, pos, true);
      morceaux.push(new Uint8Array(h.buffer), n, data);
      central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + data.length;
    }
    const tailleCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, pos, true);
    return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)],
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

  /* Paragraphe : texte (les \n deviennent des retours à la ligne), options gras, taille (pt), alignement, espace après (pt). */
  function p(texte, o = {}) {
    const rpr = `<w:rPr>${o.gras ? "<w:b/>" : ""}${o.italique ? "<w:i/>" : ""}${o.couleur ? `<w:color w:val="${o.couleur}"/>` : ""}${o.taille ? `<w:sz w:val="${o.taille * 2}"/><w:szCs w:val="${o.taille * 2}"/>` : ""}</w:rPr>`;
    const lignes = String(texte ?? "").split("\n");
    const runs = lignes.map((l, i) => `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(l)}</w:t></w:r>`).join("");
    return `<w:p><w:pPr>${o.garder ? "<w:keepNext/>" : ""}<w:spacing w:before="${(o.avant || 0) * 20}" w:after="${(o.apres ?? 8) * 20}"/>${o.align ? `<w:jc w:val="${o.align}"/>` : ""}</w:pPr>${runs}</w:p>`;
  }

  /* Tableau : colonnes [{titre, largeur (cm)}], lignes [[texte…]] */
  function tableau(colonnes, lignes, o = {}) {
    const tw = (cm) => Math.round(cm * 567);
    const bord = `<w:top w:val="single" w:sz="4" w:color="BFB8A8"/><w:left w:val="single" w:sz="4" w:color="BFB8A8"/><w:bottom w:val="single" w:sz="4" w:color="BFB8A8"/><w:right w:val="single" w:sz="4" w:color="BFB8A8"/><w:insideH w:val="single" w:sz="4" w:color="BFB8A8"/><w:insideV w:val="single" w:sz="4" w:color="BFB8A8"/>`;
    const cellule = (t, i, entete) => `<w:tc><w:tcPr><w:tcW w:w="${tw(colonnes[i].largeur)}" w:type="dxa"/>${entete ? '<w:shd w:val="clear" w:color="auto" w:fill="E3EFE7"/>' : ""}</w:tcPr>${p(t, { gras: entete, taille: o.taille || 9, apres: 0 })}</w:tc>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bord}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${colonnes.map((c) => `<w:gridCol w:w="${tw(c.largeur)}"/>`).join("")}</w:tblGrid>`
      + `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${colonnes.map((c, i) => cellule(c.titre, i, true)).join("")}</w:tr>`
      + lignes.map((l) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((t, i) => cellule(t, i, false)).join("")}</w:tr>`).join("")
      + `</w:tbl>`;
  }

  /* Assemble le document. corps = chaîne XML (p() et tableau() concaténés). */
  function document(corps, o = {}) {
    const paysage = o.paysage;
    const sect = `<w:sectPr><w:pgSz w:w="${paysage ? 16838 : 11906}" w:h="${paysage ? 11906 : 16838}"${paysage ? ' w:orient="landscape"' : ""}/>`
      + `<w:pgMar w:top="${o.marge || 1134}" w:right="${o.marge || 1134}" w:bottom="${o.marge || 1134}" w:left="${o.marge || 1134}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const taille = (o.taille || 11) * 2;
    return zip([
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(o.titre || "")}</dc:title><dc:creator>${x(o.auteur || "")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
      ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="${taille}"/><w:szCs w:val="${taille}"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`],
      ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corps}${sect}</w:body></w:document>`],
    ]);
  }

  function telecharger(blob, nom) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(window.document.createElement("a"), { href: url, download: nom });
    window.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  return { p, tableau, document, telecharger };
})();
