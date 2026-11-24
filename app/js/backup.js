// Sauvegarde / restauration complète dans un fichier .json (photos et plans inclus).
const Backup = {
  async exportAll() {
    const out = { app: 'suivi-chantier', format: 1, date: new Date().toISOString(), data: {} };
    for (const s of ['affaires', 'visites', 'observations']) out.data[s] = await DB.all(s);
    out.data.photos = [];
    for (const p of await DB.all('photos')) {
      out.data.photos.push({
        ...p,
        blob: await U.blobToDataURL(p.blob),
        original: p.original && p.original !== p.blob ? await U.blobToDataURL(p.original) : null,
      });
    }
    out.data.plans = [];
    for (const p of await DB.all('plans')) out.data.plans.push({ ...p, blob: await U.blobToDataURL(p.blob) });
    out.data.meta = await DB.all('meta');
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    return { blob, name: `${U.dateCompact()}_Sauvegarde_suivi_chantier.json` };
  },

  async importFile(file) {
    const json = JSON.parse(await file.text());
    if (json.app !== 'suivi-chantier' || !json.data) throw new Error('ce n\'est pas une sauvegarde de l\'application.');
    const d = json.data;
    for (const s of ['affaires', 'visites', 'observations']) {
      for (const o of d[s] || []) await DB.putRaw(s, o);
    }
    for (const p of d.photos || []) {
      const blob = U.dataURLToBlob(p.blob);
      await DB.putRaw('photos', { ...p, blob, original: p.original ? U.dataURLToBlob(p.original) : blob });
    }
    for (const p of d.plans || []) await DB.putRaw('plans', { ...p, blob: U.dataURLToBlob(p.blob) });
    for (const m of d.meta || []) if (m.id !== 'lastBackup') await DB.putRaw('meta', m);
    return { affaires: (d.affaires || []).length, photos: (d.photos || []).length, plans: (d.plans || []).length };
  },
};
