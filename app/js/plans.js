// Fonds de plans : import (PDF ou image), affichage avec zoom et puces, image pour les exports.
const Plans = (() => {
  // Couleur des puces selon le statut de l'observation à la visite affichée.
  const COULEURS = { nouvelle: '#0040D1', encours: '#E06A00', levee: '#2EB04D', autre: '#0A1A70' };
  const MAX_PX = 16e6;   // surface maxi d'un plan importé (limite mémoire des tablettes)
  const MAX_COTE = 6000; // grand côté maxi en pixels

  let pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) {
      const base = new URL('lib/pdfjs/', document.baseURI).href;
      pdfjsP = import(base + 'pdf.min.mjs').then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
        return lib;
      });
    }
    return pdfjsP;
  }

  function echelle(w, h) {
    return Math.min(MAX_COTE / Math.max(w, h), Math.sqrt(MAX_PX / (w * h)));
  }

  function canvasToBlob(c, type = 'image/jpeg', q = 0.88) {
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image trop grande pour la tablette'))), type, q));
  }

  // Fond blanc : les PDF et PNG transparents deviendraient noirs en JPEG.
  function canvasBlanc(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    return { c, ctx };
  }

  // Import d'un fichier : renvoie la liste des plans créés (une page de PDF = un plan).
  async function importer(file, affaireId, progress = () => {}) {
    const nomBase = file.name.replace(/\.[^.]+$/, '');
    const out = [];
    const estPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (estPdf) {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      try {
        for (let n = 1; n <= doc.numPages; n++) {
          progress(n, doc.numPages);
          const page = await doc.getPage(n);
          const v1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: echelle(v1.width, v1.height) });
          const { c, ctx } = canvasBlanc(Math.floor(vp.width), Math.floor(vp.height));
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          page.cleanup();
          const blob = await canvasToBlob(c);
          c.width = c.height = 0; // libère la mémoire tout de suite
          out.push({ nom: doc.numPages > 1 ? `${nomBase} – p.${n}` : nomBase, blob, w: Math.floor(vp.width), h: Math.floor(vp.height) });
        }
      } finally { doc.destroy(); }
    } else {
      progress(1, 1);
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, echelle(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const { c, ctx } = canvasBlanc(w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close && bmp.close();
      out.push({ nom: nomBase, blob: await canvasToBlob(c), w, h });
      c.width = c.height = 0;
    }
    const existants = await DB.byAffaire('plans', affaireId);
    let ordre = existants.reduce((m, p) => Math.max(m, p.ordre || 0), 0);
    const plans = [];
    for (const p of out) {
      const plan = { id: U.uid(), affaireId, ordre: ++ordre, createdAt: new Date().toISOString(), ...p };
      await DB.put('plans', plan);
      plans.push(plan);
    }
    return plans;
  }

  function dessinerPuce(ctx, x, y, r, label, couleur, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(r * (String(label).length > 2 ? 0.85 : 1.05))}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label), x, y + r * 0.05);
    ctx.restore();
  }

  async function chargerImage(blob) {
    const bmp = await createImageBitmap(blob);
    return bmp;
  }

  // Plan + puces dessinés dans une image JPEG (pour le CR PDF et Word).
  // pins : [{x, y, label, code}] en coordonnées relatives (0 à 1).
  async function composer(plan, pins, cote = 3000) {
    const bmp = await chargerImage(plan.blob);
    const k = Math.min(1, cote / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const { c, ctx } = canvasBlanc(w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const r = Math.max(14, Math.max(w, h) / 65);
    for (const p of pins) dessinerPuce(ctx, p.x * w, p.y * h, r, p.label, COULEURS[p.code] || COULEURS.autre, p.code === 'levee' ? 0.75 : 1);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
    c.width = c.height = 0;
    return { blob, w, h };
  }

  // Extrait du plan centré sur une puce (aperçu dans la fiche observation).
  async function extrait(plan, pin, canvas) {
    const bmp = await chargerImage(plan.blob);
    const cote = Math.min(bmp.width, bmp.height) / 3;
    const cw = canvas.width, ch = canvas.height;
    const sw = cote * (cw / ch), sh = cote;
    const sx = pin.x * bmp.width - sw / 2, sy = pin.y * bmp.height - sh / 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cw, ch);
    bmp.close && bmp.close();
    dessinerPuce(ctx, cw / 2, ch / 2, 16, pin.label, COULEURS[pin.code] || COULEURS.autre);
  }

  // Visionneuse : zoom à deux doigts ou à la molette, déplacement à un doigt, toucher = onTap.
  // opts : { pins: [{id, x, y, label, code, sel}], onTap(x, y), onPin(id), focus: {x, y} }
  function viewer(stage, plan, opts) {
    stage.classList.add('pv-stage');
    stage.innerHTML = '<div class="pv-layer"><img class="pv-img" alt=""><div class="pv-pins"></div></div>';
    const layer = stage.querySelector('.pv-layer');
    const img = stage.querySelector('.pv-img');
    const pinsEl = stage.querySelector('.pv-pins');
    const src = URL.createObjectURL(plan.blob);
    img.src = src;
    img.width = plan.w; img.height = plan.h;
    layer.style.width = plan.w + 'px';
    layer.style.height = plan.h + 'px';

    let k = 1, tx = 0, ty = 0, kFit = 1;
    let pins = opts.pins || [];

    function apply() {
      layer.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      // Les puces gardent une taille constante à l'écran.
      pinsEl.style.setProperty('--inv', 1 / k);
    }
    function clamp() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const pw = plan.w * k, ph = plan.h * k;
      const m = 80; // on garde au moins 80 px du plan visibles
      tx = Math.min(W - m, Math.max(m - pw, tx));
      ty = Math.min(H - m, Math.max(m - ph, ty));
    }
    function fit() {
      const W = stage.clientWidth, H = stage.clientHeight;
      kFit = Math.min(W / plan.w, H / plan.h);
      k = kFit;
      tx = (W - plan.w * k) / 2;
      ty = (H - plan.h * k) / 2;
      apply();
    }
    function zoomAt(f, cx, cy) {
      const nk = Math.min(Math.max(k * f, kFit * 0.8), Math.max(kFit * 16, 3));
      tx = cx - (cx - tx) * (nk / k);
      ty = cy - (cy - ty) * (nk / k);
      k = nk;
      clamp();
      apply();
    }
    function centrer(x, y, kk) {
      const W = stage.clientWidth, H = stage.clientHeight;
      k = kk;
      tx = W / 2 - x * plan.w * k;
      ty = H / 2 - y * plan.h * k;
      clamp();
      apply();
    }
    function renderPins() {
      pinsEl.innerHTML = pins.map((p) => `<button class="pv-pin c-${p.code}${p.sel ? ' sel' : ''}" data-pin="${U.esc(p.id)}"
        style="left:${p.x * plan.w}px;top:${p.y * plan.h}px">${U.esc(p.label)}</button>`).join('');
    }

    // Gestes
    const pts = new Map();
    let geste = null; // {x0, y0, t0, moved, dist, mid}
    const rel = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    function onDown(e) {
      stage.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, rel(e));
      if (pts.size === 1) {
        const p = rel(e);
        geste = { x0: p.x, y0: p.y, t0: Date.now(), moved: false, pin: e.target.closest('.pv-pin')?.dataset.pin };
      } else {
        geste && (geste.moved = true);
      }
    }
    function onMove(e) {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const cur = rel(e);
      if (pts.size === 1) {
        if (geste && Math.hypot(cur.x - geste.x0, cur.y - geste.y0) > 8) geste.moved = true;
        if (geste?.moved) { tx += cur.x - prev.x; ty += cur.y - prev.y; clamp(); apply(); }
        pts.set(e.pointerId, cur);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.entries()].map(([id, p]) => (id === e.pointerId ? cur : p));
        const [a0, b0] = [...pts.values()];
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
        const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        tx += m1.x - m0.x; ty += m1.y - m0.y;
        if (d0 > 0) zoomAt(d1 / d0, m1.x, m1.y); else apply();
        pts.set(e.pointerId, cur);
      }
    }
    function onUp(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size > 0 || !geste) return;
      const g = geste;
      geste = null;
      if (g.moved || Date.now() - g.t0 > 700) return;
      if (g.pin) return opts.onPin && opts.onPin(g.pin);
      const x = (g.x0 - tx) / k / plan.w, y = (g.y0 - ty) / k / plan.h;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && opts.onTap) opts.onTap(x, y);
    }
    function onWheel(e) {
      e.preventDefault();
      const p = rel(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() => { clamp(); apply(); });

    renderPins();
    const ready = () => {
      fit();
      if (opts.focus) centrer(opts.focus.x, opts.focus.y, Math.max(kFit * 4, Math.min(1, kFit * 8)));
      ro.observe(stage);
    };
    if (stage.clientWidth) ready(); else requestAnimationFrame(ready);

    return {
      setPins(p) { pins = p; renderPins(); },
      fit,
      zoom(f) { zoomAt(f, stage.clientWidth / 2, stage.clientHeight / 2); },
      destroy() { ro.disconnect(); URL.revokeObjectURL(src); },
    };
  }

  // Plans à joindre au CR d'une visite : ceux qui portent au moins une puce de ce CR.
  async function pourCR(data, visite) {
    const out = [];
    for (const plan of data.plans || []) {
      const pins = Model.pinsPlan(data, visite, plan.id);
      if (!pins.length) continue;
      out.push({ plan, image: await composer(plan, pins) });
    }
    return out;
  }

  return { COULEURS, importer, composer, extrait, viewer, pdfjs, pourCR };
})();
