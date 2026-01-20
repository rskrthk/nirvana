import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import "../styles/FreeContent.css";
import Logo from "../assets/Nirvaana Yoga logo- circular image 1.png";
import {
  FREE_ASANA_CODES_ENDPOINT,
  VIDEO_STREAM_ENDPOINT_BASE,
} from "../constants";
import { MergeVideos } from "../utils/MergeVideos";
import { withTimeout } from "../utils/helper";

type ScreenOrientationLike = {
  lock?: (
    orientation:
      | "portrait"
      | "portrait-primary"
      | "portrait-secondary"
      | "landscape"
      | "landscape-primary"
      | "landscape-secondary"
  ) => Promise<void> | void;
  unlock?: () => void;
};

type VideoItem = {
  id: string;
  title: string;
  tag: string;
  duration: string;
  videoUrl: string;
  resolution?: string;
};

/**
 * Decode base64 string into Uint8Array (needed for CapacitorHttp binary on mobile)
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

export const FreeContent = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlayAllActive, setIsPlayAllActive] = useState(false);
  const [userInitiatedPlay, setUserInitiatedPlay] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [attemptedResolutions, setAttemptedResolutions] = useState<{
    [videoId: string]: string[];
  }>({});
  const [mergedVideoUrl, setMergedVideoUrl] = useState("");
  const [hasMerged, setHasMerged] = useState(false);
  const hasFetched = useRef(false);

 

  /* ----------------------------
    LOAD VIDEO BLOB (APP + CAPACITOR)
  ---------------------------- */
  const loadVideoBlob = useCallback(
    async (videoId: string, token: string, resolution: string = "1080p") => {
      const url = `${VIDEO_STREAM_ENDPOINT_BASE}/${videoId}?token=${token}&resolution=${resolution}`;

      const res = await CapacitorHttp.request({
        method: "GET",
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "video/mp4",
        },
        responseType: "arraybuffer",
      });

      if (res.status === 206 || res.status === 200) {
        const payload = res.data;
        let blobSource: BlobPart;

        if (payload instanceof ArrayBuffer) {
          blobSource = payload;
        } else if (ArrayBuffer.isView(payload)) {
          const view = payload as ArrayBufferView;
          const baseBuffer = view.buffer as ArrayBuffer;
          const copy = new Uint8Array(view.byteLength);
          copy.set(new Uint8Array(baseBuffer, view.byteOffset, view.byteLength));
          blobSource = copy;
        } else if (typeof payload === "string") {
          blobSource = decodeBase64ToUint8Array(payload);
        } else {
          console.error(
            "Unexpected video payload type from CapacitorHttp:",
            typeof payload
          );
          throw new Error("Unsupported video payload format.");
        }

        const blob = new Blob([blobSource], { type: "video/mp4" });
        return URL.createObjectURL(blob);
      }
      throw new Error(`Failed to load video: ${res.status}`);
    },
    []
  );

  /* ----------------------------
    FULLSCREEN SUPPORT
  ---------------------------- */
  const requestFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video || document.fullscreenElement) return;

    const anyVideo = video as HTMLVideoElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      mozRequestFullScreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };

    const req =
      video.requestFullscreen ||
      anyVideo.webkitRequestFullscreen ||
      anyVideo.mozRequestFullScreen ||
      anyVideo.msRequestFullscreen;

    if (req) {
      try {
        const result = req.call(video);
        if (result instanceof Promise) result.catch(() => undefined);
      } catch {
        // ignore
      }
    }
  }, []);

  /* ----------------------------
    ORIENTATION LOCK
  ---------------------------- */
  const lockLandscape = useCallback(() => {
    const orientation = (window.screen as any)
      .orientation as ScreenOrientationLike | undefined;
    if (!orientation?.lock) {
      return;
    }
    try {
      Promise.resolve(orientation.lock("landscape")).catch(() => undefined);
    } catch {
      /* ignore orientation lock errors */
    }
  }, []);

  const lockPortrait = useCallback(() => {
    const orientation = (window.screen as any)
      .orientation as ScreenOrientationLike | undefined;
    if (!orientation?.lock) {
      return;
    }
    try {
      Promise.resolve(orientation.lock("portrait")).catch(() => undefined);
    } catch {
      /* ignore orientation lock errors */
    }
  }, []);

  const unlockOrientation = useCallback(() => {
    const orientation = (window.screen as any)
      .orientation as ScreenOrientationLike | undefined;
    if (!orientation?.unlock) {
      return;
    }
    try {
      Promise.resolve(orientation.unlock()).catch(() => undefined);
    } catch {
      /* ignore unlock errors */
    }
  }, []);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.videoWidth > video.videoHeight) lockLandscape();
    else lockPortrait();
  }, [lockLandscape, lockPortrait]);

  /* ----------------------------
    FETCH PLAYLIST
  ---------------------------- */

const loadSingleVideoWithRetry = useCallback(async (id: string, index: number, token: string) => {
  const attemptLoad = async () => {
    const resp = await fetch(
      `${VIDEO_STREAM_ENDPOINT_BASE}/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Range: "bytes=0-"
        }
      }
    );

    if (resp.status === 200 || resp.status === 206) {
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    }
    throw new Error(`Unexpected status ${resp.status}`);
  };


  try {
    const url = await withTimeout(attemptLoad(), 30000);
    return url; 
  } catch (err) {
    console.warn(`Retrying ${id} (first attempt failed):`, err);
  }
}, []);


const normalizeVideosSequentially = useCallback(async (videoIds: string[], token: string) => {

  const result: any = [];

  for (let index = 0; index < videoIds.length; index++) {
    const id = videoIds[index];

    const videoUrl = await loadSingleVideoWithRetry(id, index, token);  

    if (!videoUrl) {
      console.warn(`Skipping video ${id}`);
      continue;
    }

    result.push({
      id,
      title: `Yoga Video ${index + 1}`,
      tag: "Yoga",
      duration: "",
      videoUrl,
      resolution: "1080p",
    });
  }
  return result;

}, [loadSingleVideoWithRetry]);



  const fetchPlaylist = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { value: fetchedToken } = await Preferences.get({
        key: "accessToken",
      });

      if (!fetchedToken)
        throw new Error("You must be logged in to view this content.");

      setAccessToken(fetchedToken);

      let videoIds: string[] = [];

      if (Capacitor.getPlatform() === "web") {
        const res = await fetch(FREE_ASANA_CODES_ENDPOINT, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${fetchedToken}`,
          },
        });

        if (res.status === 401)
          throw new Error("Your session has expired. Please log in again.");

        videoIds = JSON.parse(await res.text());
      } else {
        const res = await CapacitorHttp.get({
          url: FREE_ASANA_CODES_ENDPOINT,
          headers: {
            Authorization: `Bearer ${fetchedToken}`,
          },
        });

        videoIds = res.data;
      }

     
      //@@@@@@@@new normalized fucntion 
      // const vid = ["1A","11A","22A","8A"]
      const normalized = await normalizeVideosSequentially(videoIds, fetchedToken);


      setPlaylist(normalized);
      setCurrentIndex(0);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;   // prevent second call
    hasFetched.current = true;
    fetchPlaylist();
  }, []);

  /* ----------------------------
    VIDEO ERROR HANDLING
  ---------------------------- */
  const handleVideoError = useCallback(async () => {
    const video = videoRef.current;

    if (video?.error) {
      setError(
        `Video Error: ${video.error.message} (Code: ${video.error.code})`
      );
    }

    if (!playlist.length || !accessToken) return;

    const cv = playlist[currentIndex];
    const attempted = attemptedResolutions[cv.id] || [];

    if (cv.resolution === "1080p" && !attempted.includes("720p")) {
      let newUrl = "";
      try {
        if (Capacitor.getPlatform() === "web") {
          const resp = await fetch(
          `${VIDEO_STREAM_ENDPOINT_BASE}/${cv.id}?token=${accessToken}&resolution=720p`,    
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const blob = await resp.blob();
          newUrl = URL.createObjectURL(blob);
        } else {
          // newUrl = await loadVideoBlob(cv.id, accessToken, "720p");
          console.log('he')
        }
      } catch (blobError) {
        console.warn(
          "Failed to load 720p video as blob, falling back to direct URL:",
          blobError
        );
        newUrl = `${VIDEO_STREAM_ENDPOINT_BASE}/${cv.id}?token=${accessToken}&resolution=720p`;
      }

      setPlaylist((prev) =>
        prev.map((v) =>
          v.id === cv.id ? { ...v, videoUrl: newUrl, resolution: "720p" } : v
        )
      );

      setAttemptedResolutions((prev) => ({
        ...prev,
        [cv.id]: [...attempted, "720p"],
      }));
    } else {
      alert("This video could not be played.");
    }
  }, [
    playlist,
    currentIndex,
    accessToken,
    attemptedResolutions,
    loadVideoBlob,
  ]);

  /* ----------------------------
    PLAYLIST, LESSONS
  ---------------------------- */
  const lessons = useMemo(() => playlist.slice(1), [playlist]);
  const currentVideo = playlist[currentIndex];

  /* ----------------------------
    HANDLE VIDEO CHANGE
  ---------------------------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.load();

    if (userInitiatedPlay) {
      video.play().catch(() => undefined);
      setUserInitiatedPlay(false);
      return;
    }

    if (isPlayAllActive) {
      video.play().catch(() => setIsPlayAllActive(false));
    }
  }, [currentIndex, isPlayAllActive, userInitiatedPlay]);




  /* ----------------------------
    PLAY ALL
  ---------------------------- */
  const handlePlayAll = useCallback(() => {
    setHasMerged(false)
    setCurrentIndex(0);
    setIsPlayAllActive(true);
    const video = videoRef.current;
    if (video) video.play().catch(() => undefined);
    requestFullscreen();
  }, [requestFullscreen]);

  const handleMergePlay = useCallback(() => {
  
  if (!hasMerged && playlist.length > 0) {
    setHasMerged(true); // prevent infinite loop

    MergeVideos(playlist)
      .then((mergedUrl) => {
        console.log("FINAL MERGED URL:", mergedUrl);
        setMergedVideoUrl(mergedUrl);
      })
      .catch((err) => console.error("Merge failed", err));
  }
  },[playlist,hasMerged])
  const handleVideoEnded = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < playlist.length) {
      setCurrentIndex(nextIndex);
      setIsPlayAllActive(true);
      const video = videoRef.current;
      if (video) {
        video
          .play()
          .catch(() => {
            // ignore autoplay block
          });
      }
    } else {
      setIsPlayAllActive(false);
    }
    unlockOrientation();
  }, [currentIndex, playlist.length, unlockOrientation]);

  /* ============================================================
      FINAL UI (UPDATED TO MATCH YOUR SECOND COMPONENT)
     ============================================================ */

     const handlePersonalizedYogaClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        window.history.pushState(null, "", "/personalised-details");

     }, []);


  return (
    <div className="free-content">
      {/* ---------- HEADER ---------- */}
      <div className="free-header">
        <div className="free-logo-section">
          <img src={Logo} alt="Nirvaana Yoga Logo" className="free-logo" />
          <h3>
            Welcome <span>there</span>
          </h3>
        </div>

        <div className="free-tabs">
          <a
            href="#"
            className="nav-link"
            onClick={(e) => e.preventDefault()}
          >
            <span className="active-tab">Free Guided Yoga</span>
          </a>
          <a href="#" className="nav-link" onClick={handlePersonalizedYogaClick}>
            Personalised Yoga
          </a>
          <a href="#" className="nav-link" onClick={(e) => e.preventDefault()}>
            Meditation
          </a>
        </div>
      </div>

      {/* ---------- MAIN SECTION ---------- */}
      <div className="free-section">
        <h4>Yoga for Absolute Beginners</h4>
        <button className="see-more">see more</button>
      </div>

      {/* ---------- MAIN VIDEO ---------- */}
      <div className="video-container">
        <div className={`video-wrapper ${loading ? "loading" : ""}`}>
          {loading ? (
            <div className="video-loader">
              <div className="spinner"></div>
            </div>
          ) : currentVideo ? (
            <video
              key={currentVideo.id}
              ref={videoRef}
              src={hasMerged ? mergedVideoUrl : currentVideo.videoUrl}
              controls
              preload="none"
              className="main-video"
              playsInline
              onPlay={handlePlay}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
            />
          ) : (
            <div className="video-fallback">
              {error || "No videos available"}
            </div>
          )}
        </div>

        <div className="video-details">
          <h5>{currentVideo?.title || "Loading..."}</h5>
          <button
            className="play-all-btn"
            onClick={handlePlayAll}
            aria-pressed={isPlayAllActive}
            disabled={!playlist.length}
          >
            <span>▶</span>
            <span>{isPlayAllActive ? "Playing..." : "Play all"}</span>
          </button>
        </div>

        <div className="video-details">
          <h5>{"Today's Plan"}</h5>
          <button
            className="play-all-btn"
            onClick={handleMergePlay}
            aria-pressed={isPlayAllActive}
            style={{cursor:!playlist.length ? "not-allowed":"pointer"}}
            disabled={!playlist.length}
          >
            <span>▶</span>
            <span >{"Play"}</span>
          </button>
        </div>
      </div>

      {/* ---------- LET'S BEGIN SECTION ---------- */}
      <div className="lets-section">
        <div className="lets-header">
          <h4>Let’s Begin!</h4>
          <button className="see-more">see more</button>
        </div>

        <div className="lets-list">
          {lessons.map((lesson, idx) => (
            <div
              key={lesson.id}
              className="lesson-card"
              onClick={() => {
                setCurrentIndex(idx + 1);
                setUserInitiatedPlay(true);
              }}
            >
              <div className="lesson-thumb-wrapper">
                <video                      
                  src={lesson.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="lesson-thumb"
                                onMouseOver={(e) => {
                  // Only play if already loaded
                  if (e.currentTarget.readyState >= 3) {
                    e.currentTarget.play();
                  }
                }}
                  onMouseOut={(e) => e.currentTarget.pause()}
                />
                <div className="lesson-duration">{lesson.duration}</div>
              </div>

              <div className="lesson-content">
                <div className="lesson-title-row">
                  <h5>{lesson.title}</h5>
                  <span className="lesson-tag">{lesson.tag}</span>
                </div>

                <p className="para-content">
                  Set your goals for a personalized experience—or skip. Set your
                  goals for a personalized experience—or skip.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


