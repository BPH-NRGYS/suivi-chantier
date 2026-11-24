// Éditeur d'annotation des photos : stylo, flèche, cercle, rectangle, texte.
// Les formes sont conservées pour pouvoir reprendre l'annotation plus tard.
const Annot = (() => {
  const COULEURS = ['#E53935', '#FFD600', '#08D978', '#FFFFFF', '#0040D1', '#000000'];
  const OUTILS = [
    ['arrow', '↗ Flèche'], ['ellipse', '◯ Cercle'], ['rect', '▭ Cadre'], ['pen', '✎ Stylo'], ['text', 'T Texte'],
  ];

  function drawShapes(ctx, shapes, k, base) {
    for (const s of shapes) {
      const lw = base.lw * (s.e || 1) * k;
      ctx.strokeStyle = s.c;
      ctx.fillStyle = s.c;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.t === 'pen') {
        ctx.beginPath();
        s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
        ctx.stroke();
      } else if (s.t === 'arrow') {
        const [x1, y1] = s.a.map((v) => v * k);
        const [x2, y2] = s.b.map((v) => v * k);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const h = lw * 4;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * h * 0.6, y2 - Math.sin(ang) * h * 0.6); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
      } else if (s.t === 'ellipse') {
        const cx = (s.a[0] + s.b[0]) / 2 * k, cy = (s.a[1] + s.b[1]) / 2 * k;
        const rx = Math.abs(s.b[0] - s.a[0]) / 2 * k, ry = Math.abs(s.b[1] - s.a[1]) / 2 * k;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (s.t === 'rect') {
        ctx.strokeRect(s.a[0] * k, s.a[1] * k, (s.b[0] - s.a[0]) * k, (s.b[1] - s.a[1]) * k);
      } else if (s.t === 'text') {
        const size = base.fs * k;
        ctx.font = `bold ${size}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = size / 6;
        ctx.strokeStyle = s.c === '#000000' ? '#FFFFFF' : '#000000';
        ctx.strokeText(s.s, s.p[0] * k, s.p[1] * k);
        ctx.fillText(s.s, s.p[0] * k, s.p[1] * k);
      }
    }
  }

  function loadImage(blob) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(blob);
    });
  }

  async function render(photo) {
    const img = await loadImage(photo.original || photo.blob);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    drawShapes(ctx, photo.shapes || [], 1, baseOf(c.width, c.height));
    URL.revokeObjectURL(img.src);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  }

  function baseOf(w, h) {
    const m = Math.max(w, h);
    return { lw: Math.max(4, m / 170), fs: Math.max(20, m / 22) };
  }

  function open(photo) {
    return new Promise(async (resolve) => {
      const img = await loadImage(photo.original || photo.blob);
      const W = img.naturalWidth, H = img.naturalHeight;
      const base = baseOf(W, H);
      let shapes = JSON.parse(JSON.stringify(photo.shapes || []));
      let outil = 'arrow';
      let couleur = COULEURS[0];
      let current = null;

      const ov = document.createElement('div');
      ov.className = 'annot';
      ov.innerHTML = `
        <div class="annot-bar">
          <div class="annot-group">${OUTILS.map(([k, l]) => `<button data-outil="${k}">${l}</button>`).join('')}</div>
          <div class="annot-group">${COULEURS.map((c) => `<button class="swatch" data-couleur="${c}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
          <div class="annot-group">
            <button data-act="undo">↶ Annuler</button>
            <button data-act="clear">Tout effacer</button>
          </div>
          <div class="annot-group annot-end">
            <button data-act="cancel">Fermer</button>
            <button data-act="ok" class="primary">Valider</button>
          </div>
        </div>
        <div class="annot-stage"><canvas></canvas></div>`;
      document.body.appendChild(ov);
      const stage = ov.querySelector('.annot-stage');
      const cv = ov.querySelector('canvas');
      const ctx = cv.getContext('2d');
      let k = 1;

      function layout() {
        const r = stage.getBoundingClientRect();
        k = Math.min(r.width / W, r.height / H);
        const dpr = window.devicePixelRatio || 1;
        cv.style.width = Math.round(W * k) + 'px';
        cv.style.height = Math.round(H * k) + 'px';
        cv.width = Math.round(W * k * dpr);
        cv.height = Math.round(H * k * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }

      function draw() {
        ctx.clearRect(0, 0, W * k, H * k);
        ctx.drawImage(img, 0, 0, W * k, H * k);
        drawShapes(ctx, current ? shapes.concat([current]) : shapes, k, base);
      }

      function refreshBar() {
        ov.querySelectorAll('[data-outil]').forEach((b) => b.classList.toggle('on', b.dataset.outil === outil));
        ov.querySelectorAll('[data-couleur]').forEach((b) => b.classList.toggle('on', b.dataset.couleur === couleur));
      }

      function pos(e) {
        const r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
      }

      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const p = pos(e);
        if (outil === 'text') {
          const s = prompt('Texte à ajouter sur la photo :');
          if (s && s.trim()) { shapes.push({ t: 'text', p, s: s.trim(), c: couleur }); draw(); }
          return;
        }
        cv.setPointerCapture(e.pointerId);
        current = outil === 'pen' ? { t: 'pen', pts: [p], c: couleur } : { t: outil, a: p, b: p, c: couleur };
      });
      cv.addEventListener('pointermove', (e) => {
        if (!current) return;
        const p = pos(e);
        if (current.t === 'pen') current.pts.push(p); else current.b = p;
        draw();
      });
      const end = () => {
        if (!current) return;
        const tiny = current.t === 'pen'
          ? current.pts.length < 2
          : Math.hypot(current.b[0] - current.a[0], current.b[1] - current.a[1]) < base.lw * 2;
        if (!tiny) shapes.push(current);
        current = null;
        draw();
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);

      ov.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.outil) { outil = b.dataset.outil; refreshBar(); }
        if (b.dataset.couleur) { couleur = b.dataset.couleur; refreshBar(); }
        const act = b.dataset.act;
        if (act === 'undo') { shapes.pop(); draw(); }
        if (act === 'clear' && shapes.length && confirm('Effacer toutes les annotations ?')) { shapes = []; draw(); }
        if (act === 'cancel') { close(); resolve(null); }
        if (act === 'ok') {
          b.disabled = true;
          const updated = { ...photo, original: photo.original || photo.blob, shapes };
          updated.blob = shapes.length ? await render(updated) : updated.original;
          close();
          resolve(updated);
        }
      });

      function close() {
        window.removeEventListener('resize', layout);
        URL.revokeObjectURL(img.src);
        ov.remove();
      }

      window.addEventListener('resize', layout);
      refreshBar();
      requestAnimationFrame(layout);
    });
  }

  return { open };
})();
