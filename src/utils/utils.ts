import { EnumResponse, EnumValue } from "../pages/interface";
import { CapacitorHttp } from "@capacitor/core";
import { isNativeRuntime } from "./platform";
import { Preferences } from "@capacitor/preferences";
import { API_ROOT, ASANA_PLAN_CACHE_KEY, EXTERNAL_GENERATE_ASANA_PLAN, GET_ASANA_PLAN } from "../constants";

export const extractActiveEnumNames = (values: EnumValue[]): string[] => {
  const unique: string[] = [];

  values.forEach((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) unique.push(trimmed);
      return;
    }

    if (value && typeof value === "object") {
      const { name, status } = value;
      if (
        typeof name === "string" &&
        (!status || (typeof status === "string" && status.toUpperCase() === "ACTIVE"))
      ) {
        const trimmed = name.trim();
        if (trimmed) {
          unique.push(trimmed);
        }
      }
    }
  });

  return Array.from(new Set(unique));
};

export const parseResponseData = (value: unknown) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const commaIndex = reader.result.indexOf(",");
        resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result);
      } else {
        reject(new Error("Unable to read file."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

export const normalizeImageString = (value: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("data:") ? trimmed : `data:image/jpeg;base64,${trimmed}`;
};


export const imageFieldsToCheck = [
  "image",
  "profileImage",
  "imageUrl",
  "profileImageUrl",
  "photo",
  "profilePicture",
] as const;

export const extractImageFromPayload = (payload: unknown): string | null => {
  if (typeof payload === "string") {
    return normalizeImageString(payload);
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  for (const field of imageFieldsToCheck) {
    const value = (payload as any)[field];
    if (typeof value === "string") {
      const normalized = normalizeImageString(value);
      if (normalized) return normalized;
    }
  }

  return null;
};

export const getJson = async (url: string, signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("The request was aborted.", "AbortError");
  }

  if (isNativeRuntime()) {
    const response = await CapacitorHttp.get({ url });
    const parsed =
      typeof response.data === "string"
        ? (() => {
            try {
              return JSON.parse(response.data);
            } catch {
              return response.data;
            }
          })()
        : response.data;

    return { status: response.status, data: parsed };
  }

  const res = await fetch(url, { signal });
  const data = await res.json();
  return { status: res.status, data };
};

export const fetchEnumGroup = async (groupName: string, signal: AbortSignal) => {
  const encodedGroup = encodeURIComponent(groupName.trim());
  const { status, data } = await getJson(`${API_ROOT}/api/v1/enum/${encodedGroup}`, signal);
  if (status < 200 || status >= 300) {
    throw new Error(`Request for ${groupName} failed with status ${status}`);
  }

  let values: EnumValue[] | null = null;

  if (Array.isArray(data)) {
    values = data as EnumValue[];
  } else if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as EnumResponse).values)
  ) {
    values = (data as EnumResponse).values as EnumValue[];
  }

  if (!values) {
    throw new Error(`Unexpected response for enum group ${groupName}`);
  }

  return extractActiveEnumNames(values);
};

export const persistAsanaPlanResponse = async (userId: number, plan: unknown) => {
  try {
    await Preferences.set({
      key: ASANA_PLAN_CACHE_KEY,
      value: JSON.stringify({
        userId,
        fetchedAt: new Date().toISOString(),
        plan,
      }),
    });
  } catch (error) {
    console.warn("Unable to cache personalised asana plan response", error);
  }
};

export const fetchAndCacheAsanaPlan = async (userId: number, token: string) => {
  const url = `${EXTERNAL_GENERATE_ASANA_PLAN}/${userId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const payloadText = await res.text();
  let parsed: any = {};
  if (payloadText) {
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      parsed = payloadText;
    }
  }

  if (res.status < 200 || res.status >= 300) {
    const message =
      (parsed && typeof parsed === "object" && parsed.message) ||
      (typeof parsed === "string" && parsed.trim()) ||
      `Failed to fetch personalised plan (status: ${res.status})`;
    throw new Error(message);
  }

  await persistAsanaPlanResponse(userId, parsed);
  return parsed;
};

export const generateAndCacheAsanaPlan = async (userId: number, token: string) => {
  const url = GET_ASANA_PLAN;
  const payload = { userId };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  let status = 0;
  let parsed: any = null;

  if (isNativeRuntime()) {
    const res = await CapacitorHttp.post({
      url,
      headers,
      data: payload,
    });
    status = res.status;
    parsed = parseResponseData(res.data);
  } else {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    status = res.status;
    const raw = await res.text();
    parsed = parseResponseData(raw);
  }

  if (status < 200 || status >= 300) {
    const message =
      (parsed && typeof parsed === "object" && parsed.message) ||
      (typeof parsed === "string" && parsed.trim()) ||
      `Failed to generate personalised plan (status: ${status})`;
    throw new Error(message);
  }

  await persistAsanaPlanResponse(userId, parsed);
  return parsed;
};
