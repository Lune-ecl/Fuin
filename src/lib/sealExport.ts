import { BRUSH_FONT } from './sealDesign';

// Un SVG dessiné dans une image ne peut pas utiliser les polices de la page :
// on récupère auprès de Google Fonts un petit fichier ne contenant que les kanjis
// du sceau, et on l'intègre directement dans le SVG avant de le convertir en PNG.
async function embeddedFontCss(chars: string): Promise<string> {
  const unique = [...new Set([...chars].filter((c) => c.trim()))].join('');
  if (!unique) return '';
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(BRUSH_FONT).replace(/%20/g, '+')}&text=${encodeURIComponent(unique)}`;
    const css = await (await fetch(cssUrl)).text();
    const fontUrl = /url\((https:[^)]+)\)/.exec(css)?.[1];
    if (!fontUrl) return '';
    const bytes = new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const format = fontUrl.includes('.woff2') ? 'woff2' : fontUrl.includes('.woff') ? 'woff' : 'truetype';
    return `@font-face{font-family:'${BRUSH_FONT}';src:url(data:font/${format};base64,${btoa(bin)}) format('${format}');}`;
  } catch {
    return '';
  }
}

export async function sealToPngBlob(svg: string, size = 1024): Promise<Blob> {
  const text = svg.replace(/<[^>]+>/g, '');
  const fontCss = await embeddedFontCss(text);
  let s = svg.replace(/\swidth="[^"]*"\s+height="[^"]*"/, ` width="${size}" height="${size}"`);
  if (fontCss) s = s.replace(/(<svg[^>]*>)/, `$1<defs><style>${fontCss}</style></defs>`);

  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.clearRect(0, 0, size, size); // fond transparent
  ctx.drawImage(img, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion PNG impossible'))), 'image/png'),
  );
}

export async function downloadSealPng(svg: string, name: string, size = 1024) {
  const blob = await sealToPngBlob(svg, size);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'sceau'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
