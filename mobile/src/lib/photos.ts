import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_EDGE = 1280;
const MAX_DATA_URI = 500_000;

export type PreparedPhoto = {
  uri: string;
  imageBase64: string;
  mimeType: "image/jpeg";
};

export async function preparePlatePhoto(uri: string, width?: number | null): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  try {
    if (!width || width > MAX_EDGE) context.resize({ width: MAX_EDGE });
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        compress: 0.7,
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

function release(value: { release?: () => void }): void {
  try {
    value.release?.();
  } catch {
    // The image may already have been released.
  }
}
