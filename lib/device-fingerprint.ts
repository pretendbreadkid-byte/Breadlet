// A fingerprint of this browser and computer (graphics card, canvas drawing, screen, timezone...).
// Unlike the device ID cookie it stays the same in a private window or after clearing cookies,
// so a banned player can't make a new account just by doing that. Identical school computers can
// share one, so the server only uses it to block new signups (lib/network-identity.ts).
let cached: Promise<string> | null = null;

function canvasPart() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.textBaseline = "top";
    context.font = "16px 'Arial'";
    context.fillStyle = "#f60";
    context.fillRect(100, 1, 62, 20);
    context.fillStyle = "#069";
    context.fillText("Breadlet 🍞 fingerprint", 2, 15);
    context.fillStyle = "rgba(102, 204, 0, 0.7)";
    context.fillText("Breadlet 🍞 fingerprint", 4, 17);
    context.globalCompositeOperation = "multiply";
    context.beginPath();
    context.arc(50, 30, 20, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function webglPart() {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return [
      info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      (gl.getSupportedExtensions() || []).join(","),
    ].join("|");
  } catch {
    return "";
  }
}

async function compute() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const parts = [
    canvasPart(),
    webglPart(),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    (navigator.languages || []).join(","),
    navigator.platform,
    navigator.hardwareConcurrency,
    nav.deviceMemory || "",
    navigator.maxTouchPoints,
  ].join("##");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function deviceFingerprint(): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return Promise.resolve("");
  cached ||= compute().catch(() => "");
  return cached;
}
