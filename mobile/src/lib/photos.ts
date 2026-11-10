import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.6;
const MAX_DATA_URI = 500_000;

export type PreparedPhoto = {
  uri: string;
  imageBase64: string;
  mimeType: "image/jpeg";
};

export async function preparePlatePhoto(
  uri: string,
  width?: number | null,
  height?: number | null,
): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const resize = resizeToLongestSide(width, height);
    if (resize) context.resize(resize);
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        compress: JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!saved.base64) throw new Error("Could not read that photo.");
      return { uri: saved.uri, imageBase64: saved.base64, mimeType: "image/jpeg" };
    } finally {
      release(rendered);
    }
  } finally {
    release(context);
  }
}

export async function persistMealPhoto(sourceUri: string, id: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.document, "meals");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${id}.jpg`);
    if (dest.exists) dest.delete();
    const source = new File(sourceUri);
    await source.copy(dest);
    return dest.uri;
  } catch {
    if (sourceUri.startsWith("data:") && sourceUri.length <= MAX_DATA_URI) return sourceUri;
    if (sourceUri.startsWith("file:")) return sourceUri;
    return null;
  }
}

export function deleteStoredPhoto(uri: string | null): void {
  if (!uri || !uri.includes("/meals/")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing photo should not block deleting the log entry.
  }
}

/** Scale so the longest side is about 1024px. An unknown size still caps the width. */
export function resizeToLongestSide(
  width?: number | null,
  height?: number | null,
): { width: number } | { height: number } | null {
  const w = width && width > 0 ? width : 0;
  const h = height && height > 0 ? height : 0;
  if (w && h) {
    if (Math.max(w, h) <= MAX_EDGE) return null;
    return w >= h ? { width: MAX_EDGE } : { height: MAX_EDGE };
  }
  if (w > MAX_EDGE) return { width: MAX_EDGE };
  if (h > MAX_EDGE) return { height: MAX_EDGE };
  if (!w && !h) return { width: MAX_EDGE };
  return null;
}

function release(value: { release?: () => void }): void {
  try {
    value.release?.();
  } catch {
    // The image may already have been released.
  }
}
