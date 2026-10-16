const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sword: '<path d="m5 3 4 1 10 10-5 5L4 9 3 5Z M12 20l8-8 M16 16l5 5 M19 22l3-3"/>',
  sliders: '<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h3m4 0h9"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  list: '<path d="M9 5h11M9 12h11M9 19h11m-16-1 1 1 2-3m-3-5 1 1 2-3m-3-5 1 1 2-3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M14 2H5v20h14V7Z M14 2v5h5M8 12h8m-8 4h6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z M8 12l3 3 5-6"/>',
  link: '<path d="m10 13 4-4m-7 6-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m5 3 1-1a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0"/>',
  box: '<path d="m3 7 9-5 9 5v11l-9 4-9-4Z M3 7l9 5 9-5M12 12v10m-5-17 9 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
