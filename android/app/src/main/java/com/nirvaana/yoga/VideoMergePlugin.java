package com.nirvaana.yoga;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

import android.content.Context;

@CapacitorPlugin(name = "VideoMerge")
public class VideoMergePlugin extends Plugin {

    private static final String TAG = "VideoMergePlugin";

    @PluginMethod
    public void mergeVideos(PluginCall call) {
        JSArray videoPathsArray = call.getArray("videoPaths");
        String outputPath = call.getString("outputPath");

        if (videoPathsArray == null || videoPathsArray.length() == 0) {
            call.reject("No video paths provided");
            return;
        }
        if (outputPath == null || outputPath.isEmpty()) {
            call.reject("No output path provided");
            return;
        }

        final String finalOutputPath = outputPath.startsWith("file://") ? outputPath.replace("file://", "")
                : outputPath;

        List<String> videoPaths = new ArrayList<>();
        try {
            for (int i = 0; i < videoPathsArray.length(); i++) {
                videoPaths.add(videoPathsArray.getString(i));
            }
        } catch (JSONException e) {
            call.reject("Invalid video paths format");
            return;
        }

        new Thread(() -> {
            try {
                boolean success = mergeVideoFiles(getContext(), videoPaths, finalOutputPath);
                if (success) {
                    JSObject ret = new JSObject();
                    ret.put("path", finalOutputPath);
                    call.resolve(ret);
                } else {
                    call.reject("Failed to merge videos");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error merging videos", e);
                call.reject("Error merging videos: " + e.getMessage());
            }
        }).start();
    }

    private long lastProgressUpdate = 0;

    private boolean mergeVideoFiles(Context context, List<String> videoPaths, String outputVideoPath)
            throws IOException {
        if (videoPaths.isEmpty())
            return false;

        MediaMuxer muxer = new MediaMuxer(outputVideoPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int videoTrackIndex = -1;
        int audioTrackIndex = -1;
        int videoRotation = 0;

        // Use the first video to set up tracks
        MediaExtractor extractorConfig = new MediaExtractor();
        try {
            Log.d(TAG, "Setting data source for config: " + videoPaths.get(0));
            setDataSource(extractorConfig, context, videoPaths.get(0));
        } catch (Exception e) {
            Log.e(TAG, "Failed to setup extractor for first video: " + videoPaths.get(0), e);
            extractorConfig.release();
            muxer.release();
            throw new IOException("Failed to setup extractor for first video: " + videoPaths.get(0), e);
        }

        int sourceVideoTrackIndex = -1;
        int sourceAudioTrackIndex = -1;

        for (int i = 0; i < extractorConfig.getTrackCount(); i++) {
            MediaFormat format = extractorConfig.getTrackFormat(i);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime.startsWith("video/")) {
                sourceVideoTrackIndex = i;
                videoTrackIndex = muxer.addTrack(format);
                if (format.containsKey(MediaFormat.KEY_ROTATION)) {
                    videoRotation = format.getInteger(MediaFormat.KEY_ROTATION);
                }
            } else if (mime.startsWith("audio/")) {
                sourceAudioTrackIndex = i;
                audioTrackIndex = muxer.addTrack(format);
            }
        }

        muxer.setOrientationHint(videoRotation);
        muxer.start();
        extractorConfig.release();

        long videoPtsOffset = 0;
        long audioPtsOffset = 0;

        // Maps to keep track of the max PTS from previous file to update offset
        long maxVideoPts = 0;
        long maxAudioPts = 0;

        // Buffer for reading samples
        // Allocate a large buffer (e.g. 2MB) to handle 4K frames if necessary
        ByteBuffer buffer = ByteBuffer.allocate(2 * 1024 * 1024);
        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();

        int totalFiles = videoPaths.size();

        for (int i = 0; i < totalFiles; i++) {
            String path = videoPaths.get(i);
            MediaExtractor extractor = new MediaExtractor();
            try {
                setDataSource(extractor, context, path);
            } catch (Exception e) {
                Log.e(TAG, "Failed to open " + path, e);
                // If a file fails, should we continue? For now, let's abort or skip.
                // Aborting ensures integrity.
                extractor.release();
                muxer.release();
                throw new IOException("Failed to open file: " + path, e); // Rethrow
            }

            // Find tracks in current file
            int currentVideoTrackIndex = -1;
            int currentAudioTrackIndex = -1;
            long fileDurationUs = 0;

            for (int k = 0; k < extractor.getTrackCount(); k++) {
                MediaFormat format = extractor.getTrackFormat(k);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime.startsWith("video/")) {
                    currentVideoTrackIndex = k;
                    if (format.containsKey(MediaFormat.KEY_DURATION)) {
                        fileDurationUs = format.getLong(MediaFormat.KEY_DURATION);
                    }
                } else if (mime.startsWith("audio/")) {
                    currentAudioTrackIndex = k;
                }
            }

            // Process Video
            if (currentVideoTrackIndex >= 0 && videoTrackIndex >= 0) {
                extractor.selectTrack(currentVideoTrackIndex);
                while (true) {
                    int sampleSize = extractor.readSampleData(buffer, 0);
                    if (sampleSize < 0)
                        break;

                    long sampleTime = extractor.getSampleTime();
                    int flags = extractor.getSampleFlags();

                    bufferInfo.offset = 0;
                    bufferInfo.size = sampleSize;
                    bufferInfo.presentationTimeUs = sampleTime + videoPtsOffset;
                    bufferInfo.flags = flags;

                    muxer.writeSampleData(videoTrackIndex, buffer, bufferInfo);

                    if (bufferInfo.presentationTimeUs > maxVideoPts) {
                        maxVideoPts = bufferInfo.presentationTimeUs;
                    }

                    // UPDATE PROGRESS
                    // Calculate progress for the current file
                    float fileProgress = 0;
                    if (fileDurationUs > 0) {
                        fileProgress = (float) sampleTime / fileDurationUs;
                    }
                    // Avoid > 1.0 due to small duration differences
                    if (fileProgress > 1.0f)
                        fileProgress = 1.0f;

                    // Total progress = (completedUtils + fractionOfCurrent) / total
                    float totalProgress = (i + fileProgress) / totalFiles;
                    updateProgress(totalProgress, "Merging video " + (i + 1) + " of " + totalFiles);

                    extractor.advance();
                }
                extractor.unselectTrack(currentVideoTrackIndex);
            }

            // Process Audio
            if (currentAudioTrackIndex >= 0 && audioTrackIndex >= 0) {
                extractor.selectTrack(currentAudioTrackIndex);
                while (true) {
                    int sampleSize = extractor.readSampleData(buffer, 0);
                    if (sampleSize < 0)
                        break;

                    long sampleTime = extractor.getSampleTime();
                    int flags = extractor.getSampleFlags();

                    bufferInfo.offset = 0;
                    bufferInfo.size = sampleSize;
                    bufferInfo.presentationTimeUs = sampleTime + audioPtsOffset;
                    bufferInfo.flags = flags;

                    muxer.writeSampleData(audioTrackIndex, buffer, bufferInfo);

                    if (bufferInfo.presentationTimeUs > maxAudioPts) {
                        maxAudioPts = bufferInfo.presentationTimeUs;
                    }

                    extractor.advance();
                }
                extractor.unselectTrack(currentAudioTrackIndex);
            }

            extractor.release();

            long videoDelta = 33000; // ~30fps 33ms
            long audioDelta = 23000; // just an estimate

            videoPtsOffset = maxVideoPts + videoDelta;
            audioPtsOffset = maxAudioPts + audioDelta;
        }

        muxer.stop();
        muxer.release();
        return true;
    }

    private void updateProgress(float progress, String message) {
        long now = System.currentTimeMillis();
        // Throttle updates to every 100ms or if complete
        if (now - lastProgressUpdate > 100 || progress >= 1.0f) {
            lastProgressUpdate = now;
            JSObject ret = new JSObject();
            ret.put("progress", progress);
            ret.put("message", message);
            notifyListeners("onProgress", ret);
        }
    }

    private void setDataSource(MediaExtractor extractor, Context context, String path) throws IOException {
        Log.d(TAG, "setDataSource path: " + path);
        if (path.startsWith("content://") || path.startsWith("file://")) {
            try {
                android.net.Uri uri = android.net.Uri.parse(path);
                if ("file".equals(uri.getScheme()) && uri.getPath() != null) {
                    File f = new File(uri.getPath());
                    Log.d(TAG, "File check - Exists: " + f.exists() + ", Size: " + f.length() + ", Path: "
                            + f.getAbsolutePath());
                }
                extractor.setDataSource(context, uri, null); // Use passed context
            } catch (Exception e) {
                Log.w(TAG, "URI setDataSource failed for " + path + ", falling back to raw path. Error: "
                        + e.getMessage());
                // Fallback to path if URI parsing fails
                extractor.setDataSource(path);
            }
        } else {
            File f = new File(path);
            Log.d(TAG,
                    "File check - Exists: " + f.exists() + ", Size: " + f.length() + ", Path: " + f.getAbsolutePath());
            extractor.setDataSource(path);
        }
    }
}
