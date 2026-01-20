import React, { useCallback, useEffect, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { ASANA_PLAN_CACHE_KEY, GET_ASANA_PLAN, GET_MOBILE_ASANA_PLAN, VIDEO_STREAM_ENDPOINT_BASE } from "../constants";
import { isNativeRuntime } from "../utils/platform";
import "../styles/PersonalisedAsanaPlan.css";
import Logo from "../assets/Nirvaana Yoga logo- circular image 1.png";
import { LeftIcon } from "../icons/LeftIcon";
import { MergeVideos } from "../utils/MergeVideos";
import { mergePlanAsanas, safeRevokeUrl, decodeBase64ToUint8Array, withTimeout } from "../utils/helper";
import { getVideoFileName, getCachedVideoUrl, saveVideoToFS, } from "../utils/Videofilesystem";
import { AsanaItem, AsanaPlanData, ScreenOrientationLike, VideoSource } from "./interface";
import { log } from "console";
import { startVideoTracking, flushAttendanceQueue } from "../common/analytics/videoTracking";

const buildDirectStreamUrl = (asanaCode: string, token: string, resolution = "720p", isExplanation = false) =>
  `${VIDEO_STREAM_ENDPOINT_BASE}/${asanaCode}${isExplanation ? "?explanation=true" : ""}`;


export const PersonalisedAsanaPlan: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planData, setPlanData] = useState<AsanaPlanData | null>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlayAllActive, setIsPlayAllActive] = useState(false);
  const [userInitiatedPlay, setUserInitiatedPlay] = useState(false);
  const [videoSources, setVideoSources] = useState<{ [key: string]: VideoSource }>({});
  const [imageSources, setImageSources] = useState<{ [key: string]: string }>({});
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [orderedAsanas, setOrderedAsanas] = useState<AsanaItem[]>([]);
  const failedVideosRef = useRef<Set<number>>(new Set()); // Track failed video loads
  const [loadingVideos, setLoadingVideos] = useState<Set<number>>(new Set());
  type MergeStatus = "idle" | "downloading" | "merging" | "ready" | "error";
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>("idle");
  const isMerging = mergeStatus === "downloading" || mergeStatus === "merging";

  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | undefined>("");
  const cachedToFSRef = useRef<Set<string>>(new Set());  // to cache the individual vidoes 
  const createdBlobUrlsRef = useRef<Set<string>>(new Set()); // Track created blob URLs for cleanup
  type VideoMode = "single" | "merged" | "playAll";
  const [currentVideoMode, setCurrentVideoMode] = useState<VideoMode>("single"); // to play the video on differnt button clicks 
  const [currentRepeatCount, setCurrentRepeatCount] = useState(0); // Track repetitions for "Play All" mode
  const [isPlayingMerged, setIsPlayingMerged] = useState(false); // Track play/pause state for merged video

  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [mergeProgress, setMergeProgress] = useState<{ progress: number; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const mergedTrackerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    flushAttendanceQueue();
  }, []);

  const getPlayableSrc = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("file:") || url.startsWith("content:") || url.startsWith("filesystem:")) {
      return Capacitor.convertFileSrc(url);
    }
    return url;
  };

  useEffect(() => {
    if (orderedAsanas.length > 0 && !activeTab) {
      // Set initial tab to the type of the first asana
      const firstType = orderedAsanas[0].type;
      if (firstType) setActiveTab(firstType);
    }
  }, [orderedAsanas, activeTab]);

  // ---------- LOAD VIDEO BLOB (using same pattern as FreeContent) ----------
  const loadVideoSource = useCallback(
    async (
      asanaCode: string,
      token: string,
      resolution: "1080p" | "720p" = isNativeRuntime() ? "720p" : "1080p",
      isExplanation: boolean = false,
      returnFileUri: boolean = false
    ) => {
      const isNative = isNativeRuntime();
      const headers = isNative
        ? {
          Authorization: `Bearer ${token}`,
          Accept: "video/mp4",
        }
        : undefined;
      const streamUrl = buildDirectStreamUrl(asanaCode, token, resolution, isExplanation);
      const fallback = (): VideoSource => ({
        url: buildDirectStreamUrl(asanaCode, token, resolution, isExplanation),
        resolution,
      });

      try {
        if (isNative) {
          // 1️ Build filesystem path
          const fileName = isExplanation ? `${asanaCode}_explanation` : asanaCode;
          const filePath = getVideoFileName(fileName, resolution);

          // 2️ Check cache FIRST (offline support)
          const cachedUrl = await getCachedVideoUrl(filePath, returnFileUri);
          if (cachedUrl) {
            cachedToFSRef.current.add(asanaCode);
            return { url: cachedUrl, resolution };
          }

          // 3️ Download from API with Retry Logic
          let attempts = 0;
          const maxAttempts = 3;
          let success = false;
          let res: any;

          while (attempts < maxAttempts && !success) {
            try {
              attempts++;
              console.log(`[Video] Starting download for ${asanaCode} (Explanation: ${isExplanation}) - Attempt ${attempts}`);

              res = await CapacitorHttp.request({
                method: "GET",
                url: streamUrl,
                headers,
                responseType: "arraybuffer",
                connectTimeout: 30000, // 30s timeout
                readTimeout: 60000,    // 60s timeout
              });

              if (res.status === 200 || res.status === 206) {
                success = true;
              } else {
                console.warn(`[Video] Download failed for ${asanaCode} (Status: ${res.status})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Backoff
              }
            } catch (err) {
              console.warn(`[Video] Network error for ${asanaCode} - Attempt ${attempts}`, err);
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
          }

          console.log(`[Video] Download complete for ${asanaCode} (Status: ${res?.status})`);

          if (success && (res.status === 200 || res.status === 206)) {
            let dataToSave: Uint8Array | string | null;

            if (typeof res.data === "string") {
              dataToSave = res.data; // Already base64, no decoding needed!
            } else if (res.data instanceof ArrayBuffer) {
              dataToSave = new Uint8Array(res.data);
            } else if (ArrayBuffer.isView(res.data)) {
              dataToSave = new Uint8Array(
                res.data.buffer,
                res.data.byteOffset,
                res.data.byteLength
              );
            } else {
              console.warn("Unexpected payload, falling back");
              return fallback();
            }

            // Release original response data reference early
            res = null;

            // 4️ SAVE TO FILESYSTEM ( new)
            console.log(`[Video] Saving to FS: ${filePath}`);
            await saveVideoToFS(filePath, dataToSave as any);
            console.log(`[Video] Saved to FS: ${filePath}`);

            // Release dataToSave
            dataToSave = null;

            // 5️ Convert saved file to playable URL
            const savedUrl = await getCachedVideoUrl(filePath, returnFileUri);
            if (savedUrl) {
              cachedToFSRef.current.add(asanaCode);
              return { url: savedUrl, resolution };
            }
          }

          return fallback();
        }

        const res = await fetch(streamUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "video/mp4",
            Range: "bytes=0-",
          }
        });
        console.log("streamUrl", streamUrl);

        console.log("res", res);

        if (!res.ok) {
          console.warn(`Web video fetch for ${asanaCode} failed with status ${res.status}`);
          return fallback();
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        createdBlobUrlsRef.current.add(blobUrl);
        return { url: blobUrl, resolution };
      } catch (err) {
        console.error(`Error loading video for ${asanaCode}, using direct stream:`, err);
        return fallback();
      }
    },
    []
  );

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (!isNativeRuntime()) {
        createdBlobUrlsRef.current.forEach(url => {
          try {
            URL.revokeObjectURL(url);
          } catch { /* ignore */ }
        });
        createdBlobUrlsRef.current.clear();
      }
    };
  }, []);
  const hydratePlanWithImages = useCallback(
    async (plan: AsanaPlanData) => {
      const flattened = mergePlanAsanas(plan);
      console.log("flattened", flattened);

      setPlanData(plan);
      setOrderedAsanas(flattened);

      const images = flattened.reduce<{ [key: string]: string }>((acc, asana) => {
        if (asana?.id && asana.image) {
          acc[asana.id] = asana.image;
        }
        return acc;
      }, {});

      setImageSources(images);
      setCurrentVideoIndex(0);
    },
    []
  );

  const readCachedAsanaPlan = useCallback(async (userId: number) => {
    try {
      const { value } = await Preferences.get({ key: ASANA_PLAN_CACHE_KEY });
      if (!value) return null;
      const parsed = JSON.parse(value) as {
        userId?: number;
        plan?: AsanaPlanData;
      };
      if (!parsed || parsed.userId !== userId || !parsed.plan) {
        return null;
      }
      return parsed.plan;
    } catch (error) {
      console.warn("Unable to read cached personalised plan", error);
      return null;
    }
  }, []);

  const cacheAsanaPlan = useCallback(async (userId: number, plan: AsanaPlanData) => {
    try {
      // Create a deep copy to avoid mutating state, then strip out large image data
      const planToCache = JSON.parse(JSON.stringify(plan));

      const listsToClean: (keyof AsanaPlanData)[] = [
        "warmupSequences",
        "warmupException",
        "asanaList",
        "selectedPranayamaList",
        "excludePranayamaList",
      ];

      listsToClean.forEach(listKey => {
        const asanaList = planToCache[listKey] as AsanaItem[] | undefined;
        if (Array.isArray(asanaList)) {
          asanaList.forEach(asana => {
            if (asana && asana.image) {
              asana.image = ""; // Remove image data before caching
            }
          });
        }
      });

      await Preferences.set({
        key: ASANA_PLAN_CACHE_KEY,
        value: JSON.stringify({
          userId,
          fetchedAt: new Date().toISOString(),
          plan: planToCache,
        }),
      });
    } catch (error) {
      console.warn("Unable to cache personalised plan", error);
    }
  }, []);

  // ---------- FETCH PERSONALISED ASANA PLAN + LOAD VIDEOS ----------
  useEffect(() => {
    const fetchAsanaPlan = async () => {
      setLoading(true);
      setError(null);
      let planHydrated = false;

      try {
        let userId: number | null = null;

        // 1) Check userId from URL query (?userId=)
        const params = new URLSearchParams(window.location.search);
        const userIdFromUrl = params.get("userId");
        if (userIdFromUrl) {
          const parsed = Number(userIdFromUrl);
          if (Number.isFinite(parsed)) {
            userId = parsed;
          }
        }

        // 2) Else from Preferences: onlineUserId
        if (!userId) {
          const { value: storedId } = await Preferences.get({ key: "onlineUserId" });
          if (storedId) {
            const parsed = Number(storedId);
            if (Number.isFinite(parsed)) userId = parsed;
          }
        }

        // 3) Else from userInfo JSON
        if (!userId) {
          const { value: userInfoJson } = await Preferences.get({ key: "userInfo" });
          if (userInfoJson) {
            try {
              const ui = JSON.parse(userInfoJson) as any;
              if (ui && (ui.id || ui.userId || ui._id)) {
                userId = Number(ui.id || ui.userId || ui._id) || null;
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        if (!userId) {
          throw new Error("User ID not found. Please log in and try again.");
        }

        // Access token
        const { value: token } = await Preferences.get({ key: "accessToken" });
        if (!token) {
          throw new Error("Authentication token not found. Please log in again.");
        }
        setAccessToken(token);

        const cachedPlan = await readCachedAsanaPlan(userId);
        if (cachedPlan) {
          await hydratePlanWithImages(cachedPlan);
          planHydrated = true;
          setLoading(false);
        }

        // const url = `${GET_ASANA_PLAN}/${userId}`;
        const url = `${GET_MOBILE_ASANA_PLAN}`
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        };

        let response: { status: number; data: any };

        if (isNativeRuntime()) {
          response = await CapacitorHttp.get({ url, headers });
        } else {
          const res = await fetch(url, { method: "GET", headers });
          const text = await res.text();
          let parsed: any = {};
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          }
          response = { status: res.status, data: parsed };
        }

        if (response.status < 200 || response.status >= 300) {
          const errorMsg =
            (response.data && typeof response.data === "object" && response.data.message) ||
            (typeof response.data === "string" && response.data.trim()) ||
            `Failed to fetch plan (status: ${response.status})`;
          throw new Error(errorMsg);
        }

        const plan: AsanaPlanData = response.data;
        console.log("plan", plan);
        await cacheAsanaPlan(userId, plan);
        // Always hydrate with the full data from the network to get images
        await hydratePlanWithImages(plan);

        // Manually trigger loading for the first video to prevent flash of no video
        const firstAsana = mergePlanAsanas(plan)[0];
        if (firstAsana && firstAsana.asanaCode && !videoSources[firstAsana.id] && token) {
          setLoadingVideos(prev => new Set(prev).add(firstAsana.id));
          loadVideoSource(firstAsana.asanaCode, token).then(source => {
            setVideoSources(prev => ({ ...prev, [firstAsana.id]: source }));
          }).finally(() => {
            setLoadingVideos(prev => {
              const newSet = new Set(prev);
              newSet.delete(firstAsana.id);
              return newSet;
            });
          });
        }

        setLoading(false);
      } catch (err) {
        console.error("Error fetching asana plan:", err);
        if (!planHydrated) {
          setVideoSources({});
          setError(
            err instanceof Error ? err.message : "Failed to fetch yoga plan. Please try again."
          );
          setLoading(false);
        }
      }
    };

    fetchAsanaPlan();
  }, [cacheAsanaPlan, hydratePlanWithImages, readCachedAsanaPlan]);






  // ---------- ORIENTATION HANDLING ----------
  const lockLandscape = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const orientation = (window.screen as any).orientation as ScreenOrientationLike | undefined;
    if (orientation?.lock) {
      try {
        await orientation.lock("landscape");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const lockPortrait = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const orientation = (window.screen as any).orientation as ScreenOrientationLike | undefined;
    if (orientation?.lock) {
      try {
        await orientation.lock("portrait");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const unlockOrientation = useCallback(() => {
    const orientation = (window.screen as any).orientation as ScreenOrientationLike | undefined;
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.videoWidth > video.videoHeight) {
      lockLandscape();
    } else {
      lockPortrait();
    }

    const nextIndex = currentVideoIndex + 1;
    if (nextIndex < orderedAsanas.length) {
      const nextAsana = orderedAsanas[nextIndex];
      if (nextAsana.asanaCode && !videoSources[nextAsana.id] && accessToken) {
        setLoadingVideos(prev => new Set(prev).add(nextAsana.id));
        loadVideoSource(nextAsana.asanaCode, accessToken).then(source => {
          setVideoSources(prev => ({ ...prev, [nextAsana.id]: source }));
        }).finally(() => {
          setLoadingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(nextAsana.id);
            return newSet;
          });
        });
      }
    }
  }, [lockLandscape, lockPortrait, currentVideoIndex, orderedAsanas, accessToken, videoSources, loadVideoSource]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      const video = videoRef.current;
      if (video && fullscreenElement === video) {
        lockLandscape();
        video
          .play()
          .catch((err) => {
            console.warn("Auto-play on fullscreen failed:", err);
          });
      } else if (!fullscreenElement) {
        unlockOrientation();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [lockLandscape, unlockOrientation]);

  // ---------- PRELOAD NEXT VIDEO ----------
  useEffect(() => {
    if (!orderedAsanas.length || !accessToken) return;

    const nextIndex = currentVideoIndex + 1;
    if (nextIndex < orderedAsanas.length) {
      const nextAsana = orderedAsanas[nextIndex];
      // Only preload if not already loaded/loading
      if (nextAsana.asanaCode && !videoSources[nextAsana.id] && !loadingVideos.has(nextAsana.id)) {
        loadVideoSource(nextAsana.asanaCode, accessToken).then((source) => {
          if (source) {
            setVideoSources((prev) => ({ ...prev, [nextAsana.id]: source }));
          }
        }).catch(err => console.warn("Preload failed", err));
      }
    }
  }, [currentVideoIndex, orderedAsanas, accessToken, videoSources, loadingVideos, loadVideoSource]);

  const handleVideoEnded = useCallback(async () => {
    if (!isPlayAllActive || !orderedAsanas.length) {
      setIsPlayAllActive(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        // @ts-ignore
        if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      } catch { /* ignore */ }
      unlockOrientation();
      return;
    }

    let nextIndex = currentVideoIndex + 1;

    // Skip failed videos
    while (nextIndex < orderedAsanas.length && failedVideosRef.current.has(orderedAsanas[nextIndex].id)) {
      nextIndex++;
    }

    if (nextIndex >= orderedAsanas.length) {
      setIsPlayAllActive(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        // @ts-ignore
        if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      } catch { /* ignore */ }
      unlockOrientation();
      return;
    }

    // Move to next
    setCurrentVideoIndex(nextIndex);
    setUserInitiatedPlay(true);
  }, [isPlayAllActive, currentVideoIndex, orderedAsanas, unlockOrientation]);


  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (video && video.error) {
      console.error("Video Playback Error:", video.error.message, "Code:", video.error.code);
    }

    if (!orderedAsanas.length || !accessToken) return;
    const currentAsana = orderedAsanas[currentVideoIndex];
    if (!currentAsana) return;

    const currentSource = videoSources[currentAsana.id];
    if (!currentSource) return;

    if (currentSource.resolution === "1080p") {
      setLoadingVideos(prev => new Set(prev).add(currentAsana.id));
      loadVideoSource(currentAsana.asanaCode, accessToken, "720p").then((newSource) => {
        if (!newSource) return;
        if (currentSource.url.startsWith("blob:")) {
          try { safeRevokeUrl(currentSource.url); } catch { /* ignore */ }
        }
        setVideoSources((prev) => ({ ...prev, [currentAsana.id]: newSource }));
        setUserInitiatedPlay(true);
      }).finally(() => {
        setLoadingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(currentAsana.id);
          return newSet;
        });
      });
    }
  }, [accessToken, currentVideoIndex, loadVideoSource, orderedAsanas, videoSources]);

  // ---------- Auto-play logic ----------
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !orderedAsanas.length) return;

    // Check if current video source is ready
    const currentId = orderedAsanas[currentVideoIndex]?.id;
    if (!currentId || !videoSources[currentId]?.url) return;

    if (userInitiatedPlay || isPlayAllActive) {
      video.play().catch((error) => console.error("Autoplay failed:", error));
      setUserInitiatedPlay(false);
    }
  }, [currentVideoIndex, isPlayAllActive, userInitiatedPlay, videoSources, orderedAsanas]);

  // ---------- Navigation + UI handlers ----------
  const handleBackClick = () => {
    window.history.pushState(null, "", "/home");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handlePlayAll = () => {
    if (currentVideoMode === "playAll" && orderedAsanas.length > 0) {
      if (isPlayAllActive) {
        setIsPlayAllActive(false);
        videoRef.current?.pause();
        return;
      } else {
        setIsPlayAllActive(true);
        setUserInitiatedPlay(true);
        videoRef.current?.play().catch(console.error);
        return;
      }
    }

    const firstVideoIndex = orderedAsanas.findIndex((asana) => asana.asanaCode);

    if (firstVideoIndex < 0) {
      setIsPlayAllActive(false);
      return;
    }

    const asana = orderedAsanas[firstVideoIndex];
    if (asana.asanaCode && !videoSources[asana.id] && accessToken) {
      setLoadingVideos(prev => new Set(prev).add(asana.id));
      loadVideoSource(asana.asanaCode, accessToken).then(source => {
        setVideoSources(prev => ({ ...prev, [asana.id]: source }));
      }).finally(() => {
        setLoadingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(asana.id);
          return newSet;
        });
      });
    }

    setIsPlayAllActive(true);
    setIsPlayingMerged(false);
    setCurrentRepeatCount(0);
    setCurrentVideoIndex(firstVideoIndex);
    setUserInitiatedPlay(true);
    setCurrentVideoMode("playAll");
  };

  // Mege play 

  const handleMergeAndPlay = async () => {
    // If ready, toggle play/pause for merged video
    if (mergeStatus === "ready") {
      if (currentVideoMode === "merged") {
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(console.error);
            setIsPlayingMerged(true);
          } else {
            videoRef.current.pause();
            setIsPlayingMerged(false);
          }
        }
      } else {
        // Switch to merged mode and play
        setIsPlayAllActive(false);
        setCurrentRepeatCount(0);
        setCurrentVideoMode("merged");
        setUserInitiatedPlay(true);
        setIsPlayingMerged(true);
      }
      return;
    }

    if (!orderedAsanas.length || !accessToken) return;

    if (mergeStatus === "downloading" || mergeStatus === "merging") return;

    setMergeStatus("downloading");
    setMergeProgress(null);
    const tempBlobUrls: string[] = [];

    try {
      // Filter only asanas that have codes
      const sourceList = planData?.asanaList || [];
      const asanasToMerge = sourceList.filter(a => a.asanaCode);
      console.log("asanasToMerge", asanasToMerge);

      if (!asanasToMerge.length) {
        throw new Error("No videos to merge in the asana list");
      }

      // 1. Load all videos in batches with progress tracking
      const tasks: (() => Promise<void>)[] = [];
      const localSources: Record<string, VideoSource> = {};

      asanasToMerge.forEach(asana => {
        if (asana.showExplanationVideo) {
          tasks.push(async () => {
            const expKey = `${asana.id}_explanation`;
            if (videoSources[expKey]) {
              localSources[expKey] = videoSources[expKey];
              return;
            }
            try {
              const source = await loadVideoSource(asana.asanaCode, accessToken, undefined, true, true);
              if (source) {
                localSources[expKey] = source;
                setVideoSources(prev => ({ ...prev, [expKey]: source }));
              }
            } catch (err) {
              console.error(`Failed to load explanation for ${asana.asanaName}`, err);
            }
          });
        }
        tasks.push(async () => {
          if (videoSources[asana.id]) {
            localSources[asana.id] = videoSources[asana.id];
            return;
          }
          try {
            const source = await loadVideoSource(asana.asanaCode, accessToken, undefined, false, true);
            if (source) {
              localSources[asana.id] = source;
              setVideoSources(prev => ({ ...prev, [asana.id]: source }));
            }
          } catch (err) {
            console.error(`Failed to load ${asana.asanaName}`, err);
          }
        });
      });

      const totalTasks = tasks.length;
      let completedTasks = 0;
      setDownloadProgress({ current: 0, total: totalTasks });

      // Queue Processor (Worker Pool Pattern)
      const CONCURRENCY = 2; // Reduced to 2 for better stability on low-end devices
      const processQueue = async () => {
        const queue = [...tasks]; // Shared queue

        const worker = async (workerId: number) => {
          console.log(`Worker ${workerId} started`);
          // Stagger start times to prevent network bursts
          await new Promise(r => setTimeout(r, workerId * 500));

          while (queue.length > 0) {
            const task = queue.shift();
            if (task) {
              try {
                // Wrap task in a safety timeout (70s) to prevent infinite hangs
                // loadVideoSource has internal 60s timeout, so 70s gives it a buffer
                await withTimeout(task(), 70000);
              } catch (err) {
                console.error(`Worker ${workerId} task failed or timed out`, err);
              } finally {
                completedTasks++;
                setDownloadProgress({ current: completedTasks, total: totalTasks });
                // Small cooldown between tasks to let GC catch up
                await new Promise(r => setTimeout(r, 200));
              }
            }
          }
          console.log(`Worker ${workerId} finished`);
        };

        const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
        await Promise.all(workers);
      };

      await processQueue();
      setDownloadProgress(null);

      /* ================= COLLECT VALID VIDEOS ================= */
      setMergeStatus("merging"); // Update status to merging
      const validUrls: string[] = [];

      // Helper to ensure we have a Blob URL for FFmpeg
      const ensureBlobUrl = async (url: string): Promise<string | null> => {
        if (url.startsWith("blob:") || url.startsWith("file:") || url.startsWith("filesystem:")) return url;

        // Handle local Capacitor files (http://localhost/_capacitor_file_...)
        if (url.includes("localhost") || url.includes("_capacitor_file_")) {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            tempBlobUrls.push(blobUrl);
            return blobUrl;
          } catch (e) {
            console.error("Failed to fetch local video blob", e);
            return null;
          }
        }

        try {
          if (isNativeRuntime()) {
            // Use CapacitorHttp for fallback downloads on Native
            const res = await CapacitorHttp.request({
              method: "GET",
              url: url,
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: "arraybuffer",
              connectTimeout: 30000,
              readTimeout: 60000,
            });

            if (res.status === 200) {
              let bytes: Uint8Array;
              if (typeof res.data === "string") {
                bytes = decodeBase64ToUint8Array(res.data);
              } else {
                bytes = new Uint8Array(res.data);
              }
              const blob = new Blob([bytes as any], { type: "video/mp4" });
              const blobUrl = URL.createObjectURL(blob);
              tempBlobUrls.push(blobUrl);
              return blobUrl;
            }
            return null;
          }

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!res.ok) {
            console.warn(`Failed to fetch video for merge: ${url} (${res.status})`);
            return null;
          }
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          tempBlobUrls.push(blobUrl);
          return blobUrl;
        } catch (e) {
          console.error("Failed to convert remote video to blob", e);
          return null;
        }
      };
      console.log("asanasToMerge", asanasToMerge);

      for (const asana of asanasToMerge) {
        // Explanation first
        if (asana.showExplanationVideo) {
          const expKey = `${asana.id}_explanation`;
          const source = localSources[expKey];
          console.log("asanasource", source);

          if (source?.url) {
            const blobUrl = await ensureBlobUrl(source.url);
            if (blobUrl) validUrls.push(blobUrl);
          }
        }

        // Regular
        const source = localSources[asana.id];
        console.log("source", source);

        if (source?.url) {
          const blobUrl = await ensureBlobUrl(source.url);
          if (blobUrl) {
            // Apply repeat logic: default to 1 if invalid or undefined
            const count = asana.repeatCount ? Number(asana.repeatCount) : 1;
            const repeat = (count > 0) ? count : 1;
            for (let i = 0; i < repeat; i++) {
              validUrls.push(blobUrl);
            }
          }
        }
      }

      if (!validUrls.length) {
        throw new Error("No valid videos to merge");
      }

      /* ================= MERGE ================= */
      console.log(`Merging ${validUrls.length} videos...`);
      const playlist = validUrls.map(url => ({ videoUrl: url }));

      // Check for empty playlist
      if (playlist.length === 0) {
        throw new Error("No valid video segments available to merge.");
      }

      const mergedUrl = await MergeVideos(playlist, {
        onProgress: (progress, message) => {
          setMergeProgress({ progress, message });
        }
      });

      if (!mergedUrl) {
        throw new Error("Merge process returned no URL");
      }

      /* ================= SUCCESS ================= */
      setMergedVideoUrl(mergedUrl);
      setMergeStatus("ready");
      // Autoplay removed. User must click play.

    } catch (error: any) {
      console.error("Merge error details:", error);
      setMergeStatus("error");
      let msg = error.message || "Video merge failed";
      if (msg.includes("Cross-Origin") || msg.includes("SharedArrayBuffer")) {
        msg = "Browser security blocked video merging. Please use the mobile app or a compatible browser.";
      }
      alert(msg);
    } finally {
      tempBlobUrls.forEach(safeRevokeUrl);
    }
  };



  useEffect(() => {
    return () => {
      if (mergedVideoUrl) {
        try {
          safeRevokeUrl(mergedVideoUrl);
        } catch {
          /* ignore */
        }
      }
    };
  }, [mergedVideoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    const active = currentVideoMode === "merged" && mergedVideoUrl && v;
    const id = `${planData?.title || "merged"}:${new Date().toISOString().slice(0, 10)}`;
    const notes = "Merged Asanas";
    const attach = async () => {
      if (v && active) {
        if (mergedTrackerRef.current) {
          await mergedTrackerRef.current.stop();
          mergedTrackerRef.current = null;
        }
        mergedTrackerRef.current = startVideoTracking(v, { sessionKey: id, notes });
      }
    };
    attach();
    return () => {
      const h = mergedTrackerRef.current;
      if (h) {
        h.stop();
        mergedTrackerRef.current = null;
      }
    };
  }, [currentVideoMode, mergedVideoUrl, planData]);

  const handleAsanaClick = (index: number) => {
    const asana = orderedAsanas[index];
    if (!asana) return;

    if (asana.asanaCode && !videoSources[asana.id] && accessToken) {
      setLoadingVideos(prev => new Set(prev).add(asana.id));
      loadVideoSource(asana.asanaCode, accessToken).then(source => {
        setVideoSources(prev => ({ ...prev, [asana.id]: source }));
      }).finally(() => {
        setLoadingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(asana.id);
          return newSet;
        });
      });
    }

    setCurrentVideoIndex(index);
    setUserInitiatedPlay(true);
    setIsPlayAllActive(false);
    setIsPlayingMerged(false);
    setCurrentRepeatCount(0);
    setCurrentVideoMode("single");
    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (video) {
        video.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };
  if (loading) {
    return (
      <div className="plan-loading">
        <div className="spinner"></div>
        <p>Loading your personalized yoga plan...</p>
      </div>
    );
  }

  if (error || !planData) {
    return (
      <div className="plan-error">
        <h2>Oops!</h2>
        <p>{error || "Failed to load yoga plan"}</p>
        <button onClick={handleBackClick} className="back-btn">
          Back to Home
        </button>
      </div>
    );
  }

  const currentAsana = orderedAsanas[currentVideoIndex];

  // Helper to handle image fields
  const getImageSrc = (imageData: string) => {
    if (!imageData) {
      return "";
    }
    if (imageData.startsWith("data:image")) {
      return imageData;
    }
    if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
      return imageData;
    }
    const cleanedData = imageData.replace(/\s/g, "");
    return `data:image/jpeg;base64,${cleanedData}`;
  };

  const formatAsanaName = (name?: string) => {
    if (!name) return "";
    const cleaned = name.replace(/_/g, " ").trim();
    if (!cleaned) return "";
    return cleaned
      .split(" ")
      .map((word) =>
        word.length ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""
      )
      .join(" ");
  };

  const TABS_CONFIG = [
    { id: "warmupSequences", label: "Warmup" },
    { id: "warmupException", label: "Exception" },
    { id: "asanaList", label: "Asanas" },
    { id: "selectedPranayamaList", label: "Pranayama" },
  ];

  const availableTabs = TABS_CONFIG.filter(tab =>
    orderedAsanas.some(asana => asana.type === tab.id)
  );

  const filteredAsanas = activeTab
    ? orderedAsanas.filter(asana => asana.type === activeTab)
    : orderedAsanas;

  return (
    <div className="asana-plan-container">
      {/* Header */}
      <header className="plan-header">
        <button type="button" className="back-button" onClick={handleBackClick}>
          <LeftIcon />
        </button>
        <div className="plan-logo-section">
          <img src={Logo} alt="Nirvaana Yoga" className="plan-logo" />
          <h3>
            Nirva<span className="span-element">a</span>na Yoga
          </h3>
        </div>
      </header>

      {/* Main Section */}
      <div className="plan-section">
        <h4>{planData.title || "Your Personalized Yoga Plan"}</h4>
      </div>

      {/* Video Container */}
      <div className="plan-video-container">

        <div className="plan-video-wrapper">
          {loading ? (
            <div className="plan-video-loader">
              <div className="spinner"></div>
            </div>
          ) : currentVideoMode === "merged" && mergedVideoUrl ? (
            <video
              key="merged-video"
              ref={videoRef}
              src={mergedVideoUrl}
              controls
              preload="auto"
              className="plan-main-video"
              playsInline
              onPlay={() => {
                setUserInitiatedPlay(true);
                setIsPlayingMerged(true);
              }}
              onPause={() => setIsPlayingMerged(false)}
              onEnded={() => {
                setCurrentVideoMode("single"); // After merged ends, fallback to last single/asana
                setIsPlayingMerged(false);
                handleVideoEnded();
              }}
              onError={handleVideoError}
            />
          ) : currentAsana ? (
            loadingVideos.has(currentAsana.id) ? (
              <div className="plan-video-loader">
                <div className="spinner"></div>
              </div>
            ) : videoSources[currentAsana.id]?.url ? (
              <video
                key={currentAsana.id}
                ref={videoRef}
                src={getPlayableSrc(videoSources[currentAsana.id]?.url)}
                controls
                preload="auto"
                className="plan-main-video"
                playsInline
                poster={imageSources[currentAsana.id] ? getImageSrc(imageSources[currentAsana.id]) : undefined}
                onPlay={handlePlay}
                onEnded={handleVideoEnded}
                onError={handleVideoError}
              />
            ) : currentAsana.image ? (
              <img
                src={getImageSrc(imageSources[currentAsana.id] || currentAsana.image)}
                alt={currentAsana.asanaName}
                className="plan-main-video plan-main-image"
              />
            ) : (
              <div className="video-fallback">
                <div className="video-spinner"></div>
              </div>
            )
          ) : (
            <div className="video-fallback">
              <div className="video-spinner"></div>
            </div>
          )}
        </div>

        {currentAsana && (
          <div className="plan-video-details">
            <h5 style={{ width: "100%", margin: "0 0 8px 0" }}>
              {currentVideoMode === "merged"
                ? "Full Personalised Session"
                : formatAsanaName(currentAsana.asanaName)}
            </h5>
            <div className="plan-vidoe-header-details" >
              <button className="plan-video-header-button" > Personalised Yoga </button>
              <span className="plan-video-hader-title"> Congratulations on choosing your personalized yoga session!</span>
              <div className="plan-video-header-description">
                <span className="description-header">Description </span>
                <span className="description-content"> This AI-generated gentle stretching flow is tailored just for you — helping your body and mind awaken with calm energy. It’s the perfect way to start your day feeling refreshed, focused, and ready for action. Breathe deeply, move mindfully, and enjoy your personalized journey to balance and vitality.</span>

              </div>

            </div>
            <button
              className={`plan-play-all-btn ${isPlayAllActive ? "active" : ""}`}
              onClick={handlePlayAll}
              disabled={!orderedAsanas.length}
            >
              <span>{isPlayAllActive ? "||" : "▶"}</span>{" "}
              {isPlayAllActive ? "Pause" : "Play all"}
            </button>

            <button
              className={`plan-play-all-btn ${isMerging || mergeStatus === "ready" ? "active" : ""}`}
              onClick={handleMergeAndPlay}
              disabled={isMerging || !planData?.asanaList?.length}
            >
              {mergeStatus === "downloading" ? (
                <>
                  <div className="spinner-small"></div>
                  {downloadProgress ? `Downloading (${downloadProgress.current}/${downloadProgress.total})...` : "Downloading..."}
                </>
              ) : mergeStatus === "merging" ? (
                <>
                  <div className="spinner-small"></div>
                  {mergeProgress ? (
                    <span style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "200px",
                      display: "inline-block",
                      verticalAlign: "bottom"
                    }}>
                      {mergeProgress.message || "Merging..."}
                    </span>
                  ) : (
                    "Merging..."
                  )}
                </>
              ) : mergeStatus === "error" ? (
                "Error - Retry"
              ) : isPlayingMerged ? (
                `⏸ Pause`
              ) : (
                `▶ Play Merged (Asanas)`
              )}
            </button>
          </div>

        )}
      </div>

      {/* Let's Begin Section */}
      <div className="plan-lets-section">
        <div className="plan-lets-header">
          <h4>Let's begin</h4>
        </div>

        {availableTabs.length > 0 && (
          <div className="plan-tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-link ${activeTab === tab.id ? "active-tab" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 16px",
                  borderBottom: activeTab === tab.id ? "2px solid var(--color-brand)" : "none"
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="plan-lets-list">
          {filteredAsanas.map((asana: AsanaItem) => {
            // Find original index in the full list for playback
            const index = orderedAsanas.findIndex(a => a.id === asana.id);
            const videoUrl = videoSources[asana.id]?.url;
            const imageUrl = imageSources[asana.id];
            return (
              <div
                key={asana.id}
                className={`plan-lesson-card ${currentVideoIndex === index ? "active" : ""}`}
                onClick={() => handleAsanaClick(index)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleAsanaClick(index);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="plan-lesson-thumb-wrapper">
                  <span className="plan-lesson-number">{index + 1}</span>
                  {imageUrl ? (
                    <img
                      src={getImageSrc(imageUrl)}
                      alt={asana.asanaName}
                      className="plan-lesson-thumb"
                    />
                  ) : (
                    <div className="plan-lesson-thumb-placeholder">No Image</div>
                  )}
                </div>
                <div className="plan-lesson-content">
                  <div className="plan-lesson-title-row">
                    <h5>{formatAsanaName(asana.asanaName)}</h5>
                    <button> Yoga</button>
                  </div>
                  <p className="plan-lesson-details">{asana.asanaDetails}</p>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
