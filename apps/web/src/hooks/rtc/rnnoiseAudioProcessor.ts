import { Track, type AudioProcessorOptions, type TrackProcessor } from "livekit-client";
import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

export type RnnoiseSuppressionLevel = "soft" | "medium" | "strong";

let rnnoiseWasmPromise: Promise<ArrayBuffer> | null = null;
const workletLoadByContext = new WeakMap<AudioContext, Promise<void>>();

const loadRnnoiseWasmBinary = () => {
  if (!rnnoiseWasmPromise) {
    rnnoiseWasmPromise = loadRnnoise({
      url: rnnoiseWasmUrl,
      simdUrl: rnnoiseSimdWasmUrl
    });
  }
  return rnnoiseWasmPromise;
};

const ensureWorkletLoaded = (audioContext: AudioContext) => {
  const existing = workletLoadByContext.get(audioContext);
  if (existing) {
    return existing;
  }

  const loading = audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);
  workletLoadByContext.set(audioContext, loading);
  return loading;
};

export class RnnoiseAudioProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "rnnoise-audio-processor";

  processedTrack?: MediaStreamTrack;

  private sourceNode?: MediaStreamAudioSourceNode;

  private destinationNode?: MediaStreamAudioDestinationNode;

  private rnnoiseNode?: RnnoiseWorkletNode;

  private dryGainNode?: GainNode;

  private wetGainNode?: GainNode;

  constructor(private readonly suppressionLevel: RnnoiseSuppressionLevel = "medium") {}

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.setupPipeline(opts);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.setupPipeline(opts);
  }

  async destroy(): Promise<void> {
    this.sourceNode?.disconnect();
    this.sourceNode = undefined;

    this.rnnoiseNode?.disconnect();
    this.rnnoiseNode?.destroy();
    this.rnnoiseNode = undefined;

    this.dryGainNode?.disconnect();
    this.dryGainNode = undefined;

    this.wetGainNode?.disconnect();
    this.wetGainNode = undefined;

    this.destinationNode?.disconnect();
    this.destinationNode = undefined;

    if (this.processedTrack) {
      this.processedTrack.stop();
      this.processedTrack = undefined;
    }
  }

  private async setupPipeline(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await ensureWorkletLoaded(opts.audioContext);

    const wasmBinary = await loadRnnoiseWasmBinary();
    const sourceStream = new MediaStream([opts.track]);

    this.sourceNode = opts.audioContext.createMediaStreamSource(sourceStream);
    this.rnnoiseNode = new RnnoiseWorkletNode(opts.audioContext, {
      wasmBinary,
      maxChannels: 1
    });
    this.dryGainNode = opts.audioContext.createGain();
    this.wetGainNode = opts.audioContext.createGain();
    this.destinationNode = opts.audioContext.createMediaStreamDestination();

    const levelMix: Record<RnnoiseSuppressionLevel, { dry: number; wet: number }> = {
      soft: { dry: 0.35, wet: 0.65 },
      medium: { dry: 0.15, wet: 0.85 },
      strong: { dry: 0, wet: 1 }
    };
    const mix = levelMix[this.suppressionLevel];
    this.dryGainNode.gain.value = mix.dry;
    this.wetGainNode.gain.value = mix.wet;

    this.sourceNode.connect(this.dryGainNode);
    this.dryGainNode.connect(this.destinationNode);

    this.sourceNode.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }
}
