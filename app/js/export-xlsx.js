// Exports Excel (.xlsx) : observations d'une visite, registre complet d'une affaire.
const ExportXlsx = (() => {
  const { xml, fmtDate } = U;

  function colName(n) {
    let s = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function sheetXml(headers, rows, widths) {
    const cellXml = (v, r, c, style) => {
      const ref = colName(c) + (r + 1);
      if (typeof v === 'number') return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    };
    const all = [headers, ...rows];
    const data = all.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(v ?? '', r, c, r === 0 ? 1 : 2)).join('')}</row>`).join('');
    const last = colName(headers.length - 1) + all.length;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${data}</sheetData>
<autoFilter ref="A1:${last}"/>
</worksheet>`;
  }

  function workbook(sheetName, headers, rows, widths) {
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><color rgb="FF3C3C3B"/><name val="Franklin Gothic Book"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Franklin Gothic Medium"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A1A70"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheetName.slice(0, 31))}'!$A$1:$${colName(headers.length - 1)}$${rows.length + 1}</definedName></definedNames>
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { name: 'xl/styles.xml', data: styles },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml(headers, rows, widths) },
    ];
    return Zip.build(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function base(o, data) {
    const i = Model.intervenant(data.affaire, o.intervenantId);
    return [o.numero, i?.lot || '', i?.societe || (i ? '' : 'Généralités'), o.localisation, o.description, o.priorite === 'urgente' ? 'Urgent' : '', fmtDate(o.echeance)];
  }

  // Observations figurant au CR d'une visite, avec leur statut à cette visite.
  async function visite(data, v) {
    const rows = [];
    for (const g of Model.groupesCR(data, v)) {
      for (const { obs: o, etat } of g.lignes) {
        rows.push([...base(o, data), `V${data.visitesById[o.visiteId].numero}`, Model.STATUTS[etat.code], etat.commentaire, (o.photos || []).length]);
      }
    }
    return workbook(`Visite ${v.numero}`,
      ['N°', 'Lot', 'Entreprise', 'Localisation', 'Observation', 'Priorité', 'Échéance', 'Émise', 'Statut', 'Commentaire de suivi', 'Photos'],
      rows, [6, 12, 22, 20, 60, 9, 11, 8, 10, 40, 8]);
  }

  // Toutes les observations d'une affaire, avec leur situation actuelle.
  async function registre(data) {
    const rows = data.observations.map((o) => {
      const crea = data.visitesById[o.visiteId];
      const g = Model.etatGlobal(o, data.visitesById);
      return [...base(o, data), crea ? `V${crea.numero} – ${fmtDate(crea.date)}` : '',
        g.levee ? 'Levée' : 'En cours', g.levee ? `V${g.levee.numero} – ${fmtDate(g.levee.date)}` : '', g.dernierCommentaire, (o.photos || []).length];
    });
    return workbook('Registre',
      ['N°', 'Lot', 'Entreprise', 'Localisation', 'Observation', 'Priorité', 'Échéance', 'Émise', 'Statut', 'Levée', 'Dernier commentaire', 'Photos'],
      rows, [6, 12, 22, 20, 60, 9, 11, 16, 10, 16, 40, 8]);
  }

  return { visite, registre };
})();
