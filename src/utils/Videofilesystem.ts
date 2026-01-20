// src/utils/videoFileSystem.ts

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

export const VIDEO_DIR = "asana-videos";

/* ===================== HELPERS ===================== */

/**
 * Convert Uint8Array → Base64 string
 * Required for Capacitor native filesystem
 */
const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
  }

  return btoa(binary);
};


/* ===================== PUBLIC API ===================== */

/** Build file path per asana + resolution */
export const getVideoFileName = (
  asanaCode: string,
  resolution: "1080p" | "720p"
): string => `${VIDEO_DIR}/${asanaCode}_${resolution}.mp4`;

/** Check if video already exists in filesystem */
export const getCachedVideoUrl = async (
  path: string,
  returnFileUri: boolean = false
): Promise<string | null> => {
  try {
    const stat = await Filesystem.stat({
      path,
      directory: Directory.Data,
    });
    console.log("[FS] Stat result:", stat);

    if (!stat?.uri) return null;

    if (returnFileUri) {
      return stat.uri;
    }

    // Convert native file URI to playable URL
    return Capacitor.convertFileSrc(stat.uri);
  } catch (err) {
    console.warn("[FS] Video not found in cache:", path, err);
    return null;
  }
};

/** Save video bytes to filesystem (Native-safe) */
export const saveVideoToFS = async (
  path: string,
  data: Uint8Array | string
): Promise<void> => {
  const base64 = typeof data === "string" ? data : uint8ArrayToBase64(data);

  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data: base64, //  MUST be base64 string on native
    recursive: true,
  });
};
