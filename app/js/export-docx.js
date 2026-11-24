// CR de visite au format Word (.docx), aux couleurs NRGYS.
const ExportDocx = (() => {
  const { xml, fmtDate } = U;
  const C = { ultra: '0A1A70', neon: '08D978', vert: '2EB04D', indigo: '0040D1', texte: '3C3C3B', gris: 'BFBFBF', fond: 'EEF0F7', levee: '7A7A7A' };
  const FONT = 'Franklin Gothic Book';
  const FONT_T = 'Franklin Gothic Medium';
  const LARGEUR = 9638; // largeur utile A4 en twips (marges 2 cm)
  const EMU_CM = 360000;

  // ----- Briques WordprocessingML -----
  function run(text, o = {}) {
    const rpr = [
      o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>` : '',
      o.bold ? '<w:b/>' : '',
      o.italic ? '<w:i/>' : '',
      o.caps ? '<w:caps/>' : '',
      o.color ? `<w:color w:val="${o.color}"/>` : '',
      o.size ? `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>` : '',
    ].join('');
    const lines = String(text ?? '').split('\n');
    return lines.map((l, i) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(l)}</w:t></w:r>`).join('');
  }

  function para(content, o = {}) {
    const ppr = [
      o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
      o.keep ? '<w:keepNext/>' : '',
      o.after != null || o.before != null ? `<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 0}"/>` : '',
      o.align ? `<w:jc w:val="${o.align}"/>` : '',
    ].join('');
    // Texte brut → mis en forme ; balises <w:r> déjà construites → reprises telles quelles.
    const runs = Array.isArray(content) ? content.join('')
      : String(content).startsWith('<w:r>') ? content : run(content, o);
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`;
  }

  function cell(content, w, o = {}) {
    const tcpr = [
      `<w:tcW w:w="${w}" w:type="dxa"/>`,
      o.span ? `<w:gridSpan w:val="${o.span}"/>` : '',
      o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '',
      o.noBorder ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : '',
      '<w:vAlign w:val="top"/>',
    ].join('');
    const body = Array.isArray(content) ? content.join('') : para(content, { align: o.align, bold: o.bold, color: o.color, size: o.size });
    return `<w:tc><w:tcPr>${tcpr}</w:tcPr>${body || '<w:p/>'}</w:tc>`;
  }

  function table(widths, rows, o = {}) {
    const borders = o.noBorder ? '' : `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="${C.gris}"/>`).join('')}</w:tblBorders>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/>
      <w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>
      <w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
  }

  const tr = (cells, o = {}) => `<w:tr><w:trPr>${o.header ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;

  function headRow(labels, widths) {
    return tr(labels.map((l, i) => cell(l, widths[i], { fill: C.ultra, bold: true, color: 'FFFFFF', size: 9 })), { header: true });
  }

  function image(rId, n, wcm, hcm) {
    const cx = Math.round(wcm * EMU_CM), cy = Math.round(hcm * EMU_CM);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>
      <wp:docPr id="${n}" name="Image ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>
      <pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
      </pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  function imgSize(w, h, maxW, maxH) {
    const k = Math.min(maxW / w, maxH / h);
    return [w * k, h * k];
  }

  function naturalSize(blob) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { res([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(img.src); };
      img.onerror = () => res([4, 3]);
      img.src = URL.createObjectURL(blob);
    });
  }

  // ----- Document -----
  async function build(data, visite) {
    const { affaire, visitesById } = data;
    const interv = affaire.intervenants || [];
    const medias = [];
    let imgN = 1;
    const addMedia = async (blob) => {
      const id = `rIdImg${medias.length + 1}`;
      medias.push({ id, name: `image${medias.length + 1}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) });
      return id;
    };
    const body = [];
    const h1 = (t) => body.push(para(t, { style: 'Titre1', keep: true }));

    // En-tête : logo + titre
    const logoBlob = await (await fetch('img/logo.jpg')).blob();
    const [lw, lh] = await naturalSize(logoBlob);
    const logoId = await addMedia(logoBlob);
    const [lwc, lhc] = imgSize(lw, lh, 5.5, 2.2);
    body.push(table([3600, LARGEUR - 3600], [tr([
      cell([para([image(logoId, imgN++, lwc, lhc)])], 3600, { noBorder: true }),
      cell([
        para(run('Compte rendu de visite de chantier', { font: FONT_T, size: 18, color: C.ultra }), { align: 'right' }),
        para(run(`N° ${visite.numero} — ${fmtDate(visite.date)}${visite.heure ? ' à ' + visite.heure.replace(':', 'h') : ''}`, { size: 14, color: C.indigo, caps: true }), { align: 'right' }),
      ], LARGEUR - 3600, { noBorder: true }),
    ])], { noBorder: true }));
    body.push(para('', { after: 120 }));

    // Fiche d'identité
    const info = [['Affaire', affaire.nom + (affaire.numero ? ` (${affaire.numero})` : '')], ['Adresse', affaire.adresse], ['Maître d\'ouvrage', affaire.moa],
      ['Rédacteur', `${visite.redacteur || ''} — NRGYS`], ['Conditions', visite.meteo]].filter(([, v]) => v);
    body.push(table([2400, LARGEUR - 2400], info.map(([k, v]) => tr([
      cell(k, 2400, { fill: C.fond, bold: true, color: C.ultra }), cell(v, LARGEUR - 2400),
    ]))));

    // 1. Présences
    h1('1. Présences et diffusion');
    if (interv.length) {
      const w = [2500, 2300, 2238, 1500, 1100];
      body.push(table(w, [headRow(['Société', 'Fonction / lot', 'Représentant', 'Présence', 'Diffusion'], w)].concat(interv.map((i) => tr([
        cell(i.societe, w[0]), cell([i.role, i.lot].filter(Boolean).join(' – '), w[1]), cell(i.nom, w[2]),
        cell(PRESENCE[(visite.presences || {})[i.id] || ''], w[3], { align: 'center' }), cell(visite.diffusion?.[i.id] ? 'X' : '', w[4], { align: 'center' }),
      ])))));
    } else body.push(para('—'));

    // 2. Avancement
    h1('2. Avancement des travaux');
    const avct = interv.filter((i) => { const a = (visite.avancement || {})[i.id]; return a && ((a.pct !== '' && a.pct != null) || a.commentaire); });
    if (avct.length) {
      const w = [3200, 1300, LARGEUR - 4500];
      body.push(table(w, [headRow(['Lot – entreprise', 'Avancement', 'Commentaire'], w)].concat(avct.map((i) => {
        const a = visite.avancement[i.id];
        return tr([cell(Model.labelIntervenant(i), w[0]), cell(a.pct === '' || a.pct == null ? '' : `${a.pct} %`, w[1], { align: 'center' }), cell(a.commentaire, w[2])]);
      }))));
    } else body.push(para('Sans objet.'));

    // 3. Observations
    h1('3. Observations');
    const groupes = Model.groupesCR(data, visite);
    if (groupes.length) {
      const w = [800, 1700, LARGEUR - 800 - 1700 - 1350 - 1100, 1350, 1100];
      const rows = [headRow(['N°', 'Localisation', 'Observation', 'Échéance', 'Statut'], w)];
      for (const g of groupes) {
        rows.push(tr([cell(g.label, LARGEUR, { span: 5, fill: C.fond, bold: true, color: C.ultra })]));
        for (const { obs: o, etat } of g.lignes) {
          const crea = visitesById[o.visiteId];
          const col = etat.code === 'levee' ? C.levee : undefined;
          const desc = [para([
            o.priorite === 'urgente' ? run('URGENT – ', { bold: true, color: 'C62828' }) : '',
            run(o.description, { color: col }),
          ])];
          if (etat.commentaire) desc.push(para(run(`Suivi V${visite.numero} : ${etat.commentaire}`, { italic: true, color: C.indigo })));
          const stColor = { nouvelle: C.indigo, encours: 'C05600', levee: C.vert }[etat.code];
          rows.push(tr([
            cell([para(run(String(o.numero), { bold: true }), { align: 'center' }), para(run(`V${crea.numero}`, { size: 8, color: C.levee }), { align: 'center' })], w[0]),
            cell([o.localisation ? para(run(o.localisation, { color: col })) : '',
              Model.nomPlan(data, o) ? para(run(`Plan : ${Model.nomPlan(data, o)}`, { size: 8, color: C.levee })) : ''], w[1]),
            cell(desc, w[2]),
            cell(fmtDate(o.echeance), w[3], { align: 'center' }),
            cell(Model.STATUTS[etat.code], w[4], { align: 'center', bold: true, color: stColor }),
          ]));
          if (etat.code !== 'levee' && (o.photos || []).length) {
            const figs = [];
            for (const pid of o.photos) {
              const p = await DB.get('photos', pid);
              if (!p) continue;
              const [pw, ph] = p.w && p.h && !(p.shapes || []).length ? [p.w, p.h] : await naturalSize(p.blob);
              const [wc, hc] = imgSize(pw, ph, 7.4, 5.6);
              const rid = await addMedia(p.blob);
              figs.push(para([image(rid, imgN++, wc, hc)], { align: 'center' }) + (p.legende ? para(run(p.legende, { size: 8, italic: true }), { align: 'center' }) : ''));
            }
            // Photos par deux, dans un tableau sans bordure
            const inner = [];
            const half = Math.floor((LARGEUR - w[0]) / 2) - 60;
            for (let i = 0; i < figs.length; i += 2) {
              inner.push(tr([cell([figs[i]], half, { noBorder: true }), cell(figs[i + 1] ? [figs[i + 1]] : [], half, { noBorder: true })]));
            }
            rows.push(tr([cell('', w[0]), cell([table([half, half], inner, { noBorder: true }), '<w:p/>'], LARGEUR - w[0], { span: 4 })]));
          }
        }
      }
      body.push(table(w, rows));
      body.push(para(run('Vn : visite où l\'observation a été émise. Les observations levées n\'apparaîtront plus au prochain CR.', { size: 8, italic: true, color: C.levee }), { before: 60 }));
    } else body.push(para('Aucune observation.'));

    // 4. Plans de repérage (chaque plan sur sa page)
    const plans = await Plans.pourCR(data, visite);
    if (plans.length) {
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      h1('4. Plans de repérage');
      for (const [i, { plan, image: im }] of plans.entries()) {
        const [wc, hc] = imgSize(im.w, im.h, 17, 22);
        const rid = await addMedia(im.blob);
        body.push(para(run(plan.nom, { font: FONT_T, size: 11, color: C.ultra }), { keep: true, before: i ? 240 : 0, after: 60 }));
        body.push(para([image(rid, imgN++, wc, hc)], { align: 'center' }));
      }
      body.push(para(run('Les puces portent le numéro de l\'observation. Bleu : nouvelle ; orange : en cours ; vert : levée.', { size: 8, italic: true, color: C.levee }), { before: 60 }));
    }

    // Remarques
    h1(`${plans.length ? 5 : 4}. Remarques générales`);
    body.push(para(visite.remarques || '—'));
    if (visite.prochaineDate) {
      body.push(para([run('Prochaine visite le ', {}), run(`${fmtDate(visite.prochaineDate)}${visite.prochaineHeure ? ' à ' + visite.prochaineHeure.replace(':', 'h') : ''}`, { bold: true, color: C.ultra }), run('.')], { before: 200 }));
    }
    const mention = await DB.getMeta('mentionCR', '');
    if (mention) body.push(para(run(mention, { size: 9, italic: true }), { before: 240 }));

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${body.join('')}<w:p/>
<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="454" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${para([run(`CR n°${visite.numero} du ${fmtDate(visite.date)} — ${affaire.nom}`, { size: 8, color: C.texte }), '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:tab/></w:r>',
    run('Page ', { size: 8 }), '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>',
    run(' / ', { size: 8 }), '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'],
    { style: 'Pied' })}
${para([run('02 28 01 46 19 • contact', { bold: true, color: C.ultra, size: 8 }), run('@', { bold: true, color: C.neon, size: 8 }), run('nrgys.fr • nrgys.fr', { bold: true, color: C.ultra, size: 8 })], { align: 'center', before: 80 })}
${para(run('NRGYS – 5 avenue des améthystes CS 73864 – 44338 NANTES CEDEX 3', { size: 7, color: C.texte }), { align: 'center' })}
${para(run('SAS au capital de 55 600 € • SIRET 487 481 574 00043 RCS Nantes • Code APE 7112B • TVA Intracommunautaire FR81 487 481 574', { size: 7, color: C.texte }), { align: 'center' })}
</w:ftr>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:color w:val="${C.texte}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${C.vert}"/></w:pBdr><w:spacing w:before="320" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:rFonts w:ascii="${FONT_T}" w:hAnsi="${FONT_T}" w:cs="${FONT_T}"/><w:color w:val="${C.ultra}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Pied"><w:name w:val="Pied CR"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="${LARGEUR}"/></w:tabs><w:spacing w:after="0"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xml(`CR de visite n°${visite.numero} — ${affaire.nom}`)}</dc:title><dc:creator>${xml(visite.redacteur || 'NRGYS')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'word/document.xml', data: document },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/footer1.xml', data: footer },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
${medias.map((m) => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('\n')}
</Relationships>` },
      ...medias.map((m) => ({ name: 'word/media/' + m.name, data: m.data })),
    ];
    return Zip.build(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  return { build };
})();
