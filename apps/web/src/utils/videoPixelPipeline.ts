export type OutgoingVideoTrackHandle = {
  track: MediaStreamTrack;
  stop: () => void;
};

export type VideoRenderEffectType = "none" | "pixel8" | "ascii";

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
] as const;

export function extractTrackConstraints(constraints: MediaTrackConstraints | false) {
  if (!constraints || constraints === false) {
    return { width: 320, height: 240, fps: 15 };
  }

  const widthConstraint = constraints.width;
  const heightConstraint = constraints.height;
  const fpsConstraint = constraints.frameRate;

  const width = typeof widthConstraint === "number"
    ? widthConstraint
    : typeof widthConstraint === "object" && widthConstraint !== null && typeof widthConstraint.ideal === "number"
      ? widthConstraint.ideal
      : 320;

  const height = typeof heightConstraint === "number"
    ? heightConstraint
    : typeof heightConstraint === "object" && heightConstraint !== null && typeof heightConstraint.ideal === "number"
      ? heightConstraint.ideal
      : 240;

  const fps = typeof fpsConstraint === "number"
    ? fpsConstraint
    : typeof fpsConstraint === "object" && fpsConstraint !== null && typeof fpsConstraint.ideal === "number"
      ? fpsConstraint.ideal
      : 15;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    fps: Math.max(5, Math.min(30, Math.round(fps)))
  };
}

export function createProcessedVideoTrack(
  sourceTrack: MediaStreamTrack,
  options: {
    width: number;
    height: number;
    fps: number;
    effectType?: VideoRenderEffectType;
    strength: number;
    pixelSize: number;
    gridThickness?: number;
    asciiCellSize?: number;
    asciiContrast?: number;
  }
): OutgoingVideoTrackHandle | null {
  if (typeof document === "undefined") {
    return null;
  }

  const sourceStream = new MediaStream([sourceTrack]);
  const sourceVideo = document.createElement("video");
  sourceVideo.autoplay = true;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.srcObject = sourceStream;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = options.width;
  outputCanvas.height = options.height;
  const outputCtx = outputCanvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!outputCtx) {
    sourceTrack.stop();
    return null;
  }

  const mosaicScale = Math.max(1, Math.round(options.pixelSize));
  const mosaicCanvas = document.createElement("canvas");
  mosaicCanvas.width = Math.max(1, Math.floor(options.width / mosaicScale));
  mosaicCanvas.height = Math.max(1, Math.floor(options.height / mosaicScale));
  const mosaicCtx = mosaicCanvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!mosaicCtx) {
    sourceTrack.stop();
    return null;
  }

  const clampedStrength = Math.max(0, Math.min(100, options.strength));
  const quantLevels = Math.max(2, Math.round(16 - (clampedStrength / 100) * 12));
  const quantScale = 255 / (quantLevels - 1);
  const ditherAmount = (clampedStrength / 100) * 0.35;
  const gridThickness = Math.max(0, Math.round(options.gridThickness ?? 1));
  const effectType = options.effectType || "pixel8";
  const asciiCellSize = Math.max(4, Math.min(16, Math.round(options.asciiCellSize ?? 8)));
  const asciiContrastFactor = Math.max(0.2, Math.min(2, (options.asciiContrast ?? 120) / 100));
  const asciiChars = " .,:;irsXA253hMHGS#9B&@";

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  const drawFrame = () => {
    if (sourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    if (effectType === "ascii") {
      outputCtx.drawImage(sourceVideo, 0, 0, options.width, options.height);
      const imageData = outputCtx.getImageData(0, 0, options.width, options.height);
      const { data } = imageData;

      outputCtx.fillStyle = "#000";
      outputCtx.fillRect(0, 0, options.width, options.height);
      outputCtx.textBaseline = "top";
      outputCtx.font = `${asciiCellSize}px monospace`;

      for (let y = 0; y < options.height; y += asciiCellSize) {
        for (let x = 0; x < options.width; x += asciiCellSize) {
          const sampleX = Math.min(options.width - 1, x + Math.floor(asciiCellSize / 2));
          const sampleY = Math.min(options.height - 1, y + Math.floor(asciiCellSize / 2));
          const index = (sampleY * options.width + sampleX) * 4;

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];

          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const contrasted = clamp01((luminance - 0.5) * asciiContrastFactor + 0.5);
          const charIndex = Math.max(0, Math.min(asciiChars.length - 1, Math.floor((1 - contrasted) * (asciiChars.length - 1))));
          const symbol = asciiChars[charIndex];

          const shade = Math.round(contrasted * 255);
          outputCtx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
          outputCtx.fillText(symbol, x, y);
        }
      }

      return;
    }

    mosaicCtx.drawImage(sourceVideo, 0, 0, mosaicCanvas.width, mosaicCanvas.height);
    outputCtx.imageSmoothingEnabled = false;
    outputCtx.drawImage(mosaicCanvas, 0, 0, options.width, options.height);

    const imageData = outputCtx.getImageData(0, 0, options.width, options.height);
    const { data } = imageData;

    for (let y = 0; y < options.height; y += 1) {
      for (let x = 0; x < options.width; x += 1) {
        const index = (y * options.width + x) * 4;
        const threshold = BAYER_4X4[y % 4][x % 4] / 16 - 0.5;
        const dither = threshold * ditherAmount * 255;

        for (let channel = 0; channel < 3; channel += 1) {
          const value = Math.max(0, Math.min(255, data[index + channel] + dither));
          const quantized = Math.round(value / quantScale) * quantScale;
          data[index + channel] = Math.max(0, Math.min(255, Math.round(quantized)));
        }
      }
    }

    outputCtx.putImageData(imageData, 0, 0);

    if (gridThickness > 0) {
      outputCtx.save();
      outputCtx.globalCompositeOperation = "multiply";
      outputCtx.fillStyle = "rgba(0, 0, 0, 0.38)";

      for (let gridX = mosaicScale; gridX < options.width; gridX += mosaicScale) {
        const lineX = Math.max(0, Math.min(options.width - 1, gridX - Math.floor(gridThickness / 2)));
        outputCtx.fillRect(lineX, 0, gridThickness, options.height);
      }

      for (let gridY = mosaicScale; gridY < options.height; gridY += mosaicScale) {
        const lineY = Math.max(0, Math.min(options.height - 1, gridY - Math.floor(gridThickness / 2)));
        outputCtx.fillRect(0, lineY, options.width, gridThickness);
      }

      outputCtx.restore();
    }
  };

  const interval = window.setInterval(drawFrame, Math.max(16, Math.round(1000 / options.fps)));
  void sourceVideo.play().catch(() => {
    return;
  });

  const captureStream = outputCanvas.captureStream(options.fps);
  const processedTrack = captureStream.getVideoTracks()[0] || null;
  if (!processedTrack) {
    window.clearInterval(interval);
    sourceTrack.stop();
    return null;
  }

  return {
    track: processedTrack,
    stop: () => {
      window.clearInterval(interval);
      processedTrack.stop();
      sourceTrack.stop();
      sourceVideo.pause();
      sourceVideo.srcObject = null;
      captureStream.getTracks().forEach((track) => track.stop());
    }
  };
}
