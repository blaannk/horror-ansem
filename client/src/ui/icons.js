// Inline SVG icons (monochrome, drawn via currentColor) - replace the menu emojis
// for a more stylized look consistent with the horror/crypto theme. Each icon inherits the
// parent text color, so it's colored via CSS (var(--bonk), var(--accent)...).

const SVGS = {
  skull:
    '<path d="M5 10a7 7 0 0 1 14 0v3.7a2 2 0 0 1-1.4 1.9l-1.6.5V19a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.9l-1.6-.5A2 2 0 0 1 5 13.7V10Z"/>' +
    '<circle cx="9.2" cy="11" r="1.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="14.8" cy="11" r="1.6" fill="currentColor" stroke="none"/>' +
    '<path d="M9.6 20v-1.7M12 20v-1.7M14.4 20v-1.7"/>',
  trophy:
    '<path d="M6 4h12v3.5a6 6 0 0 1-12 0V4Z"/>' +
    '<path d="M6 5.5H3.5V7a3 3 0 0 0 3 3"/>' +
    '<path d="M18 5.5h2.5V7a3 3 0 0 1-3 3"/>' +
    '<path d="M12 13.5V17"/><path d="M8.5 20h7l-1-3h-5l-1 3Z"/>',
  'chart-up': '<path d="M3 17l5.5-5.5 3.5 3.5L21 6"/><path d="M15 6h6v6"/>',
  'chart-down': '<path d="M3 7l5.5 5.5 3.5-3.5L21 18"/><path d="M15 18h6v-6"/>',
  volume:
    '<path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z" fill="currentColor" stroke="none"/>' +
    '<path d="M15.5 9a3.8 3.8 0 0 1 0 6"/><path d="M17.8 6.6a7 7 0 0 1 0 10.8"/>',
  flame:
    '<path d="M12 3s4.6 3.4 4.6 8.5a4.6 4.6 0 0 1-9.2 0c0-1.6.6-3 1.6-4 .6 1 .7 2.3 1.8 2.6C13 8.2 11 6 12 3Z"/>',
  exit:
    '<path d="M13 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M4 12h9"/><path d="M10 8l4 4-4 4"/>',
};

export function icon(name, { size = 20, cls = '' } = {}) {
  const body = SVGS[name] || '';
  return (
    `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  );
}
