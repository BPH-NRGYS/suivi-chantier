// CR de visite en PDF : mise en page HTML puis impression « Enregistrer au format PDF ».
const ExportPDF = (() => {
  const { esc, fmtDate } = U;

  async function html(data, visite) {
    const { affaire } = data;
    const interv = affaire.intervenants || [];
    const urls = [];
    const u = (blob) => { const x = URL.createObjectURL(blob); urls.push(x); return x; };
    const mention = await DB.getMeta('mentionCR', '');

    const pres = interv.map((i) => `<tr>
      <td>${esc(i.societe)}</td><td>${esc([i.role, i.lot].filter(Boolean).join(' – '))}</td><td>${esc(i.nom)}</td>
      <td class="c">${esc(PRESENCE[(visite.presences || {})[i.id] || ''])}</td><td class="c">${visite.diffusion?.[i.id] ? '✓' : ''}</td></tr>`).join('');

    const avct = interv.filter((i) => {
      const a = (visite.avancement || {})[i.id];
      return a && ((a.pct !== '' && a.pct != null) || a.commentaire);
    }).map((i) => {
      const a = visite.avancement[i.id];
      return `<tr><td>${esc(Model.labelIntervenant(i))}</td><td class="c">${a.pct === '' || a.pct == null ? '' : a.pct + ' %'}</td><td>${esc(a.commentaire)}</td></tr>`;
    }).join('');

    let obs = '';
    for (const g of Model.groupesCR(data, visite)) {
      obs += `<tr class="grp"><td colspan="5">${esc(g.label)}</td></tr>`;
      for (const { obs: o, etat } of g.lignes) {
        const crea = data.visitesById[o.visiteId];
        obs += `<tr class="${etat.code === 'levee' ? 'levee' : ''}">
          <td class="c"><strong>${o.numero}</strong><div class="small">V${crea.numero}</div></td>
          <td>${esc(o.localisation)}</td>
          <td>${o.priorite === 'urgente' ? '<strong class="urg">URGENT – </strong>' : ''}${esc(o.description).replace(/\n/g, '<br>')}
            ${etat.commentaire ? `<div class="suivi">Suivi V${visite.numero} : ${esc(etat.commentaire).replace(/\n/g, '<br>')}</div>` : ''}</td>
          <td class="c">${fmtDate(o.echeance)}</td>
          <td class="c st-${etat.code}">${Model.STATUTS[etat.code]}</td></tr>`;
        const photos = [];
        for (const pid of o.photos || []) {
          const p = await DB.get('photos', pid);
          if (p) photos.push(`<figure><img src="${u(p.blob)}">${p.legende ? `<figcaption>${esc(p.legende)}</figcaption>` : ''}</figure>`);
        }
        if (photos.length && etat.code !== 'levee') obs += `<tr class="ph"><td></td><td colspan="4"><div class="figs">${photos.join('')}</div></td></tr>`;
      }
    }

    const prochaine = visite.prochaineDate
      ? `Prochaine visite le <strong>${fmtDate(visite.prochaineDate)}${visite.prochaineHeure ? ' à ' + visite.prochaineHeure.replace(':', 'h') : ''}</strong>.` : '';

    const out = `
      <div class="cr">
        <table class="cr-head"><tr>
          <td><img class="cr-logo" src="img/logo.jpg"></td>
          <td class="r"><div class="cr-title">Compte rendu de visite de chantier</div>
            <div class="cr-sub">N° ${visite.numero} — ${fmtDate(visite.date)}${visite.heure ? ' à ' + visite.heure.replace(':', 'h') : ''}</div></td>
        </tr></table>
        <table class="info">
          <tr><th>Affaire</th><td>${esc(affaire.nom)}${affaire.numero ? ` <span class="small">(${esc(affaire.numero)})</span>` : ''}</td></tr>
          ${affaire.adresse ? `<tr><th>Adresse</th><td>${esc(affaire.adresse)}</td></tr>` : ''}
          ${affaire.moa ? `<tr><th>Maître d'ouvrage</th><td>${esc(affaire.moa)}</td></tr>` : ''}
          <tr><th>Rédacteur</th><td>${esc(visite.redacteur)} — NRGYS</td></tr>
          ${visite.meteo ? `<tr><th>Conditions</th><td>${esc(visite.meteo)}</td></tr>` : ''}
        </table>

        <h1>1. Présences et diffusion</h1>
        ${pres ? `<table class="t"><thead><tr><th>Société</th><th>Fonction / lot</th><th>Représentant</th><th>Présence</th><th>Diffusion</th></tr></thead><tbody>${pres}</tbody></table>` : '<p>—</p>'}

        <h1>2. Avancement des travaux</h1>
        ${avct ? `<table class="t"><thead><tr><th style="width:32%">Lot – entreprise</th><th style="width:12%">Avancement</th><th>Commentaire</th></tr></thead><tbody>${avct}</tbody></table>` : '<p>Sans objet.</p>'}

        <h1>3. Observations</h1>
        ${obs ? `<table class="t tobs"><thead><tr><th style="width:7%">N°</th><th style="width:17%">Localisation</th><th>Observation</th><th style="width:11%">Échéance</th><th style="width:10%">Statut</th></tr></thead><tbody>${obs}</tbody></table>
          <p class="small">V<em>n</em> : visite où l'observation a été émise. Les observations levées n'apparaîtront plus au prochain CR.</p>` : '<p>Aucune observation.</p>'}

        <h1>4. Remarques générales</h1>
        <p>${esc(visite.remarques).replace(/\n/g, '<br>') || '—'}</p>
        ${prochaine ? `<p class="next">${prochaine}</p>` : ''}
        ${mention ? `<p class="mention">${esc(mention).replace(/\n/g, '<br>')}</p>` : ''}
      </div>`;
    return { out, urls };
  }

  async function print(data, visite) {
    const root = document.getElementById('print-root');
    const { out, urls } = await html(data, visite);
    root.innerHTML = out;
    await Promise.all(Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
    const titre = document.title;
    document.title = `${U.dateCompact(visite.date)}_CR${String(visite.numero).padStart(2, '0')}_${U.slug(data.affaire.nom)}`;
    document.body.classList.add('printing');
    const done = () => {
      document.title = titre;
      document.body.classList.remove('printing');
      root.innerHTML = '';
      urls.forEach((x) => URL.revokeObjectURL(x));
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 100);
  }

  return { print, html };
})();
