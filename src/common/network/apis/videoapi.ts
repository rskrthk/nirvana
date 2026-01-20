import { CapacitorHttp, Capacitor } from "@capacitor/core";
import { API_CONFIG } from "../constants";
import { Preferences } from "@capacitor/preferences";
import { useCallback } from "react";

/**
 * Decode base64 into Uint8Array (needed for Capacitor)
 */
const decodeBase64ToUint8Array = (value: string) => {
  const globalObj: any = typeof globalThis !== "undefined" ? globalThis : window;
  const atobFn =
    typeof globalObj !== "undefined" && typeof globalObj.atob === "function"
      ? globalObj.atob.bind(globalObj)
      : null;

  if (atobFn) {
    const binaryString = atobFn(value);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  if (globalObj?.Buffer) {
    return Uint8Array.from(globalObj.Buffer.from(value, "base64"));
  }

  throw new Error("Unable to decode base64 payload.");
};


export async function fetchAsanaVideoBlob(
  asanaCode: string,
  resolution: string = "1080p",                   
): Promise<Blob> {

  const url = `${API_CONFIG.BASE_URL}/videos/stream/${asanaCode}`;

  // ---------------------------
  // WEB (Browser)
  // ---------------------------

  const { value: token } = await Preferences.get({
  key: "accessToken",
});

  if (Capacitor.getPlatform() === "web") {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "video/mp4",
        Authorization: `Bearer ${token}`,   // <-- REQUIRED
      },
    });

    if (!resp.ok) {
      throw new Error(`Web fetch error: ${resp.status}`);
    }

    return await resp.blob();
  }

  // ---------------------------
  // ANDROID / iOS (Capacitor)
  // ---------------------------
  const res = await CapacitorHttp.request({
    method: "GET",
    url,
    responseType: "arraybuffer",
    headers: {
      Accept: "video/mp4",
      Authorization: `Bearer ${token}`,     // <-- REQUIRED
    },
  });

  if (!(res.status === 206 || res.status === 200)) {
    throw new Error(`Capacitor HTTP error: ${res.status}`);
  }

  const payload = res.data;
  let blobSource: BlobPart;

  if (payload instanceof ArrayBuffer) {
    blobSource = payload;
  } else if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    blobSource = copy;
  } else if (typeof payload === "string") {
    blobSource = decodeBase64ToUint8Array(payload);
  } else {
    throw new Error("Unsupported Capacitor payload format");
  }

  return new Blob([blobSource], { type: "video/mp4" });
}


export const getIdFromPreferences = async () => {
  const result = await Preferences.get({ key: "onlineUserId" });
  console.log(result.value); // <- your stored value
};