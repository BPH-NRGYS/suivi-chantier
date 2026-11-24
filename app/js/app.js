// Interface : affaires, visites, observations, exports.
(() => {
  const { $, $$, esc, fmtDate } = U;
  const app = $('#app');
  let objectUrls = []; // URL des photos affichées à l'écran courant
  let nextUrls = [];   // URL créées pour l'écran en préparation
  let pendingCleanup = null; // observation vide à supprimer en quittant sa fiche

  // ---------- Outils d'affichage ----------
  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), ms);
  }

  function url(blob) {
    const u = URL.createObjectURL(blob);
    nextUrls.push(u);
    return u;
  }

  function mount(html, title, backTo) {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls = nextUrls;
    nextUrls = [];
    $('#topbar-title').textContent = title;
    const back = $('#btn-back');
    back.hidden = !backTo;
    back.onclick = () => (location.hash = backTo);
    app.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'view';
    root.innerHTML = html;
    app.appendChild(root);
    window.scrollTo(0, 0);
    return root;
  }

  function setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  }
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  // Enregistre automatiquement chaque champ [data-f] dans l'objet puis en base.
  function bindForm(root, obj, store, after) {
    let timer = null;
    const save = async (el) => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.type === 'range') v = el.value === '' ? '' : Number(el.value);
      setPath(obj, el.dataset.f, v);
      await DB.put(store, obj);
      after && after(el);
    };
    root.addEventListener('change', (e) => { if (e.target.dataset.f) { clearTimeout(timer); save(e.target); } });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.dataset.f) return;
      if (el.type === 'range') { const out = root.querySelector(`[data-out="${el.dataset.f}"]`); if (out) out.textContent = el.value + ' %'; }
      clearTimeout(timer);
      timer = setTimeout(() => save(el), 600);
    });
  }

  function field(label, f, value, opts = {}) {
    const { type = 'text', rows, list, placeholder = '', cls = '' } = opts;
    const ph = placeholder ? ` placeholder="${esc(placeholder)}"` : '';
    const input = rows
      ? `<textarea data-f="${f}" rows="${rows}"${ph}>${esc(value)}</textarea>`
      : `<input type="${type}" data-f="${f}" value="${esc(value)}"${ph}${list ? ` list="${list}"` : ''}>`;
    return `<label class="field ${cls}"><span>${esc(label)}</span>${input}</label>`;
  }

  function badge(code) {
    return `<span class="badge b-${code}">${Model.STATUTS[code]}</span>`;
  }

  // ---------- Accueil : liste des affaires ----------
  async function viewHome() {
    const affaires = (await DB.all('affaires')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const cards = [];
    for (const a of affaires) {
      const d = await Model.loadAffaire(a.id);
      const enCours = d.observations.filter((o) => !Model.etatGlobal(o, d.visitesById).levee).length;
      const last = d.visites[d.visites.length - 1];
      cards.push(`
        <a class="card" href="#/affaire/${a.id}">
          <h3>${esc(a.nom || 'Sans nom')}</h3>
          <div class="muted">${esc([a.numero, a.adresse].filter(Boolean).join(' · '))}</div>
          <div class="meta">${d.visites.length} visite(s) · ${enCours} observation(s) en cours${last ? ' · dernière visite le ' + fmtDate(last.date) : ''}</div>
        </a>`);
    }
    const lastBackup = await DB.getMeta('lastBackup', null);
    const ageJours = lastBackup ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000) : null;
    const alerte = affaires.length && (ageJours === null || ageJours >= 7);

    const root = mount(`
      <div class="actions"><button class="primary big" data-act="new">+ Nouvelle affaire</button></div>
      ${alerte ? `<div class="warn">Les données ne sont que sur cette tablette. ${ageJours === null ? 'Aucune sauvegarde faite.' : `Dernière sauvegarde il y a ${ageJours} jours.`} Pensez à sauvegarder.</div>` : ''}
      <div class="cards">${cards.join('') || '<p class="empty">Aucune affaire. Créez-en une pour commencer.</p>'}</div>
      <div class="section">
        <h2>Sauvegarde</h2>
        <p class="muted">Sauvegarde complète (affaires, visites, photos) dans un fichier à ranger sur OneDrive.
        ${lastBackup ? `Dernière sauvegarde : ${fmtDate(lastBackup)}.` : ''}</p>
        <div class="actions">
          <button data-act="backup">Sauvegarder</button>
          <label class="btn">Restaurer un fichier<input type="file" accept=".json,application/json" data-act="restore" hidden></label>
          <a class="btn" href="#/reglages">Réglages</a>
        </div>
      </div>`, 'Suivi de chantier', null);

    root.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'new') {
        const a = { id: U.uid(), nom: '', numero: '', adresse: '', moa: '', intervenants: [], createdAt: new Date().toISOString() };
        await DB.put('affaires', a);
        location.hash = '#/affaire/' + a.id;
      }
      if (act === 'backup') {
        toast('Préparation de la sauvegarde…');
        const { blob, name } = await Backup.exportAll();
        await U.share(blob, name, 'Sauvegarde suivi de chantier');
        await DB.setMeta('lastBackup', new Date().toISOString());
        viewHome();
      }
    });
    root.addEventListener('change', async (e) => {
      if (e.target.dataset.act === 'restore' && e.target.files[0]) {
        if (!confirm('Restaurer ce fichier ? Les éléments de la sauvegarde remplaceront ceux de même identifiant sur la tablette ; les autres sont conservés.')) return;
        try {
          const n = await Backup.importFile(e.target.files[0]);
          toast(`Restauration terminée : ${n.affaires} affaire(s), ${n.photos} photo(s).`, 4000);
          viewHome();
        } catch (err) {
          alert('Fichier illisible : ' + err.message);
        }
      }
    });
  }

  // ---------- Réglages ----------
  async function viewReglages() {
    const redacteur = await DB.getMeta('redacteur', '');
    const mention = await DB.getMeta('mentionCR', '');
    let usage = '';
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      usage = `Espace utilisé : ${(e.usage / 1048576).toFixed(1)} Mo sur ${(e.quota / 1048576 / 1024).toFixed(1)} Go disponibles.`;
    }
    const root = mount(`
      <div class="section">
        <h2>Réglages</h2>
        <label class="field"><span>Rédacteur par défaut des CR</span><input data-meta="redacteur" value="${esc(redacteur)}" placeholder="Prénom NOM"></label>
        <label class="field"><span>Mention en fin de CR</span><textarea data-meta="mentionCR" rows="4" placeholder="Texte ajouté à la fin de chaque CR (facultatif)">${esc(mention)}</textarea></label>
        <p class="muted">${usage}</p>
        <p class="muted">Version de l'application : 0.1 (prototype)</p>
      </div>`, 'Réglages', '#/');
    root.addEventListener('change', async (e) => {
      if (e.target.dataset.meta) { await DB.setMeta(e.target.dataset.meta, e.target.value); toast('Enregistré'); }
    });
  }

  // ---------- Affaire ----------
  async function viewAffaire(id) {
    const data = await Model.loadAffaire(id);
    if (!data) return (location.hash = '#/');
    const { affaire, visites, observations, visitesById } = data;
    affaire.intervenants = affaire.intervenants || [];

    const rows = affaire.intervenants.map((i, n) => `
      <div class="interv" data-i="${n}">
        <select data-k="role">${ROLES.map((r) => `<option ${r === i.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <input data-k="lot" value="${esc(i.lot)}" placeholder="Lot (ex. CVC)">
        <input data-k="societe" value="${esc(i.societe)}" placeholder="Société">
        <input data-k="nom" value="${esc(i.nom)}" placeholder="Représentant">
        <input data-k="email" type="email" value="${esc(i.email)}" placeholder="E-mail">
        <input data-k="tel" type="tel" value="${esc(i.tel)}" placeholder="Téléphone">
        <div class="interv-btns">
          <button data-act="up" title="Monter" ${n === 0 ? 'disabled' : ''}>↑</button>
          <button data-act="del-int" class="danger-text" title="Supprimer">✕</button>
        </div>
      </div>`).join('');

    const vis = visites.slice().reverse().map((v) => {
      const nouv = observations.filter((o) => o.visiteId === v.id).length;
      const ouvertes = observations.filter((o) => Model.etat(o, v, visitesById)?.code !== 'levee' && Model.etat(o, v, visitesById)).length;
      return `<a class="card" href="#/visite/${v.id}">
        <h3>Visite n°${v.numero} — ${fmtDate(v.date)}</h3>
        <div class="meta">${nouv} nouvelle(s) observation(s) · ${ouvertes} non levée(s) à l'issue</div></a>`;
    }).join('');

    const root = mount(`
      <div class="section">
        <h2>Affaire</h2>
        <div class="grid2">
          ${field('Nom de l\'affaire', 'nom', affaire.nom, { placeholder: 'Ex. Restructuration groupe scolaire…' })}
          ${field('N° d\'affaire NRGYS', 'numero', affaire.numero)}
          ${field('Adresse du chantier', 'adresse', affaire.adresse)}
          ${field('Maître d\'ouvrage', 'moa', affaire.moa)}
        </div>
      </div>
      <div class="section">
        <h2>Visites</h2>
        <div class="actions"><button class="primary big" data-act="new-visite">+ Nouvelle visite</button></div>
        <div class="cards">${vis || '<p class="empty">Aucune visite.</p>'}</div>
      </div>
      <div class="section">
        <h2>Intervenants</h2>
        <p class="muted">L'ordre de cette liste donne l'ordre des lots dans les CR.</p>
        <div class="interv-list">${rows || '<p class="empty">Aucun intervenant.</p>'}</div>
        <div class="actions"><button data-act="add-int">+ Ajouter un intervenant</button></div>
      </div>
      <div class="section">
        <h2>Exports</h2>
        <div class="actions">
          <button data-act="registre">Registre des observations (Excel)</button>
        </div>
      </div>
      <div class="section">
        <div class="actions"><button class="danger" data-act="del-affaire">Supprimer l'affaire</button></div>
      </div>`, affaire.nom || 'Nouvelle affaire', '#/');

    bindForm(root, affaire, 'affaires', (el) => { if (el.dataset.f === 'nom') $('#topbar-title').textContent = el.value; });

    root.addEventListener('change', async (e) => {
      const row = e.target.closest('.interv');
      if (!row || !e.target.dataset.k) return;
      affaire.intervenants[row.dataset.i][e.target.dataset.k] = e.target.value;
      await DB.put('affaires', affaire);
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const row = btn.closest('.interv');
      if (act === 'add-int') {
        affaire.intervenants.push({ id: U.uid(), role: 'Entreprise', lot: '', societe: '', nom: '', email: '', tel: '' });
        await DB.put('affaires', affaire);
        await viewAffaire(id);
        const last = $$('.interv', app).pop();
        last && last.querySelector('[data-k="lot"]').focus();
      }
      if (act === 'del-int') {
        const i = affaire.intervenants[row.dataset.i];
        const used = observations.some((o) => o.intervenantId === i.id);
        if (used) return alert('Cet intervenant a des observations : réaffectez-les avant de le supprimer.');
        if (!confirm(`Supprimer ${Model.labelIntervenant(i)} ?`)) return;
        affaire.intervenants.splice(row.dataset.i, 1);
        await DB.put('affaires', affaire);
        viewAffaire(id);
      }
      if (act === 'up') {
        const n = Number(row.dataset.i);
        [affaire.intervenants[n - 1], affaire.intervenants[n]] = [affaire.intervenants[n], affaire.intervenants[n - 1]];
        await DB.put('affaires', affaire);
        viewAffaire(id);
      }
      if (act === 'new-visite') {
        const v = await Model.nouvelleVisite(data);
        location.hash = '#/visite/' + v.id;
      }
      if (act === 'registre') {
        const blob = await ExportXlsx.registre(data);
        await U.share(blob, `${U.dateCompact()}_Registre_observations_${U.slug(affaire.nom)}.xlsx`, 'Registre des observations');
      }
      if (act === 'del-affaire') {
        if (!confirm(`Supprimer définitivement l'affaire « ${affaire.nom} », ses visites, observations et photos ?`)) return;
        if (!confirm('Confirmez : cette suppression est irréversible (sauf sauvegarde).')) return;
        await Model.supprimerAffaire(id);
        location.hash = '#/';
      }
    });
  }

  // ---------- Visite ----------
  const TABS = [['general', 'Général'], ['presences', 'Présences'], ['avancement', 'Avancement'], ['obs', 'Observations'], ['cr', 'CR / Exports']];

  async function viewVisite(id) {
    const visite = await DB.get('visites', id);
    if (!visite) return (location.hash = '#/');
    const data = await Model.loadAffaire(visite.affaireId);
    const { affaire, observations, visitesById } = data;
    const tab = sessionStorage.getItem('tab-' + id) || 'obs';
    const filtre = sessionStorage.getItem('filtre') || 'tous';
    const interv = affaire.intervenants || [];

    const lignes = observations.map((o) => ({ o, etat: Model.etat(o, visite, visitesById) })).filter((l) => l.etat);
    const nbNonLevees = lignes.filter((l) => l.etat.code !== 'levee').length;

    let body = '';
    if (tab === 'general') {
      body = `
        <div class="grid2">
          ${field('Date de la visite', 'date', visite.date, { type: 'date' })}
          ${field('Heure', 'heure', visite.heure, { type: 'time' })}
          ${field('Rédacteur', 'redacteur', visite.redacteur)}
          ${field('Météo / conditions', 'meteo', visite.meteo)}
        </div>
        ${field('Remarques générales', 'remarques', visite.remarques, { rows: 6, placeholder: 'Planning, sécurité, points administratifs…' })}
        <div class="grid2">
          ${field('Prochaine visite — date', 'prochaineDate', visite.prochaineDate, { type: 'date' })}
          ${field('Prochaine visite — heure', 'prochaineHeure', visite.prochaineHeure, { type: 'time' })}
        </div>
        ${data.visites[data.visites.length - 1].id === visite.id ? '<div class="actions"><button class="danger" data-act="del-visite">Supprimer cette visite</button></div>' : ''}`;
    } else if (tab === 'presences') {
      body = interv.length ? `<div class="pres-list">${interv.map((i) => {
        const p = (visite.presences || {})[i.id] || '';
        return `<div class="pres" data-id="${i.id}">
          <div class="pres-who"><strong>${esc(i.societe || '(société ?)')}</strong><span class="muted">${esc([i.role, i.lot, i.nom].filter(Boolean).join(' · '))}</span></div>
          <div class="seg">${['P', 'A', 'E'].map((c) => `<button data-pres="${c}" class="${p === c ? 'on' : ''}">${PRESENCE[c]}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" data-f="diffusion.${i.id}" ${visite.diffusion?.[i.id] ? 'checked' : ''}> Diffusion</label>
        </div>`;
      }).join('')}</div>` : `<p class="empty">Aucun intervenant. <a href="#/affaire/${affaire.id}">Ajoutez-les sur la fiche affaire.</a></p>`;
    } else if (tab === 'avancement') {
      const ents = interv.filter((i) => i.role === 'Entreprise');
      body = ents.length ? ents.map((i) => {
        const a = (visite.avancement || {})[i.id] || {};
        const pct = a.pct ?? '';
        return `<div class="avct">
          <div class="avct-head"><strong>${esc(Model.labelIntervenant(i))}</strong>
            <span class="pct" data-out="avancement.${i.id}.pct">${pct === '' ? '—' : pct + ' %'}</span></div>
          <input type="range" min="0" max="100" step="5" value="${pct === '' ? 0 : pct}" data-f="avancement.${i.id}.pct">
          <textarea rows="2" data-f="avancement.${i.id}.commentaire" placeholder="Travaux en cours, effectif, retard…">${esc(a.commentaire)}</textarea>
        </div>`;
      }).join('') : `<p class="empty">Aucune entreprise. <a href="#/affaire/${affaire.id}">Ajoutez-les sur la fiche affaire.</a></p>`;
    } else if (tab === 'obs') {
      const filt = lignes.filter((l) => filtre === 'tous' || (filtre === 'ouvertes' ? l.etat.code !== 'levee' : l.etat.code === filtre));
      const groupes = Model.groupesCR(data, visite)
        .map((g) => ({ ...g, lignes: g.lignes.filter((l) => filt.some((f) => f.o.id === l.obs.id)) }))
        .filter((g) => g.lignes.length);
      const cards = [];
      for (const g of groupes) {
        cards.push(`<h3 class="group">${esc(g.label)}</h3>`);
        for (const { obs: o, etat } of g.lignes) {
          const thumbs = [];
          for (const pid of (o.photos || []).slice(0, 4)) {
            const p = await DB.get('photos', pid);
            if (p) thumbs.push(`<img src="${url(p.blob)}" alt="">`);
          }
          cards.push(`<div class="obs ${etat.code === 'levee' ? 'is-levee' : ''}" data-id="${o.id}">
            <a class="obs-main" href="#/obs/${o.id}/${visite.id}">
              <div class="obs-head"><span class="num">${o.numero}</span>${badge(etat.code)}${o.priorite === 'urgente' ? '<span class="badge b-urgent">Urgent</span>' : ''}
                <span class="muted">${esc(o.localisation)}</span>${o.echeance ? `<span class="muted">· échéance ${fmtDate(o.echeance)}</span>` : ''}</div>
              <div class="obs-desc">${esc(o.description) || '<em class="muted">(sans description)</em>'}</div>
              ${etat.commentaire ? `<div class="obs-suivi">Suivi : ${esc(etat.commentaire)}</div>` : ''}
              ${thumbs.length ? `<div class="thumbs">${thumbs.join('')}</div>` : ''}
            </a>
            <button class="lever ${etat.code === 'levee' ? 'on' : ''}" data-act="lever">${etat.code === 'levee' ? '✓ Levée' : 'Lever'}</button>
          </div>`);
        }
      }
      const f = (k, l, n) => `<button data-filtre="${k}" class="${filtre === k ? 'on' : ''}">${l} (${n})</button>`;
      body = `
        <div class="obs-toolbar">
          <div class="seg">${f('tous', 'Toutes', lignes.length)}${f('ouvertes', 'Non levées', nbNonLevees)}${f('nouvelle', 'Nouvelles', lignes.filter((l) => l.etat.code === 'nouvelle').length)}${f('levee', 'Levées', lignes.filter((l) => l.etat.code === 'levee').length)}</div>
        </div>
        <div class="obs-list">${cards.join('') || '<p class="empty">Aucune observation.</p>'}</div>
        <button class="fab" data-act="new-obs">+ Observation</button>`;
    } else if (tab === 'cr') {
      const share = U.canShareFiles();
      body = `
        <p class="muted">Le CR reprend les présences, l'avancement, les observations nouvelles, en cours et levées lors de cette visite, et les remarques générales.</p>
        <div class="export-list">
          <button class="big" data-act="pdf">CR en PDF</button>
          <p class="muted">Ouvre l'aperçu d'impression : choisissez « Enregistrer au format PDF ».</p>
          <button class="big" data-act="docx">CR en Word (.docx)</button>
          <p class="muted">Pour retravailler le CR sur PC avant diffusion.</p>
          <button class="big" data-act="xlsx">Observations de la visite (Excel)</button>
        </div>
        ${share ? '<p class="muted">Les fichiers Word et Excel s\'ouvrent dans le menu de partage (Outlook, OneDrive, Teams…).</p>' : ''}`;
    }

    const root = mount(`
      <div class="visite-head">
        <div><strong>${esc(affaire.nom)}</strong> — Visite n°${visite.numero} du ${fmtDate(visite.date)}</div>
        <div class="muted">${nbNonLevees} observation(s) non levée(s)</div>
      </div>
      <nav class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="section tab-body">${body}</div>`, `Visite n°${visite.numero}`, '#/affaire/' + affaire.id);

    bindForm(root, visite, 'visites');

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tab) { sessionStorage.setItem('tab-' + id, t.dataset.tab); return viewVisite(id); }
      if (t.dataset.filtre) { sessionStorage.setItem('filtre', t.dataset.filtre); return viewVisite(id); }
      if (t.dataset.pres) {
        const pid = t.closest('.pres').dataset.id;
        visite.presences = visite.presences || {};
        visite.presences[pid] = visite.presences[pid] === t.dataset.pres ? '' : t.dataset.pres;
        await DB.put('visites', visite);
        t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.pres === visite.presences[pid]));
        return;
      }
      const act = t.dataset.act;
      if (act === 'new-obs') {
        const o = await Model.nouvelleObservation(data, visite);
        location.hash = `#/obs/${o.id}/${visite.id}`;
      }
      if (act === 'lever') {
        const o = observations.find((x) => x.id === t.closest('.obs').dataset.id);
        o.suivis = o.suivis || {};
        const s = o.suivis[visite.id] || {};
        s.statut = s.statut === 'levee' ? (o.visiteId === visite.id ? '' : 'encours') : 'levee';
        o.suivis[visite.id] = s;
        await DB.put('observations', o);
        const y = window.scrollY;
        await viewVisite(id);
        window.scrollTo(0, y);
      }
      if (act === 'del-visite') {
        const crees = observations.filter((o) => o.visiteId === visite.id);
        if (!confirm(`Supprimer la visite n°${visite.numero} ? ${crees.length} observation(s) créée(s) lors de cette visite seront aussi supprimées.`)) return;
        for (const o of crees) await Model.supprimerObservation(o);
        for (const o of observations) {
          if (o.suivis && o.suivis[visite.id]) { delete o.suivis[visite.id]; await DB.put('observations', o); }
        }
        await DB.del('visites', visite.id);
        location.hash = '#/affaire/' + affaire.id;
      }
      if (act === 'pdf') { await ExportPDF.print(data, visite); }
      if (act === 'docx') {
        t.disabled = true; toast('Génération du CR Word…');
        try {
          const blob = await ExportDocx.build(data, visite);
          await U.share(blob, nomFichier(affaire, visite, 'docx'), `CR visite n°${visite.numero}`);
        } finally { t.disabled = false; }
      }
      if (act === 'xlsx') {
        const blob = await ExportXlsx.visite(data, visite);
        await U.share(blob, nomFichier(affaire, visite, 'xlsx').replace('_CR', '_Observations'), 'Observations');
      }
    });
  }

  function nomFichier(affaire, visite, ext) {
    return `${U.dateCompact(visite.date)}_CR${String(visite.numero).padStart(2, '0')}_${U.slug(affaire.nom) || 'Affaire'}.${ext}`;
  }

  // ---------- Observation ----------
  async function viewObs(id, visiteId) {
    const o = await DB.get('observations', id);
    if (!o) return (location.hash = '#/');
    const data = await Model.loadAffaire(o.affaireId);
    const { affaire, observations, visitesById } = data;
    const visite = visitesById[visiteId] || visitesById[o.visiteId];
    const etat = Model.etat(o, visite, visitesById) || { code: 'encours' };
    const estNouvelle = o.visiteId === visite.id;
    const suivi = (o.suivis || {})[visite.id] || {};
    pendingCleanup = estNouvelle ? o.id : null;

    const locs = [...new Set(observations.map((x) => x.localisation).filter(Boolean))].sort();
    const photos = [];
    for (const pid of o.photos || []) {
      const p = await DB.get('photos', pid);
      if (p) photos.push(p);
    }
    const historique = Object.entries(o.suivis || {})
      .map(([vid, s]) => ({ v: visitesById[vid], s }))
      .filter((h) => h.v && h.v.id !== visite.id && (h.s.commentaire || h.s.statut === 'levee'))
      .sort((a, b) => a.v.numero - b.v.numero);

    const root = mount(`
      <div class="section">
        <div class="obs-title">Observation n°${o.numero} ${badge(etat.code)}
          <span class="muted">créée lors de la visite n°${visitesById[o.visiteId]?.numero} du ${fmtDate(visitesById[o.visiteId]?.date)}</span></div>
        <label class="field"><span>Entreprise / lot concerné</span>
          <select data-f="intervenantId">
            <option value="">Généralités (tous lots)</option>
            ${(affaire.intervenants || []).map((i) => `<option value="${i.id}" ${o.intervenantId === i.id ? 'selected' : ''}>${esc(Model.labelIntervenant(i))}</option>`).join('')}
          </select></label>
        <div class="grid2">
          ${field('Localisation', 'localisation', o.localisation, { list: 'locs', placeholder: 'Bâtiment, niveau, local…' })}
          ${field('Échéance', 'echeance', o.echeance, { type: 'date' })}
        </div>
        <datalist id="locs">${locs.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
        ${field('Observation', 'description', o.description, { rows: 5, placeholder: 'Constat, demande à l\'entreprise… (micro du clavier pour dicter)' })}
        <label class="check"><input type="checkbox" data-prio ${o.priorite === 'urgente' ? 'checked' : ''}> Urgent / sécurité</label>
      </div>

      <div class="section">
        <h2>Photos</h2>
        <div class="photos">
          ${photos.map((p) => `<div class="photo" data-pid="${p.id}">
            <img src="${url(p.blob)}" data-act="annot" alt="">
            <input data-leg value="${esc(p.legende)}" placeholder="Légende">
            <div class="photo-btns"><button data-act="annot">✎ Annoter</button><button data-act="del-photo" class="danger-text">Supprimer</button></div>
          </div>`).join('')}
        </div>
        <div class="actions">
          <label class="btn primary big">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" data-act="add-photo" hidden></label>
          <label class="btn big">Galerie<input type="file" accept="image/*" multiple data-act="add-photo" hidden></label>
        </div>
      </div>

      <div class="section">
        <h2>Suivi à la visite n°${visite.numero}</h2>
        <div class="seg">
          <button data-statut="${estNouvelle ? '' : 'encours'}" class="${suivi.statut !== 'levee' ? 'on' : ''}">${estNouvelle ? 'Nouvelle' : 'En cours'}</button>
          <button data-statut="levee" class="${suivi.statut === 'levee' ? 'on' : ''}">Levée</button>
        </div>
        ${field('Commentaire de suivi', `suivis.${visite.id}.commentaire`, suivi.commentaire, { rows: 2, placeholder: 'Ex. reprise en cours, à vérifier à la prochaine visite…' })}
        ${historique.length ? `<h3>Historique</h3><ul class="histo">${historique.map((h) => `<li>Visite n°${h.v.numero} (${fmtDate(h.v.date)}) : ${h.s.statut === 'levee' ? '<strong>levée</strong>' : ''} ${esc(h.s.commentaire)}</li>`).join('')}</ul>` : ''}
      </div>

      <div class="actions sticky-actions">
        ${estNouvelle ? '<button class="danger" data-act="del-obs">Supprimer</button>' : ''}
        <button class="primary big" data-act="done">Terminé</button>
      </div>`, `Observation n°${o.numero}`, '#/visite/' + visite.id);

    bindForm(root, o, 'observations');

    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (el.dataset.prio !== undefined) { o.priorite = el.checked ? 'urgente' : 'normale'; await DB.put('observations', o); }
      if (el.dataset.leg !== undefined) {
        const p = photos.find((x) => x.id === el.closest('.photo').dataset.pid);
        p.legende = el.value; await DB.put('photos', p);
      }
      if (el.dataset.act === 'add-photo' && el.files.length) {
        toast('Ajout de la photo…');
        for (const file of el.files) {
          try {
            const { blob, w, h } = await Model.preparerPhoto(file);
            const p = { id: U.uid(), affaireId: o.affaireId, blob, original: blob, w, h, shapes: [], legende: '' };
            await DB.put('photos', p);
            o.photos = (o.photos || []).concat(p.id);
          } catch (err) { alert('Photo illisible : ' + err.message); }
        }
        await DB.put('observations', o);
        viewObs(id, visiteId);
      }
    });

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act], [data-statut]');
      if (!t) return;
      if (t.dataset.statut !== undefined) {
        o.suivis = o.suivis || {};
        o.suivis[visite.id] = { ...(o.suivis[visite.id] || {}), statut: t.dataset.statut };
        await DB.put('observations', o);
        return viewObs(id, visiteId);
      }
      const act = t.dataset.act;
      const pid = t.closest('.photo')?.dataset.pid;
      if (act === 'annot') {
        const p = photos.find((x) => x.id === pid);
        const res = await Annot.open(p);
        if (res) { await DB.put('photos', res); viewObs(id, visiteId); }
      }
      if (act === 'del-photo') {
        if (!confirm('Supprimer cette photo ?')) return;
        o.photos = o.photos.filter((x) => x !== pid);
        await DB.put('observations', o);
        await DB.del('photos', pid);
        viewObs(id, visiteId);
      }
      if (act === 'del-obs') {
        if (!confirm(`Supprimer l'observation n°${o.numero} et ses photos ?`)) return;
        pendingCleanup = null;
        await Model.supprimerObservation(o);
        location.hash = '#/visite/' + visite.id;
      }
      if (act === 'done') location.hash = '#/visite/' + visite.id;
    });
  }

  // Supprime une observation créée puis laissée vide.
  async function cleanup() {
    if (!pendingCleanup) return;
    const id = pendingCleanup;
    pendingCleanup = null;
    const o = await DB.get('observations', id);
    if (o && !o.description?.trim() && !o.localisation?.trim() && !(o.photos || []).length) {
      await Model.supprimerObservation(o);
    }
  }

  // ---------- Navigation ----------
  async function route() {
    const parts = (location.hash || '#/').slice(2).split('/');
    if (!(parts[0] === 'obs' && parts[1] === pendingCleanup)) await cleanup();
    try {
      if (parts[0] === 'affaire') await viewAffaire(parts[1]);
      else if (parts[0] === 'visite') await viewVisite(parts[1]);
      else if (parts[0] === 'obs') await viewObs(parts[1], parts[2]);
      else if (parts[0] === 'reglages') await viewReglages();
      else await viewHome();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="section"><p class="warn">Erreur : ${esc(err.message)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`;
    }
  }

  window.addEventListener('hashchange', route);
  window.App = { toast };
  route();
})();
