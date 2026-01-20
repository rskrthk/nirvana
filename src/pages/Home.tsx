import React, { useCallback, useRef, useState } from "react";
import "../styles/Home.css";
import WelcomeVideo from "../assets/welcome-video.mp4";
import { Preferences } from "@capacitor/preferences";
import { SESSION_TIMESTAMP_KEY } from "../constants";
import { PowerIcon } from "../icons/powerIcon";
import { isNativeRuntime } from "../utils/platform";

export const Home: React.FC = () => {
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const safelyPlayVideo = (video: HTMLVideoElement) => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch(() => undefined);
    }
  };

  const handleVideoLoad = () => {
    if (videoRef.current) {
      safelyPlayVideo(videoRef.current);
    }
  };
  

  const handleLogout = useCallback(async () => {
    await Preferences.remove({ key: "accessToken" });
    await Preferences.remove({ key: "userInfo" });
    await Preferences.remove({ key: SESSION_TIMESTAMP_KEY });
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "/login");
    window.dispatchEvent(new Event("popstate"));

    if (isNativeRuntime()) {
      const platformGoogle =
        (globalThis as any).GoogleAuth ||
        (globalThis as any).Capacitor?.Plugins?.GoogleAuth;

      if (platformGoogle && platformGoogle.signOut) {
        await platformGoogle.signOut();
        console.log("Signed out from Google SDK");
      }
    }
  }, []);

  return (
    <div className="welcome-screen">
      <div className="welcome-container">
        <div className="welcome-image-section">
          <button
            className="video-reset-button"
            type="button"
            aria-label="Sign out"
            onClick={ handleLogout}
          >
            <PowerIcon />
          </button>
          <video
            ref={videoRef}
            className="welcome-hero is-ready"
            src={WelcomeVideo}
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            preload="auto"
            onCanPlay={handleVideoLoad}
            onLoadedData={handleVideoLoad}
            onError={() => setVideoError("Unable to load the welcome video.")}
          />
          {videoError && (
            <div className="video-error">
              <p>{videoError}</p>
            </div>
          )}
        </div>

        <div className="welcome-content">
          <h2 className="welcome-heading">Welcome to Nirvaana Yoga</h2>
          <p className="welcome-subtext">
            Set your goals for a personalized experience-or skip and start your free yoga journey.
            Relax, focus, and grow daily.
          </p>

          <div className="welcome-actions">
            <button
              className="btn-primary"
              onClick={() => window.history.pushState(null, "", "/personalised-details")}
            >
              Personalised
            </button>
            <button
              className="btn-outline"
              onClick={() => window.history.pushState(null, "", "/free-content")}
            >
              Free Content
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
