// Réduit une image choisie par le Conclave pour la ranger dans la base :
// côté le plus long ramené à `maxSide`, puis WebP (ou JPEG) assez compressé
// pour tenir sous `budget` caractères de data URL.

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible : essaie un fichier PNG, JPEG ou WebP.'));
    };
    img.src = url;
  });
}

export async function fileToPortrait(file: File, maxSide = 900, budget = 420_000): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.type)) {
    throw new Error('Ce fichier n’est pas une image (PNG, JPEG, WebP ou GIF).');
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('Image trop lourde (25 Mo maximum).');
  const img = await loadImage(file);
  let scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ton navigateur ne peut pas préparer l’image.');

  for (let pass = 0; pass < 6; pass++) {
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = '#0c0a0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.86, 0.76, 0.66, 0.56]) {
      let url = canvas.toDataURL('image/webp', q);
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= budget) return url;
    }
    scale *= 0.75;
  }
  throw new Error('Impossible de réduire assez cette image : choisis-en une plus petite.');
}
