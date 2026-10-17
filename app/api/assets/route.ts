import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const imageExtensions = new Set(["avif", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);

async function collectImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectImages(fullPath);
    const extension = path.extname(entry.name).slice(1).toLowerCase();
    return entry.isFile() && imageExtensions.has(extension) ? [fullPath] : [];
  }));
  return nestedFiles.flat();
}

export async function GET() {
  const assetDirectory = path.join(process.cwd(), "public", "assets");
  const filePaths = await collectImages(assetDirectory);
  const assets = filePaths
    .map((filePath) => {
      const relativePath = path.relative(assetDirectory, filePath);
      const extension = path.extname(relativePath).slice(1).toLowerCase();
      const fileName = path.basename(relativePath, path.extname(relativePath));
      const encodedPath = relativePath.split(path.sep).map(encodeURIComponent).join("/");
      return {
        name: fileName.replace(/[_-]+/g, " ").trim(),
        path: `/assets/${encodedPath}`,
        extension,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return NextResponse.json({ assets }, { headers: { "Cache-Control": "private, max-age=300" } });
}
