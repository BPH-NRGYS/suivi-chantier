// Outils communs et règles métier (numérotation, statut des observations).
const U = {
  $: (s, r = document) => r.querySelector(s),
  $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
  uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
  },
  slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  },
  dateCompact(iso) { return (iso || U.today()).replace(/-/g, ''); },
  download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  },
  async share(blob, filename, title) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return true; }
      catch (e) { if (e.name === 'AbortError') return true; }
    }
    U.download(blob, filename);
    return false;
  },
  canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }));
    } catch { return false; }
  },
  blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  },
  dataURLToBlob(url) {
    const [head, b64] = url.split(',');
    const mime = head.match(/data:([^;]+)/)[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  },
  // Retire les caractères interdits en XML et échappe le reste.
  xml(s) {
    return String(s ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },
};

const ROLES = ['Maître d\'ouvrage', 'Maîtrise d\'œuvre', 'Entreprise', 'Bureau de contrôle', 'CSPS', 'Exploitant', 'Autre'];
const PRESENCE = { P: 'Présent', A: 'Absent', E: 'Excusé', '': '—' };

const Model = {
  STATUTS: { nouvelle: 'Nouvelle', encours: 'En cours', levee: 'Levée' },

  // Charge une affaire avec ses visites (triées) et ses observations.
  async loadAffaire(affaireId) {
    const affaire = await DB.get('affaires', affaireId);
    if (!affaire) return null;
    const visites = (await DB.byAffaire('visites', affaireId)).sort((a, b) => a.numero - b.numero);
    const observations = (await DB.byAffaire('observations', affaireId)).sort((a, b) => a.numero - b.numero);
    const visitesById = Object.fromEntries(visites.map((v) => [v.id, v]));
    return { affaire, visites, observations, visitesById };
  },

  intervenant(affaire, id) {
    return (affaire.intervenants || []).find((i) => i.id === id);
  },

  labelIntervenant(i) {
    if (!i) return 'Généralités';
    return [i.lot, i.societe].filter(Boolean).join(' – ') || i.role || '(sans nom)';
  },

  // Statut d'une observation vue depuis une visite donnée.
  // Renvoie null si l'observation ne figure pas dans ce CR.
  etat(obs, visite, visitesById) {
    const vCrea = visitesById[obs.visiteId];
    if (!vCrea || vCrea.numero > visite.numero) return null;
    for (const [vid, s] of Object.entries(obs.suivis || {})) {
      const v = visitesById[vid];
      if (s.statut === 'levee' && v && v.numero < visite.numero) return null;
    }
    const s = (obs.suivis || {})[visite.id] || {};
    if (s.statut === 'levee') return { code: 'levee', commentaire: s.commentaire || '' };
    if (obs.visiteId === visite.id) return { code: 'nouvelle', commentaire: s.commentaire || '' };
    return { code: 'encours', commentaire: s.commentaire || '' };
  },

  // Statut actuel (toutes visites confondues) — pour le registre Excel.
  etatGlobal(obs, visitesById) {
    let levee = null;
    let dernierCommentaire = '';
    let dernierNum = -1;
    for (const [vid, s] of Object.entries(obs.suivis || {})) {
      const v = visitesById[vid];
      if (!v) continue;
      if (s.statut === 'levee' && (!levee || v.numero < levee.numero)) levee = v;
      if (s.commentaire && v.numero > dernierNum) { dernierNum = v.numero; dernierCommentaire = s.commentaire; }
    }
    return { levee, dernierCommentaire };
  },

  // Observations d'un CR, regroupées par entreprise dans l'ordre des intervenants.
  groupesCR(data, visite) {
    const { affaire, observations, visitesById } = data;
    const lignes = observations
      .map((o) => ({ obs: o, etat: Model.etat(o, visite, visitesById) }))
      .filter((l) => l.etat);
    const ordre = (affaire.intervenants || []).map((i) => i.id);
    const groupes = new Map();
    for (const l of lignes) {
      const key = ordre.includes(l.obs.intervenantId) ? l.obs.intervenantId : '';
      if (!groupes.has(key)) groupes.set(key, []);
      groupes.get(key).push(l);
    }
    const keys = [''].concat(ordre).filter((k) => groupes.has(k));
    return keys.map((k) => ({
      intervenant: Model.intervenant(affaire, k),
      label: Model.labelIntervenant(Model.intervenant(affaire, k)),
      lignes: groupes.get(k),
    }));
  },

  async nouvelleVisite(data) {
    const { affaire, visites } = data;
    const prev = visites[visites.length - 1];
    const redacteur = await DB.getMeta('redacteur', '');
    const v = {
      id: U.uid(),
      affaireId: affaire.id,
      numero: (prev ? prev.numero : 0) + 1,
      date: U.today(),
      heure: '',
      redacteur: prev?.redacteur || redacteur,
      meteo: '',
      presences: {},
      diffusion: prev ? { ...prev.diffusion } : Object.fromEntries((affaire.intervenants || []).map((i) => [i.id, true])),
      avancement: prev ? JSON.parse(JSON.stringify(prev.avancement || {})) : {},
      remarques: '',
      prochaineDate: '',
      prochaineHeure: '',
      createdAt: new Date().toISOString(),
    };
    // On remet les commentaires d'avancement à zéro mais on garde les pourcentages.
    for (const k of Object.keys(v.avancement)) v.avancement[k].commentaire = '';
    await DB.put('visites', v);
    return v;
  },

  async nouvelleObservation(data, visite) {
    const num = data.observations.reduce((m, o) => Math.max(m, o.numero), 0) + 1;
    const o = {
      id: U.uid(),
      affaireId: data.affaire.id,
      visiteId: visite.id,
      numero: num,
      intervenantId: '',
      localisation: '',
      description: '',
      priorite: 'normale',
      echeance: '',
      photos: [],
      suivis: {},
      createdAt: new Date().toISOString(),
    };
    await DB.put('observations', o);
    return o;
  },

  async supprimerObservation(o) {
    for (const pid of o.photos || []) await DB.del('photos', pid);
    await DB.del('observations', o.id);
  },

  async supprimerAffaire(affaireId) {
    const data = await Model.loadAffaire(affaireId);
    if (!data) return;
    for (const o of data.observations) await Model.supprimerObservation(o);
    for (const v of data.visites) await DB.del('visites', v.id);
    await DB.del('affaires', affaireId);
  },

  // Les photos sont réduites (1600 px maxi) pour limiter la place et le poids des exports.
  async preparerPhoto(file) {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return { blob, w, h };
  },
};
