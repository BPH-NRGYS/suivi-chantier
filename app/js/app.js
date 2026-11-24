// Interface : affaires, visites, observations, exports.
(() => {
  const { $, $$, esc, fmtDate } = U;
  const app = $('#app');
  let objectUrls = []; // URL des photos affichées à l'écran courant
  let nextUrls = [];   // URL créées pour l'écran en préparation
  let pendingCleanup = null; // observation vide à supprimer en quittant sa fiche
  let planViewer = null;     // visionneuse de plan affichée

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
    if (planViewer) { planViewer.destroy(); planViewer = null; }
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
        <p class="muted">Sauvegarde complète (affaires, visites, photos, plans) dans un fichier à ranger sur OneDrive.
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
          toast(`Restauration terminée : ${n.affaires} affaire(s), ${n.photos} photo(s), ${n.plans} plan(s).`, 4000);
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
        <p class="muted">Version de l'application : 0.2 (prototype)</p>
      </div>`, 'Réglages', '#/');
    root.addEventListener('change', async (e) => {
      if (e.target.dataset.meta) { await DB.setMeta(e.target.dataset.meta, e.target.value); toast('Enregistré'); }
    });
  }

  // ---------- Affaire ----------
  async function viewAffaire(id) {
    const data = await Model.loadAffaire(id);
    if (!data) return (location.hash = '#/');
    const { affaire, visites, observations, visitesById, plans } = data;
    affaire.intervenants = affaire.intervenants || [];

    const plansHtml = plans.map((p, n) => {
      const nb = observations.filter((o) => o.plan?.planId === p.id).length;
      return `<div class="plan-card" data-plan="${p.id}">
        <img src="${url(p.blob)}" alt="">
        <input data-plan-nom value="${esc(p.nom)}" placeholder="Nom du plan">
        <div class="plan-btns">
          <span class="muted">${nb} observation(s)</span>
          <button data-act="up-plan" title="Monter" ${n === 0 ? 'disabled' : ''}>↑</button>
          <button data-act="del-plan" class="danger-text">Supprimer</button>
        </div>
      </div>`;
    }).join('');

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
        <h2>Plans</h2>
        <p class="muted">Fonds de plans pour repérer les observations par des puces numérotées. Un PDF de plusieurs pages donne un plan par page.</p>
        <div class="plans">${plansHtml || '<p class="empty">Aucun plan.</p>'}</div>
        <div class="actions"><label class="btn">+ Ajouter des plans (PDF ou image)<input type="file" accept="application/pdf,.pdf,image/*" multiple data-act="add-plan" hidden></label></div>
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
      const el = e.target;
      if (el.dataset.planNom !== undefined) {
        const p = plans.find((x) => x.id === el.closest('.plan-card').dataset.plan);
        p.nom = el.value.trim() || p.nom;
        await DB.put('plans', p);
        return;
      }
      if (el.dataset.act === 'add-plan' && el.files.length) {
        const files = [...el.files];
        let n = 0;
        try {
          for (const f of files) {
            const crees = await Plans.importer(f, affaire.id, (i, tot) => toast(`Import de « ${f.name} »${tot > 1 ? ` : page ${i} / ${tot}` : ''}…`, 60000));
            n += crees.length;
          }
          toast(`${n} plan(s) ajouté(s).`);
        } catch (err) {
          console.error(err);
          alert('Import impossible : ' + err.message);
        }
        return viewAffaire(id);
      }
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
      const pcard = btn.closest('.plan-card');
      if (act === 'del-plan') {
        const p = plans.find((x) => x.id === pcard.dataset.plan);
        const lies = observations.filter((o) => o.plan?.planId === p.id);
        if (!confirm(`Supprimer le plan « ${p.nom} » ?${lies.length ? ` ${lies.length} observation(s) y sont repérées : elles sont conservées mais perdent leur puce.` : ''}`)) return;
        for (const o of lies) { o.plan = null; await DB.put('observations', o); }
        await DB.del('plans', p.id);
        return viewAffaire(id);
      }
      if (act === 'up-plan') {
        const n = plans.findIndex((x) => x.id === pcard.dataset.plan);
        plans.forEach((p, i) => (p.ordre = i + 1));
        [plans[n - 1].ordre, plans[n].ordre] = [plans[n].ordre, plans[n - 1].ordre];
        for (const p of plans) await DB.put('plans', p);
        return viewAffaire(id);
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
  const TABS = [['general', 'Général'], ['presences', 'Présences'], ['avancement', 'Avancement'], ['obs', 'Observations'], ['plans', 'Plans'], ['cr', 'CR / Exports']];

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
                <span class="muted">${esc(o.localisation)}</span>${o.echeance ? `<span class="muted">· échéance ${fmtDate(o.echeance)}</span>` : ''}
                ${o.plan && data.plansById[o.plan.planId] ? `<span class="muted">· 📍 ${esc(Model.nomPlan(data, o))}</span>` : ''}</div>
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
    } else if (tab === 'plans') {
      body = data.plans.length ? `
        <p class="muted">Ouvrez un plan, puis touchez-le à l'endroit voulu pour créer une observation. Les puces portent le numéro de l'observation.</p>
        <div class="plans">${data.plans.map((p) => {
          const pins = Model.pinsPlan(data, visite, p.id);
          const ouv = pins.filter((x) => x.code !== 'levee').length;
          return `<a class="plan-card" href="#/plan/${p.id}/${visite.id}">
            <img src="${url(p.blob)}" alt="">
            <div class="plan-nom">${esc(p.nom)}</div>
            <div class="muted">${pins.length} puce(s) · ${ouv} non levée(s)</div></a>`;
        }).join('')}</div>`
        : `<p class="empty">Aucun plan. <a href="#/affaire/${affaire.id}">Ajoutez des plans sur la fiche affaire</a> (PDF ou image).</p>`;
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
    const planObs = o.plan ? data.plansById[o.plan.planId] : null;

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
        <h2>Repérage sur plan</h2>
        ${planObs ? `
          <canvas class="extrait" width="720" height="300" data-act="voir-plan"></canvas>
          <div class="muted">Plan : ${esc(planObs.nom)}</div>
          <div class="actions">
            <button data-act="voir-plan">Voir sur le plan</button>
            <button data-act="placer" data-plan="${planObs.id}">Déplacer la puce</button>
            <button data-act="retirer-plan" class="danger-text">Retirer du plan</button>
          </div>`
        : data.plans.length ? `
          <p class="muted">Placer l'observation sur :</p>
          <div class="actions">${data.plans.map((p) => `<button data-act="placer" data-plan="${p.id}">📍 ${esc(p.nom)}</button>`).join('')}</div>`
        : `<p class="empty">Aucun plan pour cette affaire. <a href="#/affaire/${affaire.id}">Ajoutez-en sur la fiche affaire.</a></p>`}
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

    const cv = root.querySelector('canvas.extrait');
    if (cv && planObs) Plans.extrait(planObs, { x: o.plan.x, y: o.plan.y, label: o.numero, code: etat.code }, cv).catch(console.error);

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
      if (act === 'placer') return (location.hash = `#/plan/${t.dataset.plan}/${visite.id}/p.${o.id}`);
      if (act === 'voir-plan') return (location.hash = `#/plan/${o.plan.planId}/${visite.id}/f.${o.id}`);
      if (act === 'retirer-plan') {
        if (!confirm('Retirer la puce de cette observation du plan ?')) return;
        o.plan = null;
        await DB.put('observations', o);
        return viewObs(id, visiteId);
      }
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

  // ---------- Plan : puces des observations ----------
  // extra : 'p.<obsId>' = placer cette observation ; 'f.<obsId>' = centrer sur sa puce.
  async function viewPlan(planId, visiteId, extra = '') {
    const plan = await DB.get('plans', planId);
    const visite = await DB.get('visites', visiteId);
    if (!plan || !visite) return (location.hash = '#/');
    const data = await Model.loadAffaire(plan.affaireId);
    const [modeUrl, obsUrl] = extra ? [extra.slice(0, 1), extra.slice(2)] : ['', ''];
    const cible = obsUrl ? data.observations.find((x) => x.id === obsUrl) : null;
    const retour = cible ? `#/obs/${cible.id}/${visite.id}` : `#/visite/${visite.id}`;
    let mode = cible && modeUrl === 'p' ? { type: 'place', obs: cible } : { type: 'normal' };
    let sel = cible && modeUrl === 'f' ? cible.id : null;
    let temp = null; // puce provisoire avant création d'une observation

    const root = mount(`
      <div class="pv">
        <div class="pv-bar">
          ${data.plans.length > 1 ? `<select data-plan-select>${data.plans.map((p) => `<option value="${p.id}" ${p.id === plan.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select>` : `<strong class="pv-nom">${esc(plan.nom)}</strong>`}
          <div class="pv-hint"></div>
          <div class="pv-zoom"><button data-z="out" aria-label="Zoom arrière">−</button><button data-z="fit">Tout voir</button><button data-z="in" aria-label="Zoom avant">+</button></div>
        </div>
        <div class="pv-host"></div>
        <div class="pv-legend"><span class="c-nouvelle">●</span> Nouvelle <span class="c-encours">●</span> En cours <span class="c-levee">●</span> Levée</div>
        <div class="pv-pop" hidden></div>
      </div>`, `Plan — Visite n°${visite.numero}`, retour);

    const pv = root.querySelector('.pv');
    pv.style.top = $('.topbar').getBoundingClientRect().bottom + 'px';
    const hint = root.querySelector('.pv-hint');
    const pop = root.querySelector('.pv-pop');

    function pins() {
      const p = Model.pinsPlan(data, visite, plan.id).map((x) => ({ ...x, sel: x.id === sel }));
      if (temp) p.push({ id: '_temp', x: temp.x, y: temp.y, label: '+', code: 'temp', sel: true });
      return p;
    }
    function majHint() {
      if (mode.type === 'place' || mode.type === 'move') {
        hint.innerHTML = `<span class="pv-mode">Touchez l'emplacement de l'observation n°${mode.obs.numero}</span> <button data-act="annuler-mode">Annuler</button>`;
      } else {
        hint.textContent = 'Touchez le plan pour créer une observation, ou une puce pour la consulter.';
      }
    }
    function fermerPop() { pop.hidden = true; sel = null; temp = null; planViewer.setPins(pins()); }

    function ouvrirPop(o) {
      const etat = Model.etat(o, visite, data.visitesById);
      const i = Model.intervenant(data.affaire, o.intervenantId);
      pop.innerHTML = `
        <div class="obs-head"><span class="num">${o.numero}</span>${etat ? badge(etat.code) : ''}
          <span class="muted">${esc(Model.labelIntervenant(i))}${o.localisation ? ' · ' + esc(o.localisation) : ''}</span></div>
        <div class="pv-desc">${esc(o.description) || '<em class="muted">(sans description)</em>'}</div>
        ${etat?.commentaire ? `<div class="obs-suivi">Suivi : ${esc(etat.commentaire)}</div>` : ''}
        <div class="actions">
          <a class="btn primary" href="#/obs/${o.id}/${visite.id}">Ouvrir la fiche</a>
          <button data-act="deplacer" data-obs="${o.id}">Déplacer</button>
          <button data-act="fermer">Fermer</button>
        </div>`;
      pop.hidden = false;
    }

    planViewer = Plans.viewer(root.querySelector('.pv-host'), plan, {
      pins: pins(),
      focus: sel && cible?.plan ? { x: cible.plan.x, y: cible.plan.y } : null,
      async onTap(x, y) {
        if (mode.type === 'place' || mode.type === 'move') {
          const o = mode.obs;
          o.plan = { planId: plan.id, x, y };
          await DB.put('observations', o);
          if (mode.type === 'place') return (location.hash = retour);
          mode = { type: 'normal' };
          sel = o.id;
          majHint();
          planViewer.setPins(pins());
          ouvrirPop(o);
          return toast('Puce déplacée');
        }
        sel = null;
        temp = { x, y };
        planViewer.setPins(pins());
        pop.innerHTML = `<div><strong>Nouvelle observation à cet endroit ?</strong></div>
          <div class="actions"><button class="primary" data-act="creer">Créer l'observation</button><button data-act="fermer">Annuler</button></div>`;
        pop.hidden = false;
      },
      onPin(id) {
        if (mode.type !== 'normal' || id === '_temp') return;
        temp = null;
        sel = id;
        planViewer.setPins(pins());
        ouvrirPop(data.observations.find((x) => x.id === id));
      },
    });
    majHint();
    if (sel && cible) ouvrirPop(cible);

    root.addEventListener('change', (e) => {
      if (e.target.dataset.planSelect !== undefined) location.hash = `#/plan/${e.target.value}/${visite.id}${mode.type === 'place' ? '/p.' + mode.obs.id : ''}`;
    });
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.z) return t.dataset.z === 'fit' ? planViewer.fit() : planViewer.zoom(t.dataset.z === 'in' ? 1.6 : 1 / 1.6);
      const act = t.dataset.act;
      if (act === 'fermer') fermerPop();
      if (act === 'creer') {
        const o = await Model.nouvelleObservation(data, visite, { planId: plan.id, x: temp.x, y: temp.y });
        location.hash = `#/obs/${o.id}/${visite.id}`;
      }
      if (act === 'deplacer') {
        mode = { type: 'move', obs: data.observations.find((x) => x.id === t.dataset.obs) };
        pop.hidden = true;
        majHint();
      }
      if (act === 'annuler-mode') {
        if (mode.type === 'place') return (location.hash = retour);
        mode = { type: 'normal' };
        majHint();
      }
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
    const resteSurObs = (parts[0] === 'obs' && parts[1] === pendingCleanup)
      || (parts[0] === 'plan' && parts[3] && parts[3].slice(2) === pendingCleanup);
    if (!resteSurObs) await cleanup();
    try {
      if (parts[0] === 'plan') await viewPlan(parts[1], parts[2], parts[3]);
      else
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
