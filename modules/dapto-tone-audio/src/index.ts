import { requireOptionalNativeModule } from 'expo-modules-core';

export type ToneEar = 'left' | 'right';
export type ToneRoute = { headphonesConnected: boolean; stereoOutput: boolean; routeName: string };
type DaptoToneAudioNative = {
  prepare(): Promise<ToneRoute>;
  playTone(frequencyHz: number, ear: ToneEar, gain: number, durationMs: number): Promise<void>;
  stopTone(): Promise<void>;
  cleanup(): Promise<void>;
  addListener(eventName: 'onAudioUnavailable', listener: (event: { reason: string }) => void): { remove(): void };
};

const nativeModule = requireOptionalNativeModule<DaptoToneAudioNative>('DaptoToneAudio');
const unavailableMessage = 'Pure-tone hearing screening requires the Dapto development or store build. It is not available in Expo Go.';

const ToneAudio = {
  isAvailable: nativeModule != null,
  async prepare(): Promise<ToneRoute> {
    if (!nativeModule) throw new Error(unavailableMessage);
    return nativeModule.prepare();
  },
  async playTone(frequencyHz: number, ear: ToneEar, gain: number, durationMs: number): Promise<void> {
    if (!nativeModule) throw new Error(unavailableMessage);
    return nativeModule.playTone(frequencyHz, ear, gain, durationMs);
  },
  async stopTone(): Promise<void> {
    if (nativeModule) await nativeModule.stopTone();
  },
  async cleanup(): Promise<void> {
    if (nativeModule) await nativeModule.cleanup();
  },
  addListener(eventName: 'onAudioUnavailable', listener: (event: { reason: string }) => void) {
    return nativeModule?.addListener(eventName, listener) ?? { remove() {} };
  },
};

export default ToneAudio;
