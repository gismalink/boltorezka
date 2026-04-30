import { asTrimmedString } from "./stringUtils";
export type ChatImagePolicy = {
  maxDataUrlLength: number;
  maxImageSide: number;
  jpegQuality: number;
};

export function extractImageSourceFromClipboardHtml(html: string): string {
  if (!html) {
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const image = doc.querySelector("img[src]");
  if (!image) {
    return "";
  }

  const source = asTrimmedString(image.getAttribute("src"));
  return source;
}

export function normalizeImageSource(value: string): string {
  const source = asTrimmedString(value);
  if (!source) {
    return "";
  }

  if (source.startsWith("data:image/")) {
    return source.replace(/\s+/g, "");
  }

  return source;
}

export function extractImageSourceFromClipboardText(text: string): string {
  const sourceText = String(text || "");
  if (!sourceText) {
    return "";
  }

  const markdownMatch = sourceText.match(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|https?:\/\/[^)\s]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^)\s]*)?)\)/i);
  if (markdownMatch?.[1]) {
    return normalizeImageSource(markdownMatch[1]);
  }

  const dataUrlMatch = sourceText.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/i);
  if (dataUrlMatch?.[0]) {
    return normalizeImageSource(dataUrlMatch[0]);
  }

  return "";
}

export function compressImageToDataUrl(file: File, policy: ChatImagePolicy): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const source = String(reader.result || "");
      if (!source.startsWith("data:image/")) {
        reject(new Error("invalid_image"));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("decode_failed"));
      image.onload = () => {
        const originalWidth = Math.max(1, Math.round(image.naturalWidth || 1));
        const originalHeight = Math.max(1, Math.round(image.naturalHeight || 1));

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("canvas_context_unavailable"));
          return;
        }

        const qualitySteps = [
          policy.jpegQuality,
          0.82,
          0.74,
          0.66,
          0.58,
          0.5,
          0.42,
          0.35
        ].filter((value, index, array) => Number.isFinite(value) && value > 0.08 && value <= 1 && array.indexOf(value) === index);

        let bestCompressed = "";
        for (let scaleStep = 0; scaleStep < 8; scaleStep += 1) {
          const maxSideLimit = Math.max(64, Math.floor(policy.maxImageSide * Math.pow(0.85, scaleStep)));
          const maxSide = Math.max(originalWidth, originalHeight);
          const scale = maxSide > maxSideLimit ? maxSideLimit / maxSide : 1;
          const targetWidth = Math.max(1, Math.round(originalWidth * scale));
          const targetHeight = Math.max(1, Math.round(originalHeight * scale));

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          context.clearRect(0, 0, targetWidth, targetHeight);
          context.drawImage(image, 0, 0, targetWidth, targetHeight);

          for (const quality of qualitySteps) {
            const compressed = canvas.toDataURL("image/jpeg", quality);
            bestCompressed = compressed;
            if (compressed.length <= policy.maxDataUrlLength) {
              resolve(compressed);
              return;
            }
          }
        }

        if (bestCompressed.length > 0 && bestCompressed.length <= policy.maxDataUrlLength) {
          resolve(bestCompressed);
          return;
        }

        reject(new Error("image_too_large"));
      };
      image.src = source;
    };

    reader.readAsDataURL(file);
  });
}
