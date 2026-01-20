import { AsanaItem, AsanaPlanData } from "../pages/interface";


// Helper: Promise with timeout
export const withTimeout = (promise: Promise<any>, timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};



export const decodeBase64ToUint8Array = (value: string) => {
  const globalObj: any = typeof globalThis !== "undefined" ? globalThis : window;
  const atobFn =
    typeof globalObj !== "undefined" && typeof globalObj.atob === "function"
      ? globalObj.atob.bind(globalObj)
      : null;

  if (atobFn) {
    const binaryString = atobFn(value);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  if (globalObj?.Buffer) {
    return Uint8Array.from(globalObj.Buffer.from(value, "base64"));
  }

  throw new Error("Unable to decode base64 payload.");
};


  export const safeRevokeUrl = (url?: string) => {
  if (url?.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
};


export const mergePlanAsanas = (plan: AsanaPlanData): AsanaItem[] => {
  const lists: { type: string; items: AsanaItem[] }[] = [
    { type: "warmupSequences", items: plan.warmupSequences || [] },
    { type: "warmupException", items: plan.warmupException || [] },
    { type: "asanaList", items: plan.asanaList || [] },
    { type: "selectedPranayamaList", items: plan.selectedPranayamaList || [] },
  ];

  const seen = new Set<number>();
  const merged: AsanaItem[] = [];

  lists.forEach(({ type, items }) => {
    items?.forEach((asana) => {
      if (!asana || !asana.id) return;
      if (seen.has(asana.id)) return;
      seen.add(asana.id);
      merged.push({ ...asana, type });
    });
  });

  return merged;
};