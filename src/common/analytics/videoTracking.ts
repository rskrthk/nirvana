import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { sendAttendance, pingOnline, AttendancePayload } from "../network/apis/attendance";

const QUEUE_KEY = "videoAttendanceQueue";
const STATE_PREFIX = "videoTrack:";

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const readQueue = async (): Promise<AttendancePayload[]> => {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
};

const writeQueue = async (items: AttendancePayload[]) => {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(items) });
};

export const enqueueAttendance = async (payload: AttendancePayload) => {
  const q = await readQueue();
  q.push(payload);
  await writeQueue(q);
};

export const flushAttendanceQueue = async () => {
  const online =
    typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true;
  const reachable = online ? await pingOnline() : false;
  if (!reachable) return false;
  let q = await readQueue();
  if (!q.length) return true;
  const remain: AttendancePayload[] = [];
  for (const item of q) {
    let ok = false;
    let attempt = 0;
    while (!ok && attempt < 3) {
      try {
        const res = await sendAttendance(item);
        ok = res.status >= 200 && res.status < 300;
      } catch {}
      attempt++;
      if (!ok) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (!ok) remain.push(item);
  }
  await writeQueue(remain);
  return remain.length === 0;
};

type TrackerOptions = {
  sessionKey: string;
  notes?: string;
  persistIntervalMs?: number;
};

export const startVideoTracking = (video: HTMLVideoElement, options: TrackerOptions) => {
  const key = `${STATE_PREFIX}${options.sessionKey}`;
  let total = 0;
  let pos = 0;
  let playing = false;
  let lastTs = 0;
  let timer: any = null;
  let disposed = false;
  const interval = options.persistIntervalMs ?? 2000;

  const readState = async () => {
    const { value } = await Preferences.get({ key });
    if (!value) return;
    try {
      const s = JSON.parse(value);
      if (typeof s.total === "number") total = s.total;
      if (typeof s.pos === "number") pos = s.pos;
    } catch {}
  };

  const writeState = async () => {
    await Preferences.set({
      key,
      value: JSON.stringify({ total, pos, updatedAt: Date.now() }),
    });
  };

  const tick = async () => {
    if (disposed) return;
    const now = Date.now();
    pos = Math.floor(video.currentTime);
    if (playing && lastTs) {
      const diff = Math.max(0, Math.floor((now - lastTs) / 1000));
      if (diff > 0) total += diff;
      lastTs = now;
    }
    await writeState();
  };

  const onPlay = async () => {
    playing = true;
    lastTs = Date.now();
    if (!timer) {
      timer = setInterval(tick, interval);
    }
  };

  const onPause = async () => {
    if (playing) {
      await tick();
    }
    playing = false;
  };

  const onEnded = async () => {
    await onPause();
    const payload: AttendancePayload = {
      attendanceDate: isoDate(new Date()),
      progressNotes: options.notes ?? "Merged asanas playback",
      totalTimeSpent: total,
    };
    await enqueueAttendance(payload);
    await flushAttendanceQueue();
  };

  const onAppState = async (state: { isActive: boolean }) => {
    if (!state.isActive) {
      await onPause();
    } else {
      await tick();
      await flushAttendanceQueue();
    }
  };

  const onOnline = async () => {
    await flushAttendanceQueue();
  };

  const init = async () => {
    await readState();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    App.addListener("appStateChange", onAppState);
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "hidden") {
          await onPause();
        } else {
          await flushAttendanceQueue();
        }
      });
    }
  };

  init();

  const stop = async () => {
    disposed = true;
    video.removeEventListener("play", onPlay);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("ended", onEnded);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await writeState();
  };

  return { stop };
};
