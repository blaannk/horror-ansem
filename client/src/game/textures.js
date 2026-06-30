import * as THREE from 'three';

// Génère, sur un <canvas>, un papier peint « crypto » vintage : symboles ₿/Ξ/$,
// mentions HODL/BONK, mini-graphiques en chandeliers... puis on le DÉLAVE
// (lavis translucide, taches) et on le DÉCHIRE (trous sombres à bords arrachés,
// rayures, vignettage). Renvoie une CanvasTexture prête pour un matériau Three.js.

export function makeCryptoWallTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // --- Fond papier peint délavé ---
  ctx.fillStyle = '#4a4636';
  ctx.fillRect(0, 0, size, size);

  // Bandes verticales façon lés de papier peint.
  for (let x = 0; x < size; x += 64) {
    ctx.fillStyle = (x / 64) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, 0, 64, size);
  }

  // --- Motifs crypto en grille ---
  const motifs = ['₿', 'Ξ', '$', '%', 'HODL', 'BONK'];
  const grid = 6;
  const cellp = size / grid;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const offset = gy % 2 ? 1 : 0;
      const m = motifs[(gx + gy * 2 + offset) % motifs.length];
      const cx = gx * cellp + cellp / 2 + (gy % 2 ? cellp / 2 : 0);
      const cy = gy * cellp + cellp / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(gx % 2 ? 0.06 : -0.06);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#9a9270';
      const fs = m.length > 1 ? cellp * 0.26 : cellp * 0.58;
      ctx.font = `bold ${fs}px Georgia, "Times New Roman", serif`;
      ctx.fillText(m, 0, 0);
      ctx.restore();
    }
  }

  // --- Mini graphiques en chandeliers ---
  const chart = (x, y, w, h) => {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(x, y);
    const n = 9;
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      const up = Math.random() > 0.5;
      ctx.strokeStyle = up ? '#4f8a5c' : '#8a4f4f';
      ctx.fillStyle = ctx.strokeStyle;
      const ch = Math.random() * h * 0.5 + h * 0.12;
      const cyy = Math.random() * (h - ch);
      ctx.fillRect(i * cw + cw * 0.2, cyy, cw * 0.6, ch);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(i * cw + cw * 0.5, cyy - h * 0.1);
      ctx.lineTo(i * cw + cw * 0.5, cyy + ch + h * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  };
  chart(size * 0.08, size * 0.72, size * 0.32, size * 0.18);
  chart(size * 0.56, size * 0.12, size * 0.32, size * 0.18);

  // --- DÉLAVÉ : lavis translucide + taches d'humidité ---
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#3b3a30';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 130 + 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5 ? '42,28,14' : '18,24,16';
    g.addColorStop(0, `rgba(${dark},0.28)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // --- DÉCHIRÉ : trous au mur, bords de papier arrachés ---
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const pts = 7 + ((Math.random() * 4) | 0);
    const rad = Math.random() * 70 + 45;
    ctx.beginPath();
    for (let p = 0; p <= pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      const rr = rad * (0.45 + Math.random() * 0.75);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#0c0b09'; // mur sombre dessous
    ctx.fill();
    ctx.strokeStyle = 'rgba(205,193,150,0.55)'; // bord de papier clair arraché
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- Rayures ---
  for (let i = 0; i < 45; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    ctx.lineWidth = Math.random() * 2;
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 130, y + (Math.random() - 0.5) * 130);
    ctx.stroke();
  }

  // --- Vignettage (assombrit les bords pour casser le raccord) ---
  const vg = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Plafond : béton sombre taché (pour que le plafond ne soit pas un aplat noir non texturé).
export function makeCeilingTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, size, size);
  // Dalles.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  // Taches d'humidité.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 34 + 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${20 + (Math.random() * 14) | 0},${18},${14},0.5)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Panneau « CONTRÔLES » peint sur le mur de la salle de spawn.
// Les libellés reflètent l'inversion gauche/droite réellement en vigueur.
export function makeControlsTexture() {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Fond ardoise sombre + cadre.
  ctx.fillStyle = '#0e0f14';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,210,150,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdca8';
  ctx.font = 'bold 86px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('CONTRÔLES', w / 2, 96);

  const rows = [
    ['Avancer', 'Z / W / ↑'],
    ['Reculer', 'S / ↓'],
    ['Aller à GAUCHE', 'D / →'],
    ['Aller à DROITE', 'Q / A / ←'],
    ['Sprint', 'Maj (Shift)'],
    ['Regarder', 'Souris'],
    ['Pause', 'Échap'],
  ];
  ctx.font = '44px Georgia, "Times New Roman", serif';
  let y = 192;
  for (const [label, keys] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d7d2c4';
    ctx.fillText(label, 90, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9ad7ff';
    ctx.fillText(keys, w - 90, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, y + 30);
    ctx.lineTo(w - 90, y + 30);
    ctx.stroke();
    y += 62;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff7a7a';
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText('⚠ gauche et droite sont inversées', w / 2, h - 56);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Écran cassé qui n'affiche qu'une phrase (ex. « Buy the dip. »).
export function makeBrokenScreenTexture(text = 'Buy the dip.') {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#020403';
  ctx.fillRect(0, 0, w, h);
  // Lueur d'écran.
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, 'rgba(20,60,40,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Texte phosphore vert.
  ctx.fillStyle = '#39ff9b';
  ctx.font = 'bold 96px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#39ff9b';
  ctx.shadowBlur = 24;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;

  // Fissures (lignes claires partant d'un impact).
  const ix = w * 0.66;
  const iy = h * 0.4;
  ctx.strokeStyle = 'rgba(220,235,230,0.85)';
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = Math.random() * 2.5 + 0.5;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    let x = ix;
    let y = iy;
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const segs = 3 + ((Math.random() * 3) | 0);
    for (let s = 0; s < segs; s++) {
      x += Math.cos(a + (Math.random() - 0.5)) * (40 + Math.random() * 90);
      y += Math.sin(a + (Math.random() - 0.5)) * (40 + Math.random() * 90);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Zone morte noire de l'impact.
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(ix, iy, 26, 0, Math.PI * 2);
  ctx.fill();

  // Lignes de balayage.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Graphique crypto en chute libre (chandeliers rouges + courbe qui s'effondre).
export function makeChartTexture() {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0d08';
  ctx.fillRect(0, 0, w, h);
  // Grille.
  ctx.strokeStyle = 'rgba(120,120,90,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * w;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, h);
    ctx.moveTo(0, p);
    ctx.lineTo(w, p);
    ctx.stroke();
  }

  // Courbe qui s'effondre + chandeliers majoritairement rouges.
  const n = 22;
  const cw = w / n;
  let y = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let i = 0; i < n; i++) {
    const drop = (i / n) ** 1.6; // accélère la chute
    const target = h * (0.18 + drop * 0.7);
    y += (target - y) * 0.6 + (Math.random() - 0.5) * 26;
    const x = i * cw + cw / 2;
    const down = Math.random() > 0.18;
    ctx.strokeStyle = down ? '#e0473a' : '#4f8a5c';
    ctx.fillStyle = ctx.strokeStyle;
    const bodyH = 8 + Math.random() * 26;
    ctx.fillRect(x - cw * 0.28, y, cw * 0.56, bodyH);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + bodyH + 10);
    ctx.stroke();
  }
  // Ligne de tendance rouge vif.
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff3b30';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  let ly = h * 0.16;
  ctx.moveTo(0, ly);
  for (let i = 0; i <= n; i++) {
    const drop = (i / n) ** 1.6;
    ly = h * (0.16 + drop * 0.74) + (Math.random() - 0.5) * 10;
    ctx.lineTo((i / n) * w, ly);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Pourcentage.
  ctx.fillStyle = '#ff5b50';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`-${80 + ((Math.random() * 18) | 0)}%`, w - 16, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Affiche « RECHERCHÉ » placée à côté des photos d'Ansem dans la salle de réveil.
export function makeAnsemPosterTexture() {
  const w = 512;
  const h = 700;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d8cfa6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  ctx.fillStyle = '#1c160c';
  ctx.textAlign = 'center';
  ctx.font = 'bold 86px Georgia, serif';
  ctx.fillText('RECHERCHÉ', w / 2, 96);

  // Emplacement photo (le portrait réel est un plan séparé par-dessus).
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(w / 2 - 170, 150, 340, 340);

  ctx.fillStyle = '#1c160c';
  ctx.font = 'bold 70px Georgia, serif';
  ctx.fillText('ANSEM', w / 2, 545);
  ctx.font = 'italic 36px Georgia, serif';
  ctx.fillText('« Buy the dip. »', w / 2, 600);
  ctx.font = '26px Georgia, serif';
  ctx.fillText('Ne le laissez pas vous rattraper.', w / 2, 648);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
