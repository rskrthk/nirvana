import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Http } from "@capacitor-community/http";
import VideoMerge from "./VideoMergePlugin";

/* ==========================================================================
   1. Singleton FFmpeg Implementation
   ========================================================================== */
let ffmpegInstance: FFmpeg | null = null;
let isProcessing = false;

/**
 * Retrieves the singleton FFmpeg instance, initializing it if necessary.
 * Ensures thread-safe initialization (conceptually) for the application lifecycle.
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    // Load FFmpeg (this loads the WASM core)
    await ffmpegInstance.load();
  }
  return ffmpegInstance;
}

/* ==========================================================================
   Configuration & Helpers
   ========================================================================== */

/**
 * 2. Chunk-based Merging Optimization (Heuristic)
 * Determines optimal chunk size based on available system resources (concurrency).
 */
const getOptimalChunkSize = (): number => {
  // Use hardware concurrency as a proxy for device capability
  // Low concurrency (<= 4) usually implies mobile/older devices -> smaller chunks
  const concurrency = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return concurrency <= 4 ? 3 : 5;
};

export interface MergeOptions {
  /**
   * 4. Progress Tracking Hook
   * Callback for real-time progress updates.
   */
  onProgress?: (progress: number, status: string) => void;
}

/* ==========================================================================
   Main Logic
   ========================================================================== */

export const MergeVideos = async (
  playlist: { videoUrl: string }[] | any[],
  options?: MergeOptions
): Promise<string> => {
  // 5. Memory Safety Controls (Locking)
  if (isProcessing) {
    throw new Error("Video processing is already in progress. Please wait for the current operation to finish.");
  }

  // Android Optimization
  if (Capacitor.getPlatform() === 'android') {
    isProcessing = true;
    try {
      return await mergeVideosAndroid(playlist, options);
    } catch (e) {
      console.error("Android merge failed", e);
      throw e;
    } finally {
      isProcessing = false;
    }
  }

  isProcessing = true;
  const createdFiles: Set<string> = new Set();
  const ffmpeg = await getFFmpeg();

  const reportProgress = (percent: number, status: string) => {
    if (options?.onProgress) {
      options.onProgress(Math.min(percent, 0.99), status);
    }
  };

  try {
    reportProgress(0.05, "Initializing video engine...");

    const chunkSize = getOptimalChunkSize();
    const totalVideos = playlist.length;
    const chunkFiles: string[] = [];
    let processedCount = 0;

    // 2. Chunk-based Merging Optimization
    for (let i = 0; i < totalVideos; i += chunkSize) {
      const chunkItems = playlist.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      const chunkOutputName = `chunk_${Date.now()}_${chunkIndex}.mp4`;

      const currentProgress = 0.1 + (processedCount / totalVideos) * 0.7;
      reportProgress(currentProgress, `Processing batch ${chunkIndex + 1} of ${Math.ceil(totalVideos / chunkSize)}...`);

      // Process this chunk
      await processChunk(ffmpeg, chunkItems, chunkOutputName, createdFiles);

      chunkFiles.push(chunkOutputName);
      createdFiles.add(chunkOutputName);
      processedCount += chunkItems.length;
    }

    // Final Merge
    reportProgress(0.85, "Finalizing video...");
    const finalOutputName = "output_final.mp4";

    if (chunkFiles.length === 1) {
      // Optimization: If only one chunk, just copy it
      await ffmpeg.exec(["-i", chunkFiles[0], "-c", "copy", finalOutputName]);
    } else {
      await concatFiles(ffmpeg, chunkFiles, finalOutputName, createdFiles);
    }
    createdFiles.add(finalOutputName);

    // Read result
    reportProgress(0.95, "Generating output...");
    const data = await ffmpeg.readFile(finalOutputName);

    // 5. Memory Safety Controls (Blob creation)
    const blob = new Blob([data as any], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    reportProgress(1.0, "Complete!");
    return url;

  } catch (err) {
    console.error("Video Merge Error:", err);
    throw err;
  } finally {
    // 3. Aggressive Resource Cleanup
    isProcessing = false;
    await cleanupFiles(ffmpeg, createdFiles);
  }
};

/**
 * Helper: Processes a subset of videos into a single intermediate chunk.
 * Handles downloading, writing to FS, and cleaning up input files immediately.
 */
async function processChunk(
  ffmpeg: FFmpeg,
  items: { videoUrl: string }[] | any[],
  outputName: string,
  globalCreatedFiles: Set<string>
) {
  const localInputFiles: string[] = [];

  try {
    // Download and write inputs
    for (let i = 0; i < items.length; i++) {
      const fileName = `temp_in_${Date.now()}_${i}.mp4`;
      const fileData = await fetchFile(items[i].videoUrl);
      await ffmpeg.writeFile(fileName, fileData);
      localInputFiles.push(fileName);
      globalCreatedFiles.add(fileName);
    }

    // Merge inputs to chunk
    await concatFiles(ffmpeg, localInputFiles, outputName, globalCreatedFiles);

  } finally {
    // Immediate cleanup of input fragments to free memory
    for (const file of localInputFiles) {
      await safeDelete(ffmpeg, file);
      globalCreatedFiles.delete(file);
    }
  }
}

/**
 * Helper: Concatenates a list of files using FFmpeg's concat demuxer.
 */
async function concatFiles(
  ffmpeg: FFmpeg,
  fileNames: string[],
  outputName: string,
  globalCreatedFiles: Set<string>
) {
  const listFileName = `list_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`;
  const fileContent = fileNames.map(f => `file ${f}`).join("\n");

  await ffmpeg.writeFile(listFileName, fileContent);
  globalCreatedFiles.add(listFileName);

  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", listFileName,
    "-c", "copy",
    outputName
  ]);

  // Clean up list file
  await safeDelete(ffmpeg, listFileName);
  globalCreatedFiles.delete(listFileName);
}

/**
 * 3. Aggressive Resource Cleanup
 * Iterates through tracked files and deletes them from the WASM filesystem.
 */
async function cleanupFiles(ffmpeg: FFmpeg, files: Set<string>) {
  files.forEach(async (file) => {
    await safeDelete(ffmpeg, file);
  });
  files.clear();
}

async function safeDelete(ffmpeg: FFmpeg, file: string) {
  try {
    await ffmpeg.deleteFile(file);
  } catch (e) {
    // Ignore errors if file already deleted or not found
  }
}

/* ==========================================================================
   Android Native Implementation
   ========================================================================== */
async function mergeVideosAndroid(
  playlist: { videoUrl: string }[] | any[],
  options?: MergeOptions
): Promise<string> {
  const localPaths: string[] = [];
  const cacheDir = Directory.Cache;
  const tempDirName = `video_merge_${Date.now()}`;

  // Create temp dir
  try {
    await Filesystem.mkdir({
      path: tempDirName,
      directory: cacheDir,
      recursive: true
    });
  } catch (e) {
    console.error("Failed to create temp dir", e);
  }

  const reportProgress = (percent: number, status: string) => {
    if (options?.onProgress) {
      options.onProgress(Math.min(percent, 0.99), status);
    }
  };

  try {
    // Download files
    for (let i = 0; i < playlist.length; i++) {
      const url = playlist[i].videoUrl;

      // Validations
      if (!url) continue;

      const filename = `vid_${Date.now()}_${i}.mp4`;
      const filePath = `${tempDirName}/${filename}`;

      // 1. Handle Blob URLs (created by URL.createObjectURL)
      if (url.startsWith('blob:')) {
        console.log(`Processing Blob URL: ${url}`);
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          await Filesystem.writeFile({
            path: filePath,
            data: base64,
            directory: cacheDir
          });

          const uri = await Filesystem.getUri({
            path: filePath,
            directory: cacheDir
          });
          localPaths.push(uri.uri);
          console.log(`Blob saved to: ${uri.uri}`);
          continue;
        } catch (e) {
          console.error(`Failed to process blob URL ${url}`, e);
          throw e;
        }
      }

      // 2. Handle Capacitor Local Files (http://localhost/_capacitor_file_)
      if (url.includes('_capacitor_file_')) {
        console.log(`Processing Capacitor Local URL: ${url}`);
        // Extract path. usually http://localhost/_capacitor_file_/<path>
        // We can just decode it.
        // But to be safe and compatible with VideoMergePlugin which expects file:// or absolute path:
        // We can leave it as is if we trust the plugin? No, plugin uses MediaExtractor which might not like http://localhost.
        // Let's convert to absolute path if possible.
        // Actually, we can just copy it to our temp dir to be safe and consistent, 
        // OR try to extract the path.

        // Let's try to extract the path.
        const prefix = "_capacitor_file_";
        const idx = url.indexOf(prefix);
        if (idx !== -1) {
          let path = url.substring(idx + prefix.length);
          path = decodeURIComponent(path);
          console.log(`Extracted path: ${path}`);
          localPaths.push(path); // This should be an absolute path
          continue;
        }
      }

      const isHttp = url.startsWith('http://') || url.startsWith('https://');

      if (isHttp) {
        const filename = `vid_${i}.mp4`;
        const filePath = `${tempDirName}/${filename}`;

        reportProgress(
          (i / playlist.length) * 0.8,
          `Downloading video ${i + 1} of ${playlist.length}...`
        );

        // Download using Native Http to save to disk directly
        console.log(`Downloading ${url} to ${filePath}`);
        const ret = await Http.downloadFile({
          url: url,
          filePath: filePath,
          fileDirectory: cacheDir as any
        });
        console.log(`Download result for ${filename}:`, ret);

        // Resolve absolute path
        if (ret.path) {
          localPaths.push(ret.path);
        } else {
          const uri = await Filesystem.getUri({
            path: filePath,
            directory: cacheDir
          });
          console.log(`Resolved URI for ${filename}:`, uri);
          localPaths.push(uri.uri);
        }

        // Verify file existence and size
        try {
          const stat = await Filesystem.stat({
            path: filePath,
            directory: cacheDir
          });
          console.log(`File stat for ${filename}:`, stat);
          if (stat.size === 0) {
            console.error(`File ${filename} is empty!`);
          }
        } catch (e) {
          console.error(`Failed to stat file ${filename}`, e);
        }
      } else {
        // Assume local path or content URI
        localPaths.push(url);
      }
    }

    reportProgress(0.8, "Merging videos...");

    const outputFilename = `merged_${Date.now()}.mp4`;
    // We need absolute path for output. 
    // VideoMergePlugin expects absolute paths for inputs? Yes. 
    // localPaths from Http.downloadFile should be absolute "file://..." or similar. The plugin uses MediaExtractor which handles file://.
    // For output, we need a writable path. 

    // Let's determine output path.
    const outputRet = await Filesystem.getUri({
      path: `${tempDirName}/${outputFilename}`,
      directory: cacheDir
    });

    let progressListener: any = null;
    try {
      progressListener = await VideoMerge.addListener('onProgress', (info: { progress: number, message: string }) => {
        // Map native progress 0-1 to 0.8-0.99
        const overallProgress = 0.8 + (info.progress * 0.19);
        reportProgress(overallProgress, info.message || "Merging videos...");
      });
    } catch (e) {
      console.warn("Failed to add progress listener", e);
    }

    try {
      const result = await VideoMerge.mergeVideos({
        videoPaths: localPaths,
        outputPath: outputRet.uri
      });

      reportProgress(1.0, "Complete!");

      return Capacitor.convertFileSrc(result.path);
    } finally {
      if (progressListener) {
        progressListener.remove();
      }
    }

  } catch (e) {
    console.error("Error in native merge", e);
    throw e;
  } finally {
    // Cleanup?
    // Maybe cleanup input files but keep output?
    // Since we return a path to the file, we shouldn't delete the directory yet if the output is in it.
    // But we can delete inputs.
  }
}
