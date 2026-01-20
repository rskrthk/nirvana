import { registerPlugin } from '@capacitor/core';

export interface VideoMergePlugin {
    mergeVideos(options: { videoPaths: string[]; outputPath: string }): Promise<{ path: string }>;
    addListener(eventName: 'onProgress', listenerFunc: (info: { progress: number; message: string }) => void): Promise<import('@capacitor/core').PluginListenerHandle> & import('@capacitor/core').PluginListenerHandle;
}

const VideoMerge = registerPlugin<VideoMergePlugin>('VideoMerge');

export default VideoMerge;
