import { Capacitor } from "@capacitor/core";

/**
 * Returns true whenever the app is running inside a native shell (Android/iOS),
 * even if it's serving content from a live-reload dev server.
 */
export const isNativeRuntime = (): boolean => {
  if (typeof Capacitor.isNativePlatform === "function") {
    return Capacitor.isNativePlatform();
  }
  return Capacitor.getPlatform() !== "web";
};
