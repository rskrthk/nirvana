import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { USER_ATTENDANCE } from "../../../constants";

export type AttendancePayload = {
  attendanceDate: string;
  progressNotes: string;
  totalTimeSpent: number;
};

const postWeb = async (url: string, token: string, body: any) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
};

const postNative = async (url: string, token: string, body: any) => {
  return await CapacitorHttp.request({
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    data: body,
    connectTimeout: 15000,
    readTimeout: 30000,
  });
};

export const sendAttendance = async (payload: AttendancePayload) => {
  const { value: token } = await Preferences.get({ key: "accessToken" });
  if (!token) {
    return { status: 401, data: { message: "missing token" } };
  }
  if (Capacitor.isNativePlatform()) {
    return await postNative(USER_ATTENDANCE, token, payload);
  }
  return await postWeb(USER_ATTENDANCE, token, payload);
};

export const pingOnline = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await CapacitorHttp.request({
        method: "HEAD",
        url: USER_ATTENDANCE,
        connectTimeout: 5000,
        readTimeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await fetch(USER_ATTENDANCE, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
};
