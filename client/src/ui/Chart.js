// Moniteur « santé mentale » facon écran d'activité (grille sombre, courbe orange, axes
// libellés). Sans dépendance : tout est dessiné sur un <canvas>. Le cadre/bezel + le titre
// sont fournis par le HTML/CSS autour (voir .mh-monitor) ; ici on dessine uniquement le plot.
//
// points : [{ sanity: 0..1 }]  → tracé sur un axe 0..10 ("SANITY") vs 0..60 ("TIME IN SECONDS").

export class Chart {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.compact = !!opts.compact;
    this.points = [];
  }

  // Conservé pour la pastille de valeur (vert→rouge comme le HUD si besoin).
  static color(s, a = 1) {
    const h = Math.round(Math.max(0, Math.min(1, s)) * 155);
    return `hsla(${h}, 75%, 52%, ${a})`;
  }

  setData(points) {
    this.points = Array.isArray(points) ? points : [];
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const ctx = this.ctx;
    const compact = this.compact;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 600;
    const h = c.clientHeight || 260;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Écran (fond teal très sombre + légère vignette).
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1614';
    ctx.fillRect(0, 0, w, h);

    const padL = compact ? 20 : 42;
    const padR = compact ? 8 : 14;
    const padT = compact ? 6 : 10;
    const padB = compact ? 16 : 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const x0 = padL;
    const y0 = padT;

    const grid = 'rgba(120, 175, 160, 0.10)';
    const axis = 'rgba(200, 235, 222, 0.35)';
    const label = 'rgba(214, 236, 228, 0.78)';
    const yMax = 10;
    const xMax = 60;
    const xStep = compact ? 20 : 10;

    ctx.lineWidth = 1;
    ctx.font = `${compact ? 8 : 10}px ui-monospace, Consolas, monospace`;

    // Lignes horizontales + graduations Y (0..10).
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let v = 0; v <= yMax; v++) {
      const y = y0 + plotH * (1 - v / yMax);
      ctx.strokeStyle = v === 0 ? axis : grid;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + plotW, y);
      ctx.stroke();
      if (!compact || v % 2 === 0) {
        ctx.fillStyle = label;
        ctx.fillText(String(v), x0 - 5, y);
      }
    }

    // Lignes verticales + graduations X (0..60).
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let v = 0; v <= xMax; v += xStep) {
      const x = x0 + plotW * (v / xMax);
      ctx.strokeStyle = v === 0 ? axis : grid;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + plotH);
      ctx.stroke();
      ctx.fillStyle = label;
      ctx.fillText(String(v), x, y0 + plotH + 4);
    }

    // Titres d'axes (masqués en compact pour rester lisible).
    if (!compact) {
      ctx.fillStyle = 'rgba(214, 236, 228, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText('TIME IN SECONDS', x0 + plotW / 2, h - 5);
      ctx.save();
      ctx.translate(11, y0 + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText('SANITY', 0, 0);
      ctx.restore();
    }

    // Courbe (orange, avec léger halo) + point courant.
    const pts = this.points;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const yAt = (s) => y0 + plotH * (1 - clamp01(s));
    if (pts.length >= 1) {
      const n = pts.length;
      const xAt = (i) => (n === 1 ? x0 : x0 + plotW * (i / (n - 1)));
      ctx.beginPath();
      pts.forEach((p, i) => {
        const X = xAt(i);
        const Y = yAt(p.sanity);
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      });
      ctx.strokeStyle = '#e5202e';
      ctx.lineWidth = compact ? 1.6 : 2.2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(229, 32, 46, 0.6)';
      ctx.shadowBlur = compact ? 4 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const last = pts[n - 1].sanity;
      ctx.beginPath();
      ctx.arc(xAt(n - 1), yAt(last), compact ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b73';
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(214, 236, 228, 0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('…', x0 + plotW / 2, y0 + plotH / 2);
    }
  }
}
