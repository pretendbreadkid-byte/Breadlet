// Browser-side: turns an uploaded file into a base64 data URL short enough for the server to
// accept. Files that already fit are kept as they are, so small GIFs still animate.
const SERVER_TYPES = /^image\/(png|gif|jpeg|webp)$/;
const SIZE_STEPS = [1, 0.75, 0.5, 0.35, 0.25];
const QUALITIES = [0.85, 0.7, 0.5, 0.35];
const UNREADABLE = "Could not read that image. Try a PNG or JPEG.";

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function decode(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error(UNREADABLE); });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(UNREADABLE);
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrinkImage(file: File, { maxLength, maxSide }: { maxLength: number; maxSide: number }) {
  // Base64 is a third longer than the file.
  if (SERVER_TYPES.test(file.type) && (file.size * 4) / 3 + 40 <= maxLength) return readDataUrl(file);
  const image = await decode(file);
  const fit = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error(UNREADABLE);
  // Safari can't write webp and falls back to png, so it gets jpeg on a white background instead.
  const webp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  for (const step of SIZE_STEPS) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * fit * step));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * fit * step));
    if (!webp) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of QUALITIES) {
      const data = canvas.toDataURL(webp ? "image/webp" : "image/jpeg", quality);
      if (data.length <= maxLength) return data;
    }
  }
  throw new Error("That image is too big to upload. Try a smaller one.");
}
