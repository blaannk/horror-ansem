import * as THREE from 'three';

// Generates, on a <canvas>, a vintage "crypto" wallpaper: ₿/Ξ/$ symbols,
// HODL/BONK mentions, mini candlestick charts... then WASHES IT OUT
// (translucent wash, stains) and TEARS IT (dark holes with ragged edges,
// scratches, vignetting). Returns a CanvasTexture ready for a Three.js material.

export function makeCryptoWallTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // --- Faded wallpaper background ---
  ctx.fillStyle = '#4a4636';
  ctx.fillRect(0, 0, size, size);

  // Vertical stripes like wallpaper strips.
  for (let x = 0; x < size; x += 64) {
    ctx.fillStyle = (x / 64) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, 0, 64, size);
  }

  // --- Crypto motifs in a grid ---
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

  // --- Mini candlestick charts ---
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

  // --- WASHED OUT: translucent wash + damp stains ---
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

  // --- TORN: holes in the wall, ragged paper edges ---
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
    ctx.fillStyle = '#0c0b09'; // dark wall underneath
    ctx.fill();
    ctx.strokeStyle = 'rgba(205,193,150,0.55)'; // light torn paper edge
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- Scratches ---
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

  // --- Vignette (darkens the edges to break up the tiling seam) ---
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

// Soft radial halo (white -> transparent) reusable as an additive sprite (PEPE neon,
// campfire glow...). The color is applied via the sprite's material (color).
let _glowTex = null;
export function makeRadialGlowTexture() {
  if (_glowTex) return _glowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glowTex = new THREE.CanvasTexture(canvas);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// "Machine" metal panel (level 3): riveted plate, grid, hazard stripes, gauge,
// grime. Tileable for dressing the corridor walls.
let _machineTex = null;
export function makeMachinePanelTexture() {
  if (_machineTex) return _machineTex;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, s, s);
  // Plates (2x2) with seams.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, s - 8, s - 8);
  ctx.beginPath();
  ctx.moveTo(s / 2, 4);
  ctx.lineTo(s / 2, s - 4);
  ctx.moveTo(4, s / 2);
  ctx.lineTo(s - 4, s / 2);
  ctx.stroke();
  // Rivets.
  ctx.fillStyle = '#3a3e45';
  for (const [x, y] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16], [s / 2 - 12, s / 2], [s / 2 + 12, s / 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Yellow/black hazard stripe (at the bottom).
  for (let x = 8; x < s - 8; x += 24) {
    ctx.fillStyle = ((x / 24) | 0) % 2 ? '#c9a12a' : '#161510';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, s - 30, 24, 16);
    ctx.clip();
    ctx.translate(x, s - 30);
    ctx.fillRect(-10, 0, 44, 16);
    ctx.restore();
  }
  // Gauge (dial) + small screen.
  ctx.strokeStyle = '#5a5f68';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 70, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ff5a3a';
  ctx.beginPath();
  ctx.moveTo(64, 70);
  ctx.lineTo(76, 60);
  ctx.stroke();
  ctx.fillStyle = '#0a1a10';
  ctx.fillRect(150, 54, 60, 34);
  ctx.fillStyle = '#39ff9b';
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.fillText('ERR', 158, 76);
  // Grime.
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 22;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  _machineTex = new THREE.CanvasTexture(canvas);
  _machineTex.colorSpace = THREE.SRGBColorSpace;
  _machineTex.wrapS = _machineTex.wrapT = THREE.RepeatWrapping;
  _machineTex.anisotropy = 4;
  return _machineTex;
}

// "Maze" background for the menu: a real maze (recursive backtracker) drawn with dim
// neon lines on a dark background. Returns a data URL (CSS background-image).
let _mazeBg = null;
export function makeMazeBackgroundDataURL() {
  if (_mazeBg) return _mazeBg;
  const cols = 18;
  const rows = 18;
  const cs = 40;
  const w = cols * cs;
  const h = rows * cs;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070608';
  ctx.fillRect(0, 0, w, h);

  // Maze generation (walls per cell, carved via DFS).
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ n: true, e: true, s: true, w: true })));
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' };
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const nb = [];
    if (r > 0 && !seen[r - 1][c]) nb.push(['n', r - 1, c]);
    if (r < rows - 1 && !seen[r + 1][c]) nb.push(['s', r + 1, c]);
    if (c > 0 && !seen[r][c - 1]) nb.push(['w', r, c - 1]);
    if (c < cols - 1 && !seen[r][c + 1]) nb.push(['e', r, c + 1]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [dir, nr, nc] = nb[(Math.random() * nb.length) | 0];
    cells[r][c][dir] = false;
    cells[nr][nc][opp[dir]] = false;
    seen[nr][nc] = true;
    stack.push([nr, nc]);
  }

  // Drawing the walls (warm lines with a slight glow).
  ctx.strokeStyle = '#6a5330';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255,170,60,0.3)';
  ctx.shadowBlur = 4;
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cs;
      const y = r * cs;
      if (cells[r][c].n) line(x, y, x + cs, y);
      if (cells[r][c].w) line(x, y, x, y + cs);
      if (r === rows - 1 && cells[r][c].s) line(x, y + cs, x + cs, y + cs);
      if (c === cols - 1 && cells[r][c].e) line(x + cs, y, x + cs, y + cs);
    }
  }
  _mazeBg = canvas.toDataURL('image/png');
  return _mazeBg;
}

// Wood planks (for the chalet): vertical slats, grain, a few knots.
export function makeWoodTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a3f22';
  ctx.fillRect(0, 0, s, s);
  const planks = 4;
  const pw = s / planks;
  const shades = ['#5c4024', '#4f3820', '#63472a', '#563d22'];
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = shades[i % shades.length];
    ctx.fillRect(i * pw, 0, pw, s);
    // Dark seam between slats.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(i * pw, 0);
    ctx.lineTo(i * pw, s);
    ctx.stroke();
    // Grain.
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.09})`;
      ctx.lineWidth = 1 + Math.random();
      const x = i * pw + 5 + Math.random() * (pw - 10);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (Math.random() - 0.5) * 10, s / 3, x + (Math.random() - 0.5) * 10, (2 * s) / 3, x, s);
      ctx.stroke();
    }
  }
  // Knots.
  for (let k = 0; k < 3; k++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 4 + Math.random() * 5;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    gr.addColorStop(0, 'rgba(26,16,7,0.85)');
    gr.addColorStop(1, 'rgba(26,16,7,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Ceiling: stained dark concrete (so the ceiling isn't a flat, untextured black).
export function makeCeilingTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, size, size);
  // Slabs.
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
  // Damp stains.
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

// "CONTROLS" panel painted on the spawn room wall.
// The labels reflect the actual left/right inversion in effect.
export function makeControlsTexture() {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Dark slate background + frame.
  ctx.fillStyle = '#0e0f14';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,210,150,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdca8';
  ctx.font = 'bold 86px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('CONTROLS', w / 2, 96);

  const rows = [
    ['Move forward', 'Z / W / ↑'],
    ['Move back', 'S / ↓'],
    ['Go LEFT', 'D / →'],
    ['Go RIGHT', 'Q / A / ←'],
    ['Sprint', 'Shift'],
    ['Jump', 'Space'],
    ['Crouch', 'Ctrl / C'],
    ['Look', 'Mouse'],
    ['Pause', 'Esc'],
  ];
  ctx.font = '40px Georgia, "Times New Roman", serif';
  let y = 166;
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
    ctx.moveTo(90, y + 26);
    ctx.lineTo(w - 90, y + 26);
    ctx.stroke();
    y += 48;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff7a7a';
  ctx.font = 'italic 30px Georgia, serif';
  ctx.fillText('⚠ left and right are inverted', w / 2, h - 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Broken screen displaying just one phrase (e.g. "Buy the dip.").
export function makeBrokenScreenTexture(text = 'Buy the dip.') {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#020403';
  ctx.fillRect(0, 0, w, h);
  // Screen glow.
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, 'rgba(20,60,40,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Green phosphor text.
  ctx.fillStyle = '#39ff9b';
  ctx.font = 'bold 96px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#39ff9b';
  ctx.shadowBlur = 24;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;

  // Cracks (light lines radiating from an impact point).
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
  // Black dead zone at the impact point.
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(ix, iy, 26, 0, Math.PI * 2);
  ctx.fill();

  // Scan lines.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Crypto chart in free fall (red candlesticks + collapsing curve).
export function makeChartTexture() {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0d08';
  ctx.fillRect(0, 0, w, h);
  // Grid.
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

  // Collapsing curve + mostly red candlesticks.
  const n = 22;
  const cw = w / n;
  let y = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let i = 0; i < n; i++) {
    const drop = (i / n) ** 1.6; // accelerates the fall
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
  // Bright red trend line.
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

  // Percentage.
  ctx.fillStyle = '#ff5b50';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`-${80 + ((Math.random() * 18) | 0)}%`, w - 16, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Plaque/caption under a painting (dark band, engraved text).
export function makeCaptionTexture(text) {
  const w = 640;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#161009';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#8a6a34';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8d3a6';
  ctx.font = 'italic 40px Georgia, serif';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Scribbled lore note, hung on the chalet walls (charcoal on stained wood).
export function makeChaletLoreTexture(variant = 0) {
  const w = 640;
  const h = 780;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Dirty paper.
  ctx.fillStyle = '#1c1a15';
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w);
  vg.addColorStop(0, 'rgba(60,52,34,0.35)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // Stains.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 20 + Math.random() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,8,4,0.4)');
    g.addColorStop(1, 'rgba(20,8,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  const sets = [
    {
      title: 'BONK',
      color: '#e0c48a',
      lines: [
        'He was Ansem’s dog.',
        'A loyal shiba. Once.',
        '',
        'Then the rot took Ansem…',
        'and it took BONK too.',
        '',
        'He still wears his collar,',
        'out there in the dark.',
      ],
    },
    {
      title: 'THE LIGHT',
      color: '#cbb98f',
      lines: [
        'BONK fears fire and light.',
        'The flames keep him back.',
        '',
        'Stay in the glow.',
        'Run from fire to fire.',
        '',
        'Whatever you do,',
        'never stop in the dark.',
      ],
    },
    {
      title: 'MY MISTAKE',
      color: '#d3a9a9',
      lines: [
        'I cut my lamp. One second.',
        'One.',
        '',
        'His eyes were already there.',
        'Two holes of pale light.',
        '',
        'You cannot outrun him…',
        'you can only reach the fire.',
      ],
    },
    {
      title: 'HUNGER',
      color: '#cbb98f',
      lines: [
        'He does not eat.',
        'He does not tire.',
        '',
        'He only wants to catch you,',
        'to drag you into the dark',
        'where the fires never reach.',
        '',
        'Keep running.',
      ],
    },
    {
      title: 'DON’T LOOK',
      color: '#d3a9a9',
      lines: [
        'If you hear his steps,',
        'do not turn to look.',
        '',
        'Run for the light.',
        'The fire is the only wall',
        'he cannot cross.',
      ],
    },
  ];
  const s = sets[variant % sets.length];

  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8c49a';
  ctx.font = 'bold 58px Georgia, serif';
  ctx.fillText(s.title, w / 2, 80);

  ctx.textAlign = 'left';
  ctx.font = '34px "Courier New", monospace';
  let y = 165;
  for (const line of s.lines) {
    ctx.save();
    ctx.translate(60, y);
    ctx.rotate((Math.random() - 0.5) * 0.02);
    ctx.fillStyle = s.color;
    ctx.fillText(line, 0, 0);
    ctx.restore();
    y += 58;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// BONK's face for the full-screen screamer (menacing dog-beast, red eyes, fangs).
// Returns a data URL (used as an <img> src).
let _bonkFace = null;
export function makeBonkFaceDataURL() {
  if (_bonkFace) return _bonkFace;
  const s = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  // Dark vignetted background.
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, s, s);
  const vg = ctx.createRadialGradient(s / 2, s / 2, 60, s / 2, s / 2, s * 0.72);
  vg.addColorStop(0, 'rgba(60,30,10,0.5)');
  vg.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, s, s);

  const cx = s / 2;
  // Pointed ears.
  ctx.fillStyle = '#8a6b32';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * 130, 150);
    ctx.lineTo(cx + dir * 70, 40);
    ctx.lineTo(cx + dir * 20, 160);
    ctx.closePath();
    ctx.fill();
  }
  // Head (tawny).
  ctx.fillStyle = '#c39a54';
  ctx.beginPath();
  ctx.ellipse(cx, 300, 170, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  // Light muzzle.
  ctx.fillStyle = '#e6cc90';
  ctx.beginPath();
  ctx.ellipse(cx, 380, 95, 105, 0, 0, Math.PI * 2);
  ctx.fill();

  // Luminous red eyes.
  ctx.shadowColor = '#ff2a10';
  ctx.shadowBlur = 40;
  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#ff3b1a';
    ctx.beginPath();
    ctx.ellipse(cx + dir * 78, 265, 40, 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Slit pupils.
  ctx.fillStyle = '#160000';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * 78, 265, 9, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose (snout).
  ctx.fillStyle = '#0c0a08';
  ctx.beginPath();
  ctx.ellipse(cx, 360, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Open jaw + fangs.
  ctx.fillStyle = '#180404';
  ctx.beginPath();
  ctx.ellipse(cx, 445, 78, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f0e6';
  for (let i = -2; i <= 2; i++) {
    // Top fangs.
    ctx.beginPath();
    ctx.moveTo(cx + i * 28 - 12, 410);
    ctx.lineTo(cx + i * 28 + 12, 410);
    ctx.lineTo(cx + i * 28, 448);
    ctx.closePath();
    ctx.fill();
    // Bottom fangs.
    ctx.beginPath();
    ctx.moveTo(cx + i * 28 - 12, 485);
    ctx.lineTo(cx + i * 28 + 12, 485);
    ctx.lineTo(cx + i * 28, 452);
    ctx.closePath();
    ctx.fill();
  }

  _bonkFace = canvas.toDataURL('image/png');
  return _bonkFace;
}

// Painting hung in the chalet: explains the forest level's rules.
export function makeChaletBoardTexture() {
  const w = 1024;
  const h = 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Dark wood background + light frame.
  ctx.fillStyle = '#20160d';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.33, y + (Math.random() - 0.5) * 12, w * 0.66, y + (Math.random() - 0.5) * 12, w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c8a86a';
  ctx.lineWidth = 12;
  ctx.strokeRect(26, 26, w - 52, h - 52);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd9a0';
  ctx.font = 'bold 66px Georgia, serif';
  ctx.fillText('THE FOREST', w / 2, 74);

  ctx.textAlign = 'left';
  ctx.font = '34px Georgia, serif';
  ctx.fillStyle = '#e9d9bf';
  const lines = [
    '• Cross the forest to the way out',
    '   (the blue glow, far ahead).',
    '• It is pitch black, follow the FIRES.',
    '• By a fire you are SAFE:',
    '   BONK cannot reach you there.',
  ];
  let y = 150;
  for (const line of lines) {
    ctx.fillText(line, 70, y);
    y += 52;
  }

  ctx.fillStyle = '#ff9a5a';
  ctx.font = 'bold 38px Georgia, serif';
  ctx.fillText('HOW TO SURVIVE', 70, y + 12);
  y += 60;
  ctx.fillStyle = '#e9d9bf';
  ctx.font = '34px Georgia, serif';
  const tips = [
    '• Run from fire to fire. Never stop.',
    '• He stalks the dark, then CHARGES…',
    '   listen to his steps grow louder.',
    '• When he charges, sprint to a fire.',
  ];
  for (const line of tips) {
    ctx.fillText(line, 70, y);
    y += 50;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff8a5a';
  ctx.font = 'italic 30px Georgia, serif';
  ctx.fillText('“Don’t let him catch you.”', w / 2, h - 40);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// "HIDE" panel in the starting room: explains that you can hide in a corner,
// flashlight off, so Ansem can no longer spot you.
export function makeHideHintTexture() {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, 'rgba(40,60,50,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,255,180,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7dffb0';
  ctx.shadowColor = '#39ff9b';
  ctx.shadowBlur = 22;
  ctx.font = 'bold 92px Georgia, serif';
  ctx.fillText('HIDE', w / 2, 110);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#dfe6df';
  ctx.font = '46px Georgia, serif';
  const lines = [
    'If he chases and closes in:',
    'press into a CORNER,',
    'switch off your flashlight  [F],',
    'and don’t move.',
  ];
  let y = 240;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 74;
  }
  ctx.fillStyle = '#ff9a6a';
  ctx.font = 'italic 40px Georgia, serif';
  ctx.fillText('In the dark, he can’t see you.', w / 2, h - 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// "EXIT" panel with a big downward arrow, placed above the exit hole.
export function makeExitSignTexture() {
  const w = 512;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Dark metal plate + frame.
  ctx.fillStyle = '#0a0e0c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(60,255,150,0.55)';
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  // EXIT text (bright neon green).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#57ff9b';
  ctx.shadowColor = '#39ff88';
  ctx.shadowBlur = 30;
  ctx.font = 'bold 190px Arial, sans-serif';
  ctx.fillText('EXIT', w / 2, 170);

  // Big downward arrow (pointing at the hole).
  ctx.beginPath();
  const cx = w / 2;
  ctx.moveTo(cx - 90, 300);
  ctx.lineTo(cx + 90, 300);
  ctx.lineTo(cx + 90, 430);
  ctx.lineTo(cx + 150, 430);
  ctx.lineTo(cx, 560);
  ctx.lineTo(cx - 150, 430);
  ctx.lineTo(cx - 90, 430);
  ctx.closePath();
  ctx.fillStyle = '#57ff9b';
  ctx.fill();
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// "WANTED" poster placed next to Ansem's photos in the wakeup room.
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
  ctx.fillText('WANTED', w / 2, 96);

  // Photo placeholder (the actual portrait is a separate plane layered on top).
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(w / 2 - 170, 150, 340, 340);

  ctx.fillStyle = '#1c160c';
  ctx.font = 'bold 70px Georgia, serif';
  ctx.fillText('ANSEM', w / 2, 545);
  ctx.font = 'italic 36px Georgia, serif';
  ctx.fillText('“Buy the dip.”', w / 2, 600);
  ctx.font = '26px Georgia, serif';
  ctx.fillText('Don’t let him catch you.', w / 2, 648);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Claw marks: ALPHA texture (transparent background) to apply on a plane against a wall.
// A "claw swipe" = a bundle of 3-4 parallel gashes (dark gouge + torn light-colored
// lip). 1-2 are drawn per call, randomly oriented, to vary each wall.
export function makeClawMarksTexture(seed = 0) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // deterministic rand based on the seed (avoids Math.random for reproducible walls).
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  const swipe = (cx, cy, ang, len, n) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.lineCap = 'round';
    const spread = 22 + rnd() * 16;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread * (0.85 + rnd() * 0.3);
      const bow = (rnd() - 0.5) * len * 0.25; // curvature of the gash
      const w = 3 + rnd() * 4;
      // Dark gouge.
      ctx.strokeStyle = `rgba(8,5,4,${0.55 + rnd() * 0.3})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(-len / 2, off);
      ctx.quadraticCurveTo(0, off + bow, len / 2, off + (rnd() - 0.5) * 10);
      ctx.stroke();
      // Torn light-colored lip (offset), for depth.
      ctx.strokeStyle = `rgba(210,190,160,${0.12 + rnd() * 0.12})`;
      ctx.lineWidth = Math.max(1, w * 0.4);
      ctx.beginPath();
      ctx.moveTo(-len / 2, off - w * 0.5);
      ctx.quadraticCurveTo(0, off + bow - w * 0.5, len / 2, off - w * 0.5 + (rnd() - 0.5) * 10);
      ctx.stroke();
    }
    ctx.restore();
  };

  const swipes = 1 + ((rnd() * 2) | 0);
  for (let i = 0; i < swipes; i++) {
    swipe(
      size * (0.3 + rnd() * 0.4),
      size * (0.3 + rnd() * 0.4),
      (rnd() - 0.5) * 1.4 + Math.PI / 2,
      size * (0.5 + rnd() * 0.35),
      3 + ((rnd() * 2) | 0)
    );
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Mine rock: dark rocky wall (irregular slabs + cracks + light-colored flecks).
// Modeled on makeWoodTexture / makeCeilingTexture (canvas -> tileable CanvasTexture).
export function makeRockTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3730';
  ctx.fillRect(0, 0, s, s);
  // Stone blocks (slabs) lightly tinted.
  const shades = ['#403c34', '#34312b', '#454037', '#2f2c26', '#3b372f'];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = shades[i % shades.length];
    const w = 30 + Math.random() * 70;
    const h = 22 + Math.random() * 44;
    ctx.fillRect(Math.random() * s, Math.random() * s, w, h);
  }
  // Dark seams/cracks.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = 0.6 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
    ctx.stroke();
  }
  // Light-colored mineral flecks (pitting).
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(150,140,120,${0.05 + Math.random() * 0.12})`;
    const r = Math.random() * 2.2;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dark damp stains (radial gradients).
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 30 + Math.random() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,10,12,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Chalet explanatory panel: "stay in the light - BONK fears fire".
export function makeFireHintTexture() {
  const w = 760; // wider -> so the title fits fully
  const h = 440;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Dark wood background + frame.
  ctx.fillStyle = '#241a10';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 40 + 5, 2);
  }
  ctx.strokeStyle = '#5a3f22';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Title.
  ctx.fillStyle = '#ffcf6a';
  ctx.shadowColor = '#ff8a2a';
  ctx.shadowBlur = 24;
  ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
  ctx.fillText('STAY IN THE LIGHT', w / 2, 88);
  ctx.shadowBlur = 0;

  // Simple drawn flame in the center.
  const fx = w / 2;
  const fy = 210;
  const flame = ctx.createRadialGradient(fx, fy + 20, 4, fx, fy, 70);
  flame.addColorStop(0, '#fff2b0');
  flame.addColorStop(0.4, '#ffb028');
  flame.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(fx, fy - 70);
  ctx.quadraticCurveTo(fx + 55, fy, fx, fy + 60);
  ctx.quadraticCurveTo(fx - 55, fy, fx, fy - 70);
  ctx.fill();

  // Explanatory text.
  ctx.fillStyle = '#e9d9bd';
  ctx.font = '30px Georgia, serif';
  ctx.fillText('BONK fears the fire.', w / 2, 300);
  ctx.fillText('Run campfire to campfire.', w / 2, 342);
  ctx.fillStyle = '#c99';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('In the dark, he hunts you.', w / 2, 388);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
