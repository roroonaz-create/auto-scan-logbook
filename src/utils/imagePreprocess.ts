/**
 * Image Preprocessing Utility for Handwritten Logbook Scanning
 * 
 * Features:
 * - Upscaling to >= 1500px on the longest dimension with high-quality interpolation
 * - Auto-contrast stretching (histogram percentile stretch for vivid ink against white paper)
 * - Edge sharpening via 3x3 convolution filter
 * - Lossless canvas rotation (90°, 180°, 270°)
 * - Interactive rectangular cropping
 */

export interface PreprocessOptions {
  autoContrast?: boolean;
  sharpen?: boolean;
  minResolution?: number; // minimum pixels on longest side (default: 1500)
  rotation?: number; // in degrees: 0, 90, 180, 270
  crop?: {
    x: number; // percentage (0 - 100) or pixel
    y: number;
    width: number;
    height: number;
    isPercent?: boolean;
  } | null;
}

export interface PreprocessResult {
  processedDataUrl: string;
  base64Data: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
}

export async function processLogbookImage(
  imageSource: string | File | Blob,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const {
    autoContrast = true,
    sharpen = true,
    minResolution = 1500,
    rotation = 0,
    crop = null,
  } = options;

  // 1. Load image into HTMLImageElement
  const img = await loadImage(imageSource);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // 2. Calculate source crop dimensions
  let srcX = 0;
  let srcY = 0;
  let srcW = origW;
  let srcH = origH;

  if (crop && crop.width > 0 && crop.height > 0) {
    if (crop.isPercent) {
      srcX = Math.max(0, Math.round((crop.x / 100) * origW));
      srcY = Math.max(0, Math.round((crop.y / 100) * origH));
      srcW = Math.min(origW - srcX, Math.round((crop.width / 100) * origW));
      srcH = Math.min(origH - srcY, Math.round((crop.height / 100) * origH));
    } else {
      srcX = Math.max(0, Math.round(crop.x));
      srcY = Math.max(0, Math.round(crop.y));
      srcW = Math.min(origW - srcX, Math.round(crop.width));
      srcH = Math.min(origH - srcY, Math.round(crop.height));
    }
  }

  // 3. Determine dimension after rotation
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270;

  const croppedW = isRotated90or270 ? srcH : srcW;
  const croppedH = isRotated90or270 ? srcW : srcH;

  // 4. Calculate scaling so longest side is at least minResolution (e.g. 1500px)
  const longestCroppedSide = Math.max(croppedW, croppedH);
  let scale = 1.0;
  if (longestCroppedSide < minResolution) {
    scale = minResolution / longestCroppedSide;
  }
  // Cap max resolution to 2400px to ensure fast upload and processing
  if (longestCroppedSide * scale > 2400) {
    scale = 2400 / longestCroppedSide;
  }

  const finalW = Math.max(1, Math.round(croppedW * scale));
  const finalH = Math.max(1, Math.round(croppedH * scale));

  // 5. Setup Canvas and apply transform
  const canvas = document.createElement("canvas");
  canvas.width = finalW;
  canvas.height = finalH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Gagal menginisialisasi canvas rendering context 2D");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill with clean neutral white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, finalW, finalH);

  ctx.save();
  // Move origin to center of destination canvas
  ctx.translate(finalW / 2, finalH / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);

  // Draw the cropped portion scaled
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  ctx.drawImage(
    img,
    srcX,
    srcY,
    srcW,
    srcH,
    -drawW / 2,
    -drawH / 2,
    drawW,
    drawH
  );
  ctx.restore();

  // 6. Apply Auto-Contrast and Sharpening if requested
  if (autoContrast || sharpen) {
    let imgData = ctx.getImageData(0, 0, finalW, finalH);

    if (autoContrast) {
      imgData = applyAutoContrast(imgData);
    }

    if (sharpen) {
      imgData = applySharpenFilter(imgData, finalW, finalH);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // 7. Export result
  const mimeType = "image/jpeg";
  const processedDataUrl = canvas.toDataURL(mimeType, 0.93);
  const base64Data = processedDataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

  return {
    processedDataUrl,
    base64Data,
    mimeType,
    originalWidth: origW,
    originalHeight: origH,
    finalWidth: finalW,
    finalHeight: finalH,
  };
}

/**
 * Loads an image from a Data URL, File, or Blob into an HTMLImageElement
 */
function loadImage(source: string | File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Gagal membaca file gambar: " + err));

    if (typeof source === "string") {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Auto-Contrast Enhancement (Gentle Percentile Histogram Stretch)
 * Expands dynamic range subtly without clipping delicate pencil or light pen strokes.
 */
function applyAutoContrast(imageData: ImageData): ImageData {
  const data = imageData.data;
  const len = data.length;

  // Build brightness histogram
  const hist = new Uint32Array(256);
  let pixelCount = 0;

  for (let i = 0; i < len; i += 4) {
    // Luminance approximation
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[Math.min(255, Math.floor(lum))]++;
    pixelCount++;
  }

  // Conservative percentiles (0.2% and 99.8%) to preserve faint strokes and avoid white clipping
  const lowThreshold = pixelCount * 0.002;
  const highThreshold = pixelCount * 0.998;

  let acc = 0;
  let pLow = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowThreshold) {
      pLow = i;
      break;
    }
  }

  acc = 0;
  let pHigh = 255;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= pixelCount - highThreshold) {
      pHigh = i;
      break;
    }
  }

  if (pHigh <= pLow + 15) {
    pLow = Math.max(0, pLow - 10);
    pHigh = Math.min(255, pHigh + 10);
  }

  const range = pHigh - pLow;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i <= pLow) {
      lut[i] = 0;
    } else if (i >= pHigh) {
      lut[i] = 255;
    } else {
      lut[i] = Math.round(((i - pLow) / range) * 255);
    }
  }

  // Apply LUT to all pixels
  for (let i = 0; i < len; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  return imageData;
}

/**
 * 3x3 Subtle Stroke-Preserving Sharpening Filter
 * Gentle edge definition without creating halo artifacts or fragmenting continuous pen strokes.
 */
function applySharpenFilter(imageData: ImageData, width: number, height: number): ImageData {
  const src = imageData.data;
  const output = new ImageData(new Uint8ClampedArray(src), width, height);
  const dst = output.data;

  // Gentle sharpening kernel (preserving continuous ink lines):
  // [  0,    -0.075,  0    ]
  // [ -0.075, 1.3,   -0.075]
  // [  0,    -0.075,  0    ]
  const c = 1.3;
  const n = -0.075;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let ch = 0; ch < 3; ch++) {
        const top = ((y - 1) * width + x) * 4 + ch;
        const bottom = ((y + 1) * width + x) * 4 + ch;
        const left = (y * width + (x - 1)) * 4 + ch;
        const right = (y * width + (x + 1)) * 4 + ch;

        const val =
          src[idx + ch] * c +
          (src[top] + src[bottom] + src[left] + src[right]) * n;

        dst[idx + ch] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
      dst[idx + 3] = src[idx + 3];
    }
  }

  return output;
}
