import {
  AutoCalibratedBgProfile,
  BgClusterCentroid,
  BoundingBox,
  EngineExportFormat,
  ExtractedFrame,
  HaloMetrics,
  ProcessingSettings,
} from '../types/sprite';

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const num = parseInt(clean.substring(0, 6), 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

/**
 * Converts sRGB (0..255) to perceptual CIELAB (L*: 0..100, a*: -128..127, b*: -128..127)
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let sr = r / 255;
  let sg = g / 255;
  let sb = b / 255;

  sr = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
  sg = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
  sb = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;

  const x = (sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375) / 0.95047;
  const y = (sr * 0.2126729 + sg * 0.7151522 + sb * 0.072175) / 1.0;
  const z = (sr * 0.0193339 + sg * 0.119192 + sb * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [L, a, bVal];
}

/**
 * Converts sRGB (0..255) to HSV (H: 0..360, S: 0..100, V: 0..100)
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d > 0.0001) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return [h, s, v];
}

function circularHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function boxDistance(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

/**
 * V2 STAGE 1: Auto-Calibrating Background Profiler (No Manual Color Picker)
 * - Samples the outer 5% border perimeter of the frame at native resolution
 * - Converts border pixels to CIELAB & HSV space
 * - Computes 3 K-Means clusters (Bright BG, Midtone BG, Shadowed Floor BG) + standard deviation (sigma)
 * - Detects whether the video has a solid/chroma background, shadowed studio floor, or complex scene
 */
export function computeAutoCalibratedBgProfile(
  canvas: HTMLCanvasElement,
  ignoreBottomRightWatermark: boolean = true
): AutoCalibratedBgProfile {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  return computeAutoCalibratedBgProfileFromData(
    data,
    width,
    height,
    ignoreBottomRightWatermark
  );
}

export function computeAutoCalibratedBgProfileFromData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ignoreBottomRightWatermark: boolean = true
): AutoCalibratedBgProfile {
  const borderX = Math.max(2, Math.floor(width * 0.05));
  const borderY = Math.max(2, Math.floor(height * 0.05));
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  interface BorderSample {
    r: number;
    g: number;
    b: number;
    L: number;
    a: number;
    bLab: number;
    h: number;
    s: number;
    v: number;
    cluster: number;
  }

  const samples: BorderSample[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const isOuter5Pct =
        x < borderX || x >= width - borderX || y < borderY || y >= height - borderY;
      if (!isOuter5Pct) continue;

      if (ignoreBottomRightWatermark && x >= width * 0.83 && y >= height * 0.74) {
        continue;
      }

      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 128) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const [L, a, bLab] = rgbToLab(r, g, b);
      const [h, s, v] = rgbToHsv(r, g, b);

      samples.push({ r, g, b, L, a, bLab, h, s, v, cluster: 0 });
    }
  }

  if (samples.length < 6) {
    const fallbackRgb: [number, number, number] = [251, 251, 251];
    const [L, a, bLab] = rgbToLab(251, 251, 251);
    const [h, s, v] = rgbToHsv(251, 251, 251);
    const dummy: BgClusterCentroid = {
      id: 'bright_bg',
      label: 'Bright BG',
      hex: '#FBFBFB',
      rgb: fallbackRgb,
      lab: [L, a, bLab],
      hsv: [h, s, v],
      sigmaLab: 6.0,
      sigmaHue: 12.0,
      weightPct: 100,
    };
    return {
      clusters: [
        dummy,
        { ...dummy, id: 'midtone_bg', label: 'Midtone BG', weightPct: 0 },
        { ...dummy, id: 'shadow_bg', label: 'Shadowed Floor BG', weightPct: 0 },
      ],
      overallSigmaLab: 6.0,
      backgroundType: 'solid_chroma',
      requiresNeuralRmbg: false,
      borderSampleCount: samples.length,
    };
  }

  // Sort by CIELAB Lightness (L*) to initialize 3 deterministic K-Means centroids:
  // Cluster 0: Bright BG (82nd percentile), Cluster 1: Midtone BG (48th percentile), Cluster 2: Shadowed Floor BG (15th percentile)
  const sortedByL = [...samples].sort((p, q) => q.L - p.L);
  const cInit = [
    sortedByL[Math.floor(sortedByL.length * 0.18)],
    sortedByL[Math.floor(sortedByL.length * 0.52)],
    sortedByL[Math.floor(sortedByL.length * 0.85)],
  ];

  const centroids = cInit.map((c) => ({ L: c.L, a: c.a, bLab: c.bLab }));

  // Run 8 iterations of 3-Cluster K-Means in CIELAB space
  for (let iter = 0; iter < 8; iter++) {
    const sums = [
      { L: 0, a: 0, bLab: 0, count: 0 },
      { L: 0, a: 0, bLab: 0, count: 0 },
      { L: 0, a: 0, bLab: 0, count: 0 },
    ];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let bestK = 0;
      let bestDistSq = Infinity;
      for (let k = 0; k < 3; k++) {
        const dL = s.L - centroids[k].L;
        const da = s.a - centroids[k].a;
        const db = s.bLab - centroids[k].bLab;
        const dSq = dL * dL + da * da + db * db;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestK = k;
        }
      }
      s.cluster = bestK;
      sums[bestK].L += s.L;
      sums[bestK].a += s.a;
      sums[bestK].bLab += s.bLab;
      sums[bestK].count++;
    }

    for (let k = 0; k < 3; k++) {
      if (sums[k].count > 0) {
        centroids[k].L = sums[k].L / sums[k].count;
        centroids[k].a = sums[k].a / sums[k].count;
        centroids[k].bLab = sums[k].bLab / sums[k].count;
      }
    }
  }

  // Order clusters strictly from Brightest (L* highest) to Darkest (Shadowed Floor BG)
  const clusterOrder = [0, 1, 2].sort((a, b) => centroids[b].L - centroids[a].L);
  const roleMeta: { id: 'bright_bg' | 'midtone_bg' | 'shadow_bg'; label: string }[] = [
    { id: 'bright_bg', label: 'Bright BG' },
    { id: 'midtone_bg', label: 'Midtone BG' },
    { id: 'shadow_bg', label: 'Shadowed Floor BG' },
  ];

  const builtClusters = clusterOrder.map((origK, rankIdx): BgClusterCentroid => {
    const members = samples.filter((s) => s.cluster === origK);
    const list = members.length > 0 ? members : [samples[0]];

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumL = 0;
    let sumA = 0;
    let sumBLab = 0;
    let sumSinH = 0;
    let sumCosH = 0;
    let sumS = 0;
    let sumV = 0;

    for (const m of list) {
      sumR += m.r;
      sumG += m.g;
      sumB += m.b;
      sumL += m.L;
      sumA += m.a;
      sumBLab += m.bLab;
      const rad = (m.h * Math.PI) / 180;
      sumSinH += Math.sin(rad);
      sumCosH += Math.cos(rad);
      sumS += m.s;
      sumV += m.v;
    }

    const n = list.length;
    const meanR = sumR / n;
    const meanG = sumG / n;
    const meanB = sumB / n;
    const meanL = sumL / n;
    const meanA = sumA / n;
    const meanBLab = sumBLab / n;
    let meanH = (Math.atan2(sumSinH / n, sumCosH / n) * 180) / Math.PI;
    if (meanH < 0) meanH += 360;
    const meanS = sumS / n;
    const meanV = sumV / n;

    let varLab = 0;
    let varHue = 0;
    for (const m of list) {
      const dL = m.L - meanL;
      const da = m.a - meanA;
      const db = m.bLab - meanBLab;
      varLab += dL * dL + da * da + db * db;
      const dh = circularHueDistance(m.h, meanH);
      varHue += dh * dh;
    }

    // Standard deviation sigma in CIELAB and Hue (with safe minimum floor for solid digital renders)
    const sigmaLab = Number(Math.max(4.5, Math.sqrt(varLab / n)).toFixed(2));
    const sigmaHue = Number(Math.max(6.0, Math.sqrt(varHue / n)).toFixed(2));

    return {
      id: roleMeta[rankIdx].id,
      label: roleMeta[rankIdx].label,
      hex: rgbToHex(meanR, meanG, meanB),
      rgb: [Math.round(meanR), Math.round(meanG), Math.round(meanB)],
      lab: [
        Number(meanL.toFixed(2)),
        Number(meanA.toFixed(2)),
        Number(meanBLab.toFixed(2)),
      ],
      hsv: [
        Number(meanH.toFixed(1)),
        Number(meanS.toFixed(1)),
        Number(meanV.toFixed(1)),
      ],
      sigmaLab,
      sigmaHue,
      weightPct: Number(((members.length / samples.length) * 100).toFixed(1)),
    };
  }) as [BgClusterCentroid, BgClusterCentroid, BgClusterCentroid];

  // Overall CIELAB dispersion across all border pixels
  const globalMeanL =
    samples.reduce((acc, s) => acc + s.L, 0) / Math.max(1, samples.length);
  const globalMeanA =
    samples.reduce((acc, s) => acc + s.a, 0) / Math.max(1, samples.length);
  const globalMeanB =
    samples.reduce((acc, s) => acc + s.bLab, 0) / Math.max(1, samples.length);
  let globalVar = 0;
  let chromaSpread = 0;
  for (const s of samples) {
    const dL = s.L - globalMeanL;
    const da = s.a - globalMeanA;
    const db = s.bLab - globalMeanB;
    globalVar += dL * dL + da * da + db * db;
    chromaSpread += da * da + db * db;
  }
  const overallSigmaLab = Number(Math.sqrt(globalVar / samples.length).toFixed(2));
  const overallChromaSigma = Math.sqrt(chromaSpread / samples.length);

  // If border has multiple distinct non-neutral hues (high chromatic spread > 26), flag as complex scene
  const requiresNeuralRmbg = overallChromaSigma > 26 && overallSigmaLab > 32;
  const lSpan = Math.abs(builtClusters[0].lab[0] - builtClusters[2].lab[0]);
  const backgroundType = requiresNeuralRmbg
    ? 'complex_scene'
    : lSpan > 8 || overallSigmaLab > 5.5
    ? 'multi_cluster_shadow'
    : 'solid_chroma';

  return {
    clusters: builtClusters,
    overallSigmaLab,
    backgroundType,
    requiresNeuralRmbg,
    borderSampleCount: samples.length,
  };
}



/**
 * Pure TypedArray Buffer Engine (100% Web Worker Safe — Zero DOM Dependencies):
 *  - Stage 1: Auto-Calibrating 3-Cluster CIELAB/HSV Background Profiler (Bright BG, Midtone BG, Shadowed Floor BG)
 *  - Stage 2: Sobel Edge-Magnitude Pass + Exterior Flood-Fill + 2-Sigma Low-Variance Trapped Space Punch (Strict Interior Protection)
 *  - Stage 3: 3-Pixel Boundary Linear Color Unmixing & Nearest Interior Opaque Neighbor Despill
 *  - Stage 4: Opaque Bounding Box, Center-of-Mass (centerX), & Lowest Foot (maxY) Extraction
 */
export function processSpriteFrameBuffer(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ProcessingSettings,
  frameIndex: number = 0,
  precomputedBgProfile?: AutoCalibratedBgProfile
): {
  outData: Uint8ClampedArray;
  heatData: Uint8ClampedArray;
  width: number;
  height: number;
  cropBox: BoundingBox;
  coreBodyBox: BoundingBox;
  centerOfMassX: number;
  lowestFootY: number;
  removedParticleBoxes: BoundingBox[];
  trappedPocketBoxes: BoundingBox[];
  bgProfile: AutoCalibratedBgProfile;
  metrics: HaloMetrics;
} {
  const pixelCount = width * height;

  // STAGE 1: Auto-Calibrating 3-Cluster K-Means Background Profile (CIELAB + HSV)
  const bgProfile =
    precomputedBgProfile ||
    computeAutoCalibratedBgProfileFromData(
      srcData,
      width,
      height,
      settings.removeCornerWatermark
    );

  const isV2AutoMode =
    settings.autonomousV2Mode || settings.keyingMode === 'v2_auto_kmeans';

  const activeKeyHex =
    isV2AutoMode || settings.keyingMode === 'auto_corner'
      ? bgProfile.clusters[0].hex
      : settings.keyColor;
  const [keyR, keyG, keyB] = hexToRgb(activeKeyHex);
  const [keyY, keyCb, keyCr] = rgbToYCbCr(keyR, keyG, keyB);

  const keySaturation = Math.max(keyR, keyG, keyB) - Math.min(keyR, keyG, keyB);
  const isNeutralWhiteOrBlackKey = keySaturation < 30;

  const rBuf = new Float32Array(pixelCount);
  const gBuf = new Float32Array(pixelCount);
  const bBuf = new Float32Array(pixelCount);
  const lumaBuf = new Float32Array(pixelCount);
  const labLBuf = new Float32Array(pixelCount);
  const labABuf = new Float32Array(pixelCount);
  const labBBuf = new Float32Array(pixelCount);
  const rawAlpha = new Float32Array(pixelCount);
  const alphaBuf = new Float32Array(pixelCount);
  const colorDistBuf = new Float32Array(pixelCount);
  const sigmaDistBuf = new Float32Array(pixelCount); // Distance in sigma units to closest K-Means BG cluster
  const matchedClusterIdx = new Uint8Array(pixelCount);

  const tolDist = (settings.tolerance / 100) * 190;
  const softRamp = Math.max(2.0, (settings.softness / 100) * 150);
  const chromaRatio = isNeutralWhiteOrBlackKey
    ? Math.min(0.25, settings.chromaWeight / 100)
    : settings.chromaWeight / 100;

  // Precompute optional secondary background / shadow key colors
  const secondaryKeys = (settings.secondaryKeyColors || []).map((sec) => {
    const [sr, sg, sb] = hexToRgb(sec.hex);
    const [sy, scb, scr] = rgbToYCbCr(sr, sg, sb);
    const [sL, sa, sbLab] = rgbToLab(sr, sg, sb);
    const sSat = Math.max(sr, sg, sb) - Math.min(sr, sg, sb);
    const sChromaRatio = sSat < 30 ? 0.22 : 0.78;
    const sTolDist = ((sec.tolerance ?? 20) / 100) * 190;
    return { sr, sg, sb, sy, scb, scr, sL, sa, sbLab, sChromaRatio, sTolDist };
  });

  const clusters = bgProfile.clusters;

  // PASS 1: CIELAB 3-Cluster K-Means Background Evaluation + Perceptual Chroma/Luma Keying
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = srcData[idx];
    const g = srcData[idx + 1];
    const b = srcData[idx + 2];
    const srcA = srcData[idx + 3] / 255;

    rBuf[i] = r;
    gBuf[i] = g;
    bBuf[i] = b;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumaBuf[i] = luma;

    const [L, aLab, bLab] = rgbToLab(r, g, b);
    labLBuf[i] = L;
    labABuf[i] = aLab;
    labBBuf[i] = bLab;

    if (settings.keyingMode === 'off' || srcA === 0) {
      rawAlpha[i] = srcA;
      alphaBuf[i] = srcA;
      colorDistBuf[i] = 255;
      sigmaDistBuf[i] = 99;
      continue;
    }

    // Evaluate CIELAB distance to the 3 Auto-Calibrated K-Means BG Clusters (Bright BG, Midtone BG, Shadowed Floor BG)
    let bestSigmaRatio = 999;
    let bestLabDist = 999;
    let bestCIdx = 0;

    for (let c = 0; c < 3; c++) {
      const cl = clusters[c];
      if (cl.weightPct < 1.5 && c > 0) continue;
      const dL = L - cl.lab[0];
      const da = aLab - cl.lab[1];
      const db = bLab - cl.lab[2];
      const isClusterNeutral = cl.hsv[1] < 16;
      // Weight chroma (a*, b*) higher on neutral white/grey backgrounds so warm skin/horns/armor stand out sharply
      const labDist = isClusterNeutral
        ? Math.sqrt(dL * dL * 0.68 + (da * da + db * db) * 1.65)
        : Math.sqrt(dL * dL * 0.55 + (da * da + db * db) * 1.25);

      const effSigma = Math.max(5.2, cl.sigmaLab * 1.15);
      const sigmaRatio = labDist / effSigma;
      if (sigmaRatio < bestSigmaRatio) {
        bestSigmaRatio = sigmaRatio;
        bestLabDist = labDist;
        bestCIdx = c;
      }
    }

    // Also include any user-added secondaryKeyColors in sigma evaluation
    for (let k = 0; k < secondaryKeys.length; k++) {
      const sk = secondaryKeys[k];
      const dL = L - sk.sL;
      const da = aLab - sk.sa;
      const db = bLab - sk.sbLab;
      const labDist = Math.sqrt(dL * dL * 0.65 + (da * da + db * db) * 1.45);
      const sigmaRatio = labDist / Math.max(6.0, (sk.sTolDist / 190) * 28);
      if (sigmaRatio < bestSigmaRatio) {
        bestSigmaRatio = sigmaRatio;
        bestLabDist = labDist;
      }
    }

    sigmaDistBuf[i] = bestSigmaRatio;
    matchedClusterIdx[i] = bestCIdx;

    if (isV2AutoMode) {
      // V2 Autonomous K-Means Distance Ramp: pixels within 2.15 sigma of any BG cluster are candidate BG
      const sigmaThreshold = Math.max(1.4, (settings.v2PocketSigmaMultiplier ?? 2.0) * 1.08);
      const a = Math.max(0, Math.min(1, (bestSigmaRatio - sigmaThreshold) / 1.15));
      colorDistBuf[i] = bestLabDist * 2.2;
      rawAlpha[i] = a * srcA;
      alphaBuf[i] = rawAlpha[i];
      continue;
    }

    if (settings.keyingMode === 'luma_key') {
      const dist = Math.abs(luma - keyY) * 1.4;
      colorDistBuf[i] = dist;
      const a = Math.max(0, Math.min(1, (dist - tolDist) / softRamp));
      rawAlpha[i] = a * srcA;
      alphaBuf[i] = rawAlpha[i];
      continue;
    }

    const [y, cb, cr] = rgbToYCbCr(r, g, b);
    const dChroma = Math.hypot(cb - keyCb, cr - keyCr) * 1.48;
    const dLuma = Math.abs(y - keyY);
    const dRgb = Math.hypot(r - keyR, g - keyG, b - keyB) * 0.62;

    let minPerceptualDist =
      chromaRatio * (dChroma * 0.82 + dLuma * 0.18) + (1 - chromaRatio) * dRgb;
    let bestA = Math.max(0, Math.min(1, (minPerceptualDist - tolDist) / softRamp));

    if (secondaryKeys.length > 0 && bestA > 0) {
      for (let k = 0; k < secondaryKeys.length; k++) {
        const sk = secondaryKeys[k];
        const sdChroma = Math.hypot(cb - sk.scb, cr - sk.scr) * 1.48;
        const sdLuma = Math.abs(y - sk.sy);
        const sdRgb = Math.hypot(r - sk.sr, g - sk.sg, b - sk.sb) * 0.62;
        const sDist =
          sk.sChromaRatio * (sdChroma * 0.82 + sdLuma * 0.18) +
          (1 - sk.sChromaRatio) * sdRgb;
        const sAlpha = Math.max(0, Math.min(1, (sDist - sk.sTolDist) / softRamp));
        if (sAlpha < bestA) bestA = sAlpha;
        if (sDist < minPerceptualDist) minPerceptualDist = sDist;
      }
    }

    colorDistBuf[i] = minPerceptualDist;
    rawAlpha[i] = bestA * srcA;
    alphaBuf[i] = rawAlpha[i];
  }

  // STAGE 2A: Native-Resolution 3x3 Sobel Edge-Magnitude Pass (Hard Limb / Weapon Boundary Detector)
  const sobelMag = new Float32Array(pixelCount);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    const rowAbove = (y - 1) * width;
    const rowBelow = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const gxLuma =
        lumaBuf[rowAbove + x + 1] +
        2 * lumaBuf[row + x + 1] +
        lumaBuf[rowBelow + x + 1] -
        (lumaBuf[rowAbove + x - 1] +
          2 * lumaBuf[row + x - 1] +
          lumaBuf[rowBelow + x - 1]);
      const gyLuma =
        lumaBuf[rowBelow + x - 1] +
        2 * lumaBuf[rowBelow + x] +
        lumaBuf[rowBelow + x + 1] -
        (lumaBuf[rowAbove + x - 1] +
          2 * lumaBuf[rowAbove + x] +
          lumaBuf[rowAbove + x + 1]);

      // Include CIELAB chromatic gradient so colored limb boundaries against iso-luminant backgrounds register strongly
      const gxChroma = labABuf[row + x + 1] - labABuf[row + x - 1];
      const gyChroma = labBBuf[rowBelow + x] - labBBuf[rowAbove + x];

      sobelMag[i] =
        Math.hypot(gxLuma, gyLuma) * 0.25 + Math.hypot(gxChroma, gyChroma) * 1.1;
    }
  }

  const sobelBarrierThreshold = Math.max(
    14,
    ((115 - (settings.v2SobelBoundaryStrength ?? 55)) / 100) * 62
  );

  let trappedHolesPunched = 0;
  let sobelProtectedPixels = 0;
  const trappedPocketBoxes: BoundingBox[] = [];
  const isClearedBg = new Uint8Array(pixelCount);

  // STAGE 2B: Exterior Flood-Fill + Sobel-Guided 2-Sigma Low-Variance Trapped Space Punch
  if (settings.keyingMode !== 'off') {
    const queue = new Int32Array(pixelCount);

    if (settings.protectInteriorColors || isV2AutoMode) {
      let head = 0;
      let tail = 0;

      const sigmaLimit = settings.v2PocketSigmaMultiplier ?? 2.0;
      const isCandidateBgPixel = (idx: number): boolean => {
        if (isV2AutoMode) {
          return sigmaDistBuf[idx] <= sigmaLimit * 1.28 || alphaBuf[idx] < 0.85;
        }
        return alphaBuf[idx] < 0.88;
      };

      // 1. Seed Exterior Flood-Fill from the outer frame perimeter
      for (let x = 0; x < width; x++) {
        const top = x;
        const bot = (height - 1) * width + x;
        if (isCandidateBgPixel(top)) {
          isClearedBg[top] = 1;
          queue[tail++] = top;
        }
        if (isCandidateBgPixel(bot)) {
          isClearedBg[bot] = 1;
          queue[tail++] = bot;
        }
      }
      for (let y = 1; y < height - 1; y++) {
        const left = y * width;
        const right = y * width + (width - 1);
        if (isCandidateBgPixel(left)) {
          isClearedBg[left] = 1;
          queue[tail++] = left;
        }
        if (isCandidateBgPixel(right)) {
          isClearedBg[right] = 1;
          queue[tail++] = right;
        }
      }

      // Flood-fill exterior background up to Sobel limb/weapon boundaries
      while (head < tail) {
        const curr = queue[head++];
        const cy = Math.floor(curr / width);
        const cx = curr - cy * width;

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];

        for (let k = 0; k < 4; k++) {
          const n = neighbors[k];
          if (n === -1 || isClearedBg[n]) continue;
          // Stop exterior flood at hard Sobel limb boundaries unless pixel strongly matches BG cluster (< 1.35 sigma)
          const hitsSobelWall =
            sobelMag[n] > sobelBarrierThreshold && sigmaDistBuf[n] > 1.35;
          if (!hitsSobelWall && isCandidateBgPixel(n)) {
            isClearedBg[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      // 2. Scan inside character bounding box for Trapped Negative Spaces (between legs, bent arms, weapons)
      const visitedPocket = new Uint8Array(pixelCount);
      const pocketIdMap = new Int32Array(pixelCount);
      pocketIdMap.fill(-1);

      interface PocketInfo {
        id: number;
        pixels: number[];
        area: number;
        box: BoundingBox;
        punched: boolean;
      }
      const pockets: PocketInfo[] = [];

      const maxAllowedVariance = settings.v2MaxPocketTextureVariance ?? 16;
      const minPocketArea = isV2AutoMode
        ? Math.max(24, Math.min(settings.maxProtectedDetailArea, 45))
        : settings.maxProtectedDetailArea;

      for (let y = 2; y < height - 2; y++) {
        const rowOffset = y * width;
        for (let x = 2; x < width - 2; x++) {
          const startIdx = rowOffset + x;
          if (
            isClearedBg[startIdx] ||
            visitedPocket[startIdx] ||
            (!isCandidateBgPixel(startIdx) && alphaBuf[startIdx] >= 0.76)
          ) {
            continue;
          }

          const pocketPixels: number[] = [];
          let pHead = 0;
          let pTail = 0;
          queue[pTail++] = startIdx;
          visitedPocket[startIdx] = 1;

          let pMinX = x;
          let pMaxX = x;
          let pMinY = y;
          let pMaxY = y;

          let coreCount = 0;
          let sumSigma = 0;
          let sumTextureGrad = 0;
          let sumSat = 0;
          let sumColorDist = 0;

          while (pHead < pTail) {
            const curr = queue[pHead++];
            pocketPixels.push(curr);

            const cy = Math.floor(curr / width);
            const cx = curr - cy * width;
            if (cx < pMinX) pMinX = cx;
            if (cx > pMaxX) pMaxX = cx;
            if (cy < pMinY) pMinY = cy;
            if (cy > pMaxY) pMaxY = cy;

            const r = rBuf[curr];
            const g = gBuf[curr];
            const b = bBuf[curr];
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            sumColorDist += colorDistBuf[curr];
            sumSat += sat;

            // Evaluate interior seed core pixels (away from the immediate Sobel limb edge)
            if (sobelMag[curr] < sobelBarrierThreshold * 0.75) {
              coreCount++;
              sumSigma += sigmaDistBuf[curr];
              if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1) {
                const localGrad =
                  (Math.abs(labLBuf[curr] - labLBuf[curr - 1]) +
                    Math.abs(labLBuf[curr] - labLBuf[curr + 1]) +
                    Math.abs(labLBuf[curr] - labLBuf[curr - width]) +
                    Math.abs(labLBuf[curr] - labLBuf[curr + width])) *
                  0.25;
                sumTextureGrad += localGrad;
              }
            }

            // Flood-fill candidate pocket out to the nearest Sobel limb boundary
            const neighbors = [
              cx > 0 ? curr - 1 : -1,
              cx < width - 1 ? curr + 1 : -1,
              cy > 0 ? curr - width : -1,
              cy < height - 1 ? curr + width : -1,
            ];
            for (let k = 0; k < 4; k++) {
              const n = neighbors[k];
              if (n === -1 || isClearedBg[n] || visitedPocket[n]) continue;
              const hitsSobelLimb =
                sobelMag[n] > sobelBarrierThreshold * 1.05 && sigmaDistBuf[n] > 1.6;
              if (!hitsSobelLimb && (isCandidateBgPixel(n) || alphaBuf[n] < 0.78)) {
                visitedPocket[n] = 1;
                queue[pTail++] = n;
              }
            }
          }

          const area = pocketPixels.length;
          const pid = pockets.length;
          for (let k = 0; k < area; k++) {
            pocketIdMap[pocketPixels[k]] = pid;
          }

          const avgSigma = coreCount > 0 ? sumSigma / coreCount : 99;
          const avgTextureVar = coreCount > 0 ? sumTextureGrad / coreCount : 99;
          const avgSaturation = sumSat / area;
          const avgColorDist = sumColorDist / area;

          let shouldPunch = false;
          if (settings.autoPunchTrappedHoles || isV2AutoMode) {
            // V2 Verification:
            // 1. Seed center matches K-Means BG clusters within 2*sigma
            // 2. Low internal texture variance (smooth background/shadow gap, not textured character detail)
            // 3. Neutral chroma guard when BG is white/grey so saturated eyes/skin/horns are never eaten
            const matchesKMeansWithin2Sigma = avgSigma <= sigmaLimit;
            const hasLowTextureVariance = avgTextureVar <= maxAllowedVariance;
            const passesChromaGuard =
              !isNeutralWhiteOrBlackKey || avgSaturation <= 18;
            const maxAllowedColorDist = Math.max(
              4,
              ((105 - settings.holeColorStrictness) / 100) * 48
            );

            if (
              area >= minPocketArea &&
              passesChromaGuard &&
              hasLowTextureVariance &&
              (matchesKMeansWithin2Sigma || avgColorDist <= maxAllowedColorDist)
            ) {
              shouldPunch = true;
            }
          }

          pockets.push({
            id: pid,
            pixels: pocketPixels,
            area,
            box: {
              x: pMinX,
              y: pMinY,
              width: pMaxX - pMinX + 1,
              height: pMaxY - pMinY + 1,
            },
            punched: shouldPunch,
          });
        }
      }

      // Check if user placed explicit pocket/protect seeds that toggle any detected pocket
      if (settings.holeSeeds && settings.holeSeeds.length > 0) {
        for (const seed of settings.holeSeeds) {
          if (seed.enabled === false || seed.mode === 'erase_particle') continue;
          if (
            seed.frameScope === 'single_frame' &&
            seed.targetFrameIndex !== undefined &&
            seed.targetFrameIndex !== frameIndex
          ) {
            continue;
          }
          const sx = Math.min(width - 1, Math.max(0, Math.round(seed.relX * width)));
          const sy = Math.min(height - 1, Math.max(0, Math.round(seed.relY * height)));
          const matchedPocketId = pocketIdMap[sy * width + sx];
          if (matchedPocketId !== -1 && pockets[matchedPocketId]) {
            pockets[matchedPocketId].punched = seed.mode === 'punch_hole';
          }
        }
      }

      // Punch verified Trapped Negative Spaces out to their Sobel boundary!
      for (const pocket of pockets) {
        if (pocket.punched) {
          trappedHolesPunched++;
          trappedPocketBoxes.push(pocket.box);
          for (let k = 0; k < pocket.pixels.length; k++) {
            const p = pocket.pixels[k];
            isClearedBg[p] = 1;
            alphaBuf[p] = 0;
            rawAlpha[p] = 0;
          }
        }
      }

      // STRICT PROTECTION RULE:
      // Never delete pixels inside the character that do not connect either to the exterior border
      // or to a verified low-variance background pocket seed!
      for (let i = 0; i < pixelCount; i++) {
        if (isClearedBg[i]) {
          alphaBuf[i] = 0;
          rawAlpha[i] = 0;
        } else {
          if (alphaBuf[i] < 1.0) {
            sobelProtectedPixels++;
          }
          alphaBuf[i] = 1.0;
          rawAlpha[i] = 1.0;
        }
      }
    }

    // LAYERED MULTI-COLOR LOCAL POCKET FLOOD-FILL ENGINE (Optional User Click Layers)
    if (settings.holeSeeds && settings.holeSeeds.length > 0) {
      const localVisited = new Uint8Array(pixelCount);
      const use8Way = settings.localPunchConnectivity === '8_way';
      const rimChokeStrength = ((settings.localPunchEdgeChoke ?? 35) / 100) * 0.78;

      for (const seed of settings.holeSeeds) {
        if (seed.enabled === false || seed.mode === 'erase_particle') continue;
        if (
          seed.frameScope === 'single_frame' &&
          seed.targetFrameIndex !== undefined &&
          seed.targetFrameIndex !== frameIndex
        ) {
          continue;
        }

        const sx = Math.min(width - 1, Math.max(0, Math.round(seed.relX * width)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(seed.relY * height)));

        const layerTolPct = seed.localTolerance ?? settings.localPunchTolerance ?? 24;
        const baseTolDist = (layerTolPct / 100) * 165;
        const radiusPct = seed.maxRadiusPct ?? settings.localPunchRadius ?? 30;
        const maxLocalRadiusSq = Math.pow(
          Math.max(width, height) * (radiusPct / 100),
          2
        );

        const layerPalette: Array<{ r: number; g: number; b: number; tol: number }> = [];
        const useGlobalPalette = seed.useGlobalPocketPalette !== false;

        if (seed.mode === 'punch_hole') {
          if (settings.punchUsePrimaryBg !== false && useGlobalPalette) {
            layerPalette.push({ r: keyR, g: keyG, b: keyB, tol: baseTolDist });
          }
          if (useGlobalPalette && settings.pocketTargetColors?.length) {
            for (const pc of settings.pocketTargetColors) {
              const [pr, pg, pb] = hexToRgb(pc.hex);
              const pTol = ((pc.tolerance ?? layerTolPct) / 100) * 165;
              layerPalette.push({ r: pr, g: pg, b: pb, tol: pTol });
            }
          }
          if (settings.punchUseSampledColor !== false || layerPalette.length === 0) {
            const [sr, sg, sb] = seed.sampledHex
              ? hexToRgb(seed.sampledHex)
              : [rBuf[sy * width + sx], gBuf[sy * width + sx], bBuf[sy * width + sx]];
            layerPalette.push({ r: sr, g: sg, b: sb, tol: baseTolDist });
          }
          if (seed.extraColors?.length) {
            for (const hex of seed.extraColors) {
              const [er, eg, eb] = hexToRgb(hex);
              layerPalette.push({ r: er, g: eg, b: eb, tol: baseTolDist });
            }
          }
        } else {
          const [sr, sg, sb] = seed.sampledHex
            ? hexToRgb(seed.sampledHex)
            : [rBuf[sy * width + sx], gBuf[sy * width + sx], bBuf[sy * width + sx]];
          layerPalette.push({ r: sr, g: sg, b: sb, tol: baseTolDist });
          if (seed.extraColors?.length) {
            for (const hex of seed.extraColors) {
              const [er, eg, eb] = hexToRgb(hex);
              layerPalette.push({ r: er, g: eg, b: eb, tol: baseTolDist });
            }
          }
        }

        const evalPaletteMatch = (
          idx: number
        ): { minDist: number; matchedTol: number } => {
          const pr = rBuf[idx];
          const pg = gBuf[idx];
          const pb = bBuf[idx];
          let bestRatio = 999999;
          let bestDist = 999999;
          let bestTol = baseTolDist;
          for (let c = 0; c < layerPalette.length; c++) {
            const pal = layerPalette[c];
            const d = Math.hypot(pr - pal.r, pg - pal.g, pb - pal.b) * 0.62;
            const ratio = d / Math.max(1, pal.tol);
            if (ratio < bestRatio) {
              bestRatio = ratio;
              bestDist = d;
              bestTol = pal.tol;
            }
          }
          return { minDist: bestDist, matchedTol: bestTol };
        };

        let startIdx = sy * width + sx;
        let bestStartRatio = 999999;
        for (let dy = -10; dy <= 10; dy++) {
          const ny = sy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -10; dx <= 10; dx++) {
            const nx = sx + dx;
            if (nx < 0 || nx >= width) continue;
            const idx = ny * width + nx;
            const { minDist, matchedTol } = evalPaletteMatch(idx);
            const ratio = minDist / Math.max(1, matchedTol);
            if (ratio < bestStartRatio) {
              bestStartRatio = ratio;
              startIdx = idx;
            }
          }
        }

        if (bestStartRatio > 1.38) continue;

        localVisited.fill(0);
        let lHead = 0;
        let lTail = 0;
        queue[lTail++] = startIdx;
        localVisited[startIdx] = 1;
        const rimCandidates: number[] = [];

        while (lHead < lTail) {
          const curr = queue[lHead++];
          const cy = Math.floor(curr / width);
          const cx = curr - cy * width;
          const { minDist, matchedTol } = evalPaletteMatch(curr);

          if (seed.mode === 'punch_hole') {
            isClearedBg[curr] = 1;
            if (minDist <= matchedTol) {
              alphaBuf[curr] = 0;
              rawAlpha[curr] = 0;
            } else {
              const featherA = Math.min(
                1,
                (minDist - matchedTol) / Math.max(4, softRamp * 0.5)
              );
              alphaBuf[curr] = Math.min(alphaBuf[curr], featherA);
              rawAlpha[curr] = Math.min(rawAlpha[curr], featherA);
            }
          } else if (seed.mode === 'protect_spot') {
            isClearedBg[curr] = 0;
            alphaBuf[curr] = 1.0;
            rawAlpha[curr] = 1.0;
          }

          const neighbors = use8Way
            ? [
                cx > 0 ? curr - 1 : -1,
                cx < width - 1 ? curr + 1 : -1,
                cy > 0 ? curr - width : -1,
                cy < height - 1 ? curr + width : -1,
                cx > 0 && cy > 0 ? curr - width - 1 : -1,
                cx < width - 1 && cy > 0 ? curr - width + 1 : -1,
                cx > 0 && cy < height - 1 ? curr + width - 1 : -1,
                cx < width - 1 && cy < height - 1 ? curr + width + 1 : -1,
              ]
            : [
                cx > 0 ? curr - 1 : -1,
                cx < width - 1 ? curr + 1 : -1,
                cy > 0 ? curr - width : -1,
                cy < height - 1 ? curr + width : -1,
              ];

          for (let k = 0; k < neighbors.length; k++) {
            const n = neighbors[k];
            if (n === -1 || localVisited[n]) continue;
            const ny = Math.floor(n / width);
            const nx = n - ny * width;
            const spatialDistSq = (nx - sx) * (nx - sx) + (ny - sy) * (ny - sy);
            if (spatialDistSq > maxLocalRadiusSq) continue;

            const nMatch = evalPaletteMatch(n);
            if (nMatch.minDist <= nMatch.matchedTol + Math.max(4, softRamp * 0.45)) {
              localVisited[n] = 1;
              queue[lTail++] = n;
            } else if (seed.mode === 'punch_hole' && rimChokeStrength > 0) {
              rimCandidates.push(n);
            }
          }
        }

        if (seed.mode === 'punch_hole' && rimChokeStrength > 0 && rimCandidates.length > 0) {
          for (let r = 0; r < rimCandidates.length; r++) {
            const rimIdx = rimCandidates[r];
            if (localVisited[rimIdx]) continue;
            const { minDist, matchedTol } = evalPaletteMatch(rimIdx);
            if (minDist <= matchedTol * 1.95) {
              alphaBuf[rimIdx] = Math.max(0, alphaBuf[rimIdx] * (1 - rimChokeStrength));
              rawAlpha[rimIdx] = Math.max(0, rawAlpha[rimIdx] * (1 - rimChokeStrength));
            }
          }
        }

        if (seed.mode === 'punch_hole' && lTail > 2) {
          trappedHolesPunched++;
        }
      }
    }
  }

  // PASS 1D: Auto-Clean Bottom-Right AI Video Corner Watermark
  if (settings.removeCornerWatermark) {
    const wmStartX = Math.floor(width * 0.85);
    const wmStartY = Math.floor(height * 0.76);
    for (let y = wmStartY; y < height; y++) {
      const rowOffset = y * width;
      for (let x = wmStartX; x < width; x++) {
        const i = rowOffset + x;
        isClearedBg[i] = 1;
        alphaBuf[i] = 0;
        rawAlpha[i] = 0;
      }
    }
  }

  // PASS 1E: Auto-Remove Ground Contact Shadow Oval under Hooves / Feet
  // Detects desaturated grey/darkened floor ovals in the bottom 16% of the character span
  // that never touch the outer 5% frame border (e.g. Minotaur floor shadow #B8B8B8..#E0E0E0)
  if (settings.removeGroundShadow && settings.keyingMode !== 'off') {
    let charMinY = height;
    let charMaxY = 0;
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (!isClearedBg[rowOffset + x] && alphaBuf[rowOffset + x] > 0.25) {
          if (y < charMinY) charMinY = y;
          if (y > charMaxY) charMaxY = y;
        }
      }
    }

    if (charMaxY > charMinY + 16) {
      const shadowZoneStartY = Math.max(
        0,
        Math.floor(charMaxY - (charMaxY - charMinY) * 0.16)
      );
      const shadowQueue = new Int32Array(pixelCount);
      let sHead = 0;
      let sTail = 0;

      const isFloorShadowPixel = (idx: number): boolean => {
        const r = rBuf[idx];
        const g = gBuf[idx];
        const b = bBuf[idx];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const luma = lumaBuf[idx];

        // Stop at hard dark hooves / boot outlines (high Sobel edge or dark luma)
        if (sobelMag[idx] > sobelBarrierThreshold * 0.88 && luma < 175) {
          return false;
        }

        if (isNeutralWhiteOrBlackKey && keyY > 170) {
          // White/light studio floor with grey contact shadow oval (#A8A8A8 to #F2F2F2)
          return sat <= 16 && luma >= 142;
        }

        // Colored studio floor with darkened contact shadow of the same hue
        const [py, pcb, pcr] = rgbToYCbCr(r, g, b);
        const chromaDiff = Math.hypot(pcb - keyCb, pcr - keyCr);
        return chromaDiff <= 22 && py >= keyY * 0.52 && py <= keyY * 1.05;
      };

      // Seed from any cleared background pixel in the floor zone adjacent to a shadow pixel
      for (let y = shadowZoneStartY; y <= Math.min(height - 1, charMaxY + 4); y++) {
        const rowOffset = y * width;
        for (let x = 1; x < width - 1; x++) {
          const i = rowOffset + x;
          if (isClearedBg[i]) continue;
          if (
            (isClearedBg[i - 1] ||
              isClearedBg[i + 1] ||
              (y > 0 && isClearedBg[i - width]) ||
              (y < height - 1 && isClearedBg[i + width])) &&
            isFloorShadowPixel(i)
          ) {
            isClearedBg[i] = 1;
            alphaBuf[i] = 0;
            rawAlpha[i] = 0;
            shadowQueue[sTail++] = i;
          }
        }
      }

      while (sHead < sTail) {
        const curr = shadowQueue[sHead++];
        const cy = Math.floor(curr / width);
        const cx = curr - cy * width;

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > shadowZoneStartY ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];

        for (let k = 0; k < 4; k++) {
          const n = neighbors[k];
          if (n === -1 || isClearedBg[n]) continue;
          if (isFloorShadowPixel(n)) {
            isClearedBg[n] = 1;
            alphaBuf[n] = 0;
            rawAlpha[n] = 0;
            shadowQueue[sTail++] = n;
          }
        }
      }
    }
  }

  // STAGE 3: Linear Color Unmixing & Nearest Interior Opaque Neighbor Despill on the 3-Pixel Boundary Ring
  // Computes distance (1, 2, 3 px) from any cleared background pixel (including punched interior pockets!)
  if (settings.keyingMode !== 'off') {
    const boundaryRadius = Math.max(1, Math.min(5, settings.v2BoundaryUnmixRadius ?? 3));
    const distFromBg = new Uint8Array(pixelCount);
    distFromBg.fill(255);

    const bfsQueue = new Int32Array(pixelCount);
    let bHead = 0;
    let bTail = 0;

    for (let i = 0; i < pixelCount; i++) {
      if (alphaBuf[i] < 0.05 || isClearedBg[i]) {
        distFromBg[i] = 0;
        bfsQueue[bTail++] = i;
      }
    }

    while (bHead < bTail) {
      const curr = bfsQueue[bHead++];
      const d = distFromBg[curr];
      if (d >= boundaryRadius + 3) continue;

      const cy = Math.floor(curr / width);
      const cx = curr - cy * width;
      const nd = d + 1;

      if (cx > 0 && distFromBg[curr - 1] > nd) {
        distFromBg[curr - 1] = nd;
        bfsQueue[bTail++] = curr - 1;
      }
      if (cx < width - 1 && distFromBg[curr + 1] > nd) {
        distFromBg[curr + 1] = nd;
        bfsQueue[bTail++] = curr + 1;
      }
      if (cy > 0 && distFromBg[curr - width] > nd) {
        distFromBg[curr - width] = nd;
        bfsQueue[bTail++] = curr - width;
      }
      if (cy < height - 1 && distFromBg[curr + width] > nd) {
        distFromBg[curr + width] = nd;
        bfsQueue[bTail++] = curr + width;
      }
    }

    const unmixStrength = isV2AutoMode
      ? Math.max(0.85, settings.colorUnmixStrength / 100)
      : settings.colorUnmixStrength / 100;
    const despillStrength = isV2AutoMode
      ? Math.max(0.82, settings.deSpillStrength / 100)
      : settings.deSpillStrength / 100;
    const ramp = Math.max(24, softRamp * 1.15);

    const origR = new Float32Array(rBuf);
    const origG = new Float32Array(gBuf);
    const origB = new Float32Array(bBuf);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const i = rowOffset + x;
        const d = distFromBg[i];
        if (d === 0 || d > boundaryRadius) continue;

        const r = origR[i];
        const g = origG[i];
        const b = origB[i];

        // Identify the local K-Means background cluster color C_bg for this boundary pixel
        const cl = clusters[matchedClusterIdx[i]] || clusters[0];
        const [bgR, bgG, bgB] = cl.rgb;

        // 1. Estimate continuous alpha = clamp(dist(C_pixel, C_bg) / ramp, 0, 1)
        const distToBgColor = Math.hypot(r - bgR, g - bgG, b - bgB);
        const estAlpha = Math.max(0, Math.min(1, distToBgColor / ramp));

        if (d === 1) {
          // Smooth anti-aliased subpixel alpha on the 1px outer/inner boundary rim
          const rimAlpha = Math.max(
            0,
            Math.min(1, estAlpha * 0.85 + (sobelMag[i] / 60) * 0.25)
          );
          alphaBuf[i] = Math.min(alphaBuf[i], rimAlpha);
          rawAlpha[i] = alphaBuf[i];
        } else if (d === 2 && estAlpha < 0.32 && sobelMag[i] < sobelBarrierThreshold * 0.6) {
          // 2nd pixel ring with heavy background compression blend
          alphaBuf[i] = Math.min(alphaBuf[i], estAlpha * 1.25);
          rawAlpha[i] = alphaBuf[i];
        }

        if (alphaBuf[i] <= 0.02) {
          alphaBuf[i] = 0;
          continue;
        }

        // 2. Reconstruct true foreground color via Linear Color Unmixing:
        //    C_fg = (C_pixel - (1 - alpha) * C_bg) / max(alpha, 0.05)
        const mixA = Math.max(0.05, Math.min(0.98, estAlpha));
        const unmixW = (1 - mixA) * unmixStrength;
        const denom = Math.max(0.05, 1 - unmixW);

        let fgR = Math.max(0, Math.min(255, (r - unmixW * bgR) / denom));
        let fgG = Math.max(0, Math.min(255, (g - unmixW * bgG) / denom));
        let fgB = Math.max(0, Math.min(255, (b - unmixW * bgB) / denom));

        // 3. Clamp residual key-channel spill so 3-pixel boundary pixels take the color of their nearest interior opaque neighbor
        if (despillStrength > 0 && mixA < 0.92) {
          let sumIntR = 0;
          let sumIntG = 0;
          let sumIntB = 0;
          let sumIntW = 0;

          for (let dy = -4; dy <= 4; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -4; dx <= 4; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const ni = nRow + nx;
              if (distFromBg[ni] >= boundaryRadius && alphaBuf[ni] > 0.9) {
                const w = 1 / Math.max(1, Math.hypot(dx, dy));
                sumIntR += origR[ni] * w;
                sumIntG += origG[ni] * w;
                sumIntB += origB[ni] * w;
                sumIntW += w;
              }
            }
          }

          if (sumIntW > 0) {
            const intR = sumIntR / sumIntW;
            const intG = sumIntG / sumIntW;
            const intB = sumIntB / sumIntW;
            const pullToInterior =
              Math.min(1, (1 - mixA) * 1.15 * (1 - (d - 1) / (boundaryRadius + 1))) *
              despillStrength;

            fgR = fgR * (1 - pullToInterior) + intR * pullToInterior;
            fgG = fgG * (1 - pullToInterior) + intG * pullToInterior;
            fgB = fgB * (1 - pullToInterior) + intB * pullToInterior;
          }
        }

        rBuf[i] = fgR;
        gBuf[i] = fgG;
        bBuf[i] = fgB;
      }
    }
  }

  // PASS 2: Sub-Pixel Alpha Choke / Dilation (when user tweaks alphaChoke)
  if (Math.abs(settings.alphaChoke) > 0.05 && settings.keyingMode !== 'off') {
    const choke = settings.alphaChoke;
    const radius = Math.min(4, Math.ceil(Math.abs(choke)));
    const frac = Math.abs(choke) / radius;
    const tempAlpha = new Float32Array(alphaBuf);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const i = rowOffset + x;
        const centerA = tempAlpha[i];
        if (choke > 0 && centerA === 0) continue;
        if (choke < 0 && centerA === 1) continue;

        let extremeA = centerA;
        let weightedSum = 0;
        let weightTotal = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const nRow = ny * width;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > radius + 0.25) continue;

            const na = tempAlpha[nRow + nx];
            if (choke > 0) {
              if (na < extremeA) extremeA = na;
            } else {
              if (na > extremeA) extremeA = na;
            }
            const w = Math.max(0, 1 - dist / (radius + 0.5));
            weightedSum += na * w;
            weightTotal += w;
          }
        }

        const avgA = weightTotal > 0 ? weightedSum / weightTotal : centerA;
        const targetA = extremeA * 0.72 + avgA * 0.28;
        alphaBuf[i] = Math.max(0, Math.min(1, centerA + (targetA - centerA) * frac));
      }
    }
  }

  // PASS 2.5: LOOSE PARTICLE CLEANER + STAGE 4 CENTER-OF-MASS (centerX) & LOWEST FOOT (maxY)
  const floorNorm = settings.alphaFloor / 255;
  const removedParticleBoxes: BoundingBox[] = [];
  let looseParticlesRemoved = 0;
  let coreBodyBox: BoundingBox = { x: 0, y: 0, width, height };
  let centerOfMassX = width / 2;
  let lowestFootY = height - 1;

  {
    const visitedFg = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);

    interface FgIsland {
      id: number;
      pixels: number[];
      box: BoundingBox;
      area: number;
    }
    const islands: FgIsland[] = [];

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const startIdx = rowOffset + x;
        if (visitedFg[startIdx] || alphaBuf[startIdx] <= floorNorm) continue;

        const islandPixels: number[] = [];
        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        visitedFg[startIdx] = 1;

        let iMinX = x;
        let iMaxX = x;
        let iMinY = y;
        let iMaxY = y;

        while (head < tail) {
          const curr = queue[head++];
          islandPixels.push(curr);
          const cy = Math.floor(curr / width);
          const cx = curr - cy * width;

          if (cx < iMinX) iMinX = cx;
          if (cx > iMaxX) iMaxX = cx;
          if (cy < iMinY) iMinY = cy;
          if (cy > iMaxY) iMaxY = cy;

          for (let dy = -2; dy <= 2; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;
              const nIdx = nRow + nx;
              if (!visitedFg[nIdx] && alphaBuf[nIdx] > floorNorm) {
                visitedFg[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        islands.push({
          id: islands.length,
          pixels: islandPixels,
          area: islandPixels.length,
          box: {
            x: iMinX,
            y: iMinY,
            width: iMaxX - iMinX + 1,
            height: iMaxY - iMinY + 1,
          },
        });
      }
    }

    if (islands.length > 0) {
      let mainIsland = islands[0];
      for (let i = 1; i < islands.length; i++) {
        if (islands[i].area > mainIsland.area) {
          mainIsland = islands[i];
        }
      }
      coreBodyBox = mainIsland.box;

      if (islands.length > 1) {
        for (const isl of islands) {
          if (isl.id === mainIsland.id) continue;

          const distToMain = boxDistance(isl.box, mainIsland.box);
          let shouldRemove = false;

          if (settings.cleanLooseParticles || isV2AutoMode) {
            if (settings.particleFilterMode === 'main_body_only') {
              shouldRemove = distToMain > 1;
            } else if (settings.particleFilterMode === 'smart_proximity') {
              shouldRemove =
                isl.area < settings.minParticleArea ||
                distToMain > settings.maxParticleDistance;
            } else if (settings.particleFilterMode === 'min_size_only') {
              shouldRemove = isl.area < settings.minParticleArea;
            }
          }

          if (!shouldRemove && settings.holeSeeds && settings.holeSeeds.length > 0) {
            for (const seed of settings.holeSeeds) {
              if (seed.enabled === false || seed.mode !== 'erase_particle') continue;
              if (
                seed.frameScope === 'single_frame' &&
                seed.targetFrameIndex !== undefined &&
                seed.targetFrameIndex !== frameIndex
              ) {
                continue;
              }
              const sx = Math.round(seed.relX * width);
              const sy = Math.round(seed.relY * height);
              const pad = 16;
              if (
                sx >= isl.box.x - pad &&
                sx <= isl.box.x + isl.box.width + pad &&
                sy >= isl.box.y - pad &&
                sy <= isl.box.y + isl.box.height + pad
              ) {
                shouldRemove = true;
                break;
              }
            }
          }

          if (shouldRemove) {
            looseParticlesRemoved++;
            removedParticleBoxes.push(isl.box);
            for (let k = 0; k < isl.pixels.length; k++) {
              const p = isl.pixels[k];
              alphaBuf[p] = 0;
              rawAlpha[p] = 0;
            }
          }
        }
      }

      // Compute Alpha-Weighted Horizontal Center-of-Mass (centerX) & Lowest Foot Row (maxY) on Main Body
      let weightedXSum = 0;
      let weightSum = 0;
      let maxFootRow = mainIsland.box.y;
      for (let k = 0; k < mainIsland.pixels.length; k++) {
        const p = mainIsland.pixels[k];
        const a = alphaBuf[p];
        if (a <= 0.15) continue;
        const py = Math.floor(p / width);
        const px = p - py * width;
        weightedXSum += px * a;
        weightSum += a;
        if (py > maxFootRow) maxFootRow = py;
      }
      if (weightSum > 0) {
        centerOfMassX = weightedXSum / weightSum;
      } else {
        centerOfMassX = mainIsland.box.x + mainIsland.box.width / 2;
      }
      lowestFootY = maxFootRow;
    }
  }

  // PASS 5: High-Resolution Edge Contrast & Sharpness
  const contrastAmt = settings.edgeContrast / 100;
  for (let i = 0; i < pixelCount; i++) {
    let a = alphaBuf[i];
    if (a <= floorNorm) {
      alphaBuf[i] = 0;
      continue;
    }
    if (settings.edgeMode === 'pixel_art_hard') {
      alphaBuf[i] = a >= Math.max(0.45, floorNorm) ? 1.0 : 0.0;
      continue;
    }
    a = (a - floorNorm) / (1 - floorNorm);
    if (contrastAmt > 0) {
      const k = 1 + contrastAmt * (settings.edgeMode === 'subpixel_crisp' ? 4.2 : 2.6);
      const curved = 1 / (1 + Math.pow((1 - a) / Math.max(0.0001, a), k));
      a = a * (1 - contrastAmt) + curved * contrastAmt;
    }
    alphaBuf[i] = Math.max(0, Math.min(1, a));
  }

  // PASS 5B: High-Resolution Unsharp Mask on RGB
  const sharpAmt = (settings.edgeSharpness / 100) * 0.65;
  if (sharpAmt > 0.02) {
    const origR = new Float32Array(rBuf);
    const origG = new Float32Array(gBuf);
    const origB = new Float32Array(bBuf);

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      for (let x = 1; x < width - 1; x++) {
        const i = rowOffset + x;
        if (alphaBuf[i] < 0.05) continue;

        const lapR =
          4 * origR[i] -
          origR[i - 1] -
          origR[i + 1] -
          origR[i - width] -
          origR[i + width];
        const lapG =
          4 * origG[i] -
          origG[i - 1] -
          origG[i + 1] -
          origG[i - width] -
          origG[i + width];
        const lapB =
          4 * origB[i] -
          origB[i - 1] -
          origB[i + 1] -
          origB[i - width] -
          origB[i + width];

        rBuf[i] = Math.max(0, Math.min(255, origR[i] + lapR * sharpAmt));
        gBuf[i] = Math.max(0, Math.min(255, origG[i] + lapG * sharpAmt));
        bBuf[i] = Math.max(0, Math.min(255, origB[i] + lapB * sharpAmt));
      }
    }
  }

  // PASS 6: Optional Clean Game Outline Regeneration
  const outlineW = Math.round(settings.outlineWidth);
  if (outlineW > 0) {
    const [outR, outG, outB] = hexToRgb(settings.outlineColor);
    const baseAlpha = new Float32Array(alphaBuf);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const i = rowOffset + x;
        if (baseAlpha[i] >= 0.85) continue;

        let maxNeighborA = 0;
        for (let dy = -outlineW; dy <= outlineW; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const nRow = ny * width;
          for (let dx = -outlineW; dx <= outlineW; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy > outlineW * outlineW + 0.5) continue;
            const na = baseAlpha[nRow + nx];
            if (na > maxNeighborA) maxNeighborA = na;
          }
        }

        if (maxNeighborA > 0.45) {
          const fgA = baseAlpha[i];
          const strokeA = Math.min(1, (maxNeighborA - 0.35) * 1.6);
          const outA = fgA + strokeA * (1 - fgA);
          if (outA > 0) {
            rBuf[i] = (rBuf[i] * fgA + outR * strokeA * (1 - fgA)) / outA;
            gBuf[i] = (gBuf[i] * fgA + outG * strokeA * (1 - fgA)) / outA;
            bBuf[i] = (bBuf[i] * fgA + outB * strokeA * (1 - fgA)) / outA;
            alphaBuf[i] = outA;
          }
        }
      }
    }
  }

  // PASS 7: Build Output RGBA Buffer, Diagnostic Halo Heatmap RGBA Buffer & Cleaned Opaque Bounding Box
  const outData = new Uint8ClampedArray(pixelCount * 4);
  const heatData = new Uint8ClampedArray(pixelCount * 4);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasOpaque = false;

  let edgePixelCount = 0;
  let haloPenaltySum = 0;
  let crispEdgeCount = 0;
  let transparentCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const i = rowOffset + x;
      const idx = i * 4;
      const a = alphaBuf[i];
      const aByte = Math.round(a * 255);

      if (aByte === 0) {
        transparentCount++;
        outData[idx + 3] = 0;
        heatData[idx + 3] = 0;
        continue;
      }

      const r = Math.round(rBuf[i]);
      const g = Math.round(gBuf[i]);
      const b = Math.round(bBuf[i]);

      outData[idx] = r;
      outData[idx + 1] = g;
      outData[idx + 2] = b;
      outData[idx + 3] = aByte;

      if (aByte > 15) {
        hasOpaque = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      let isBoundary = a < 0.96;
      if (!isBoundary && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        if (
          alphaBuf[i - 1] < 0.2 ||
          alphaBuf[i + 1] < 0.2 ||
          alphaBuf[i - width] < 0.2 ||
          alphaBuf[i + width] < 0.2
        ) {
          isBoundary = true;
        }
      }

      if (isBoundary) {
        edgePixelCount++;
        const [py, cb, cr] = rgbToYCbCr(r, g, b);
        const dist = isNeutralWhiteOrBlackKey
          ? Math.abs(py - keyY) * 0.9
          : Math.hypot(cb - keyCb, cr - keyCr);
        const residual = Math.max(0, 1 - dist / 85);
        haloPenaltySum += residual;

        if (residual < 0.22) {
          crispEdgeCount++;
          heatData[idx] = 16;
          heatData[idx + 1] = 185;
          heatData[idx + 2] = 129;
          heatData[idx + 3] = 235;
        } else {
          heatData[idx] = 245;
          heatData[idx + 1] = Math.round(158 * (1 - residual));
          heatData[idx + 2] = 11;
          heatData[idx + 3] = 255;
        }
      } else {
        const luma = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 0.45);
        heatData[idx] = Math.min(255, luma + Math.round(sobelMag[i] * 0.8));
        heatData[idx + 1] = luma + 10;
        heatData[idx + 2] = luma + 22;
        heatData[idx + 3] = 190;
      }
    }
  }

  const cropBox: BoundingBox = hasOpaque
    ? {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX + 1),
        height: Math.max(1, maxY - minY + 1),
      }
    : { x: 0, y: 0, width, height };

  if (hasOpaque && maxY > lowestFootY) {
    lowestFootY = maxY;
  }

  const residualHaloScore =
    edgePixelCount > 0 ? Number(((haloPenaltySum / edgePixelCount) * 100).toFixed(1)) : 0;
  const crispnessIndex =
    edgePixelCount > 0 ? Number(((crispEdgeCount / edgePixelCount) * 100).toFixed(1)) : 100;
  const transparentRatio = Number(((transparentCount / pixelCount) * 100).toFixed(1));

  return {
    outData,
    heatData,
    width,
    height,
    cropBox,
    coreBodyBox: hasOpaque ? coreBodyBox : cropBox,
    centerOfMassX: Number(centerOfMassX.toFixed(2)),
    lowestFootY,
    removedParticleBoxes,
    trappedPocketBoxes,
    bgProfile,
    metrics: {
      edgePixelCount,
      residualHaloScore,
      crispnessIndex,
      transparentRatio,
      trappedHolesPunched,
      looseParticlesRemoved,
      sobelProtectedPixels,
      centerOfMassX: Number(centerOfMassX.toFixed(1)),
      lowestFootY,
    },
  };
}

export function materializeProcessedFrameCanvases(
  outData: Uint8ClampedArray,
  heatData: Uint8ClampedArray,
  width: number,
  height: number,
  existingProcessedCanvas?: HTMLCanvasElement,
  existingHeatmapCanvas?: HTMLCanvasElement
): {
  processedCanvas: HTMLCanvasElement;
  heatmapCanvas: HTMLCanvasElement;
} {
  const processedCanvas = existingProcessedCanvas || document.createElement('canvas');
  if (processedCanvas.width !== width) processedCanvas.width = width;
  if (processedCanvas.height !== height) processedCanvas.height = height;
  const outCtx = processedCanvas.getContext('2d')!;
  const outImg = new ImageData(new Uint8ClampedArray(outData.buffer, outData.byteOffset, outData.byteLength), width, height);
  outCtx.putImageData(outImg, 0, 0);

  const heatmapCanvas = existingHeatmapCanvas || document.createElement('canvas');
  if (heatmapCanvas.width !== width) heatmapCanvas.width = width;
  if (heatmapCanvas.height !== height) heatmapCanvas.height = height;
  const heatCtx = heatmapCanvas.getContext('2d')!;
  const heatImg = new ImageData(new Uint8ClampedArray(heatData.buffer, heatData.byteOffset, heatData.byteLength), width, height);
  heatCtx.putImageData(heatImg, 0, 0);

  return { processedCanvas, heatmapCanvas };
}

export function processSpriteFrameCanvas(
  sourceCanvas: HTMLCanvasElement,
  settings: ProcessingSettings,
  frameIndex: number = 0,
  precomputedBgProfile?: AutoCalibratedBgProfile,
  cachedSourceRgba?: Uint8ClampedArray
): {
  processedCanvas: HTMLCanvasElement;
  heatmapCanvas: HTMLCanvasElement;
  cropBox: BoundingBox;
  coreBodyBox: BoundingBox;
  centerOfMassX: number;
  lowestFootY: number;
  removedParticleBoxes: BoundingBox[];
  trappedPocketBoxes: BoundingBox[];
  bgProfile: AutoCalibratedBgProfile;
  metrics: HaloMetrics;
} {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const srcData =
    cachedSourceRgba ||
    sourceCanvas.getContext('2d')!.getImageData(0, 0, width, height).data;

  const res = processSpriteFrameBuffer(
    srcData,
    width,
    height,
    settings,
    frameIndex,
    precomputedBgProfile
  );

  const { processedCanvas, heatmapCanvas } = materializeProcessedFrameCanvases(
    res.outData,
    res.heatData,
    width,
    height
  );

  return {
    processedCanvas,
    heatmapCanvas,
    cropBox: res.cropBox,
    coreBodyBox: res.coreBodyBox,
    centerOfMassX: res.centerOfMassX,
    lowestFootY: res.lowestFootY,
    removedParticleBoxes: res.removedParticleBoxes,
    trappedPocketBoxes: res.trappedPocketBoxes,
    bgProfile: res.bgProfile,
    metrics: res.metrics,
  };
}

/**
 * V2 STAGE 4A: Silhouette-IoU + Motion-Direction (Velocity) Auto-Loop Detection
 * Minimizes: LoopCost(i, j) = (1 - Silhouette_IoU(F_i, F_j)) + Velocity_Difference(F_i, F_j)
 * so the selected loop matches both character silhouette pose AND movement direction!
 */
export function computePerfectLoopDetection(frames: ExtractedFrame[]): {
  similarities: number[];
  silhouetteIoUs: number[];
  velocityDiffs: number[];
  bestLoop: {
    startIdx: number;
    endIdx: number;
    similarity: number;
    silhouetteIoU: number;
    velocityDiff: number;
    loopCost: number;
  };
} {
  if (frames.length < 2) {
    return {
      similarities: frames.map(() => 100),
      silhouetteIoUs: frames.map(() => 100),
      velocityDiffs: frames.map(() => 0),
      bestLoop: {
        startIdx: 0,
        endIdx: 0,
        similarity: 100,
        silhouetteIoU: 100,
        velocityDiff: 0,
        loopCost: 0,
      },
    };
  }

  const gridSize = 48;
  const cellCount = gridSize * gridSize;

  // Rasterize each cleaned frame onto a normalized 48x48 Foot-Locked & Center-of-Mass-Aligned grid
  const silhouettes: Float32Array[] = [];
  const rgbThumbs: Uint8ClampedArray[] = [];
  const comNormX: number[] = [];
  const aspectRatios: number[] = [];

  for (let idx = 0; idx < frames.length; idx++) {
    const f = frames[idx];
    const target = f.processedCanvas || f.sourceCanvas;
    const box = f.cropBox || { x: 0, y: 0, width: target.width, height: target.height };

    const c = document.createElement('canvas');
    c.width = gridSize;
    c.height = gridSize;
    const ctx = c.getContext('2d')!;

    // Align character horizontally by Center of Mass (centerX) and vertically by Lowest Foot (maxY)
    const scale = Math.min(
      (gridSize - 4) / Math.max(1, box.width),
      (gridSize - 4) / Math.max(1, box.height)
    );
    const drawW = Math.max(1, box.width * scale);
    const drawH = Math.max(1, box.height * scale);
    const comX = f.centerOfMassX ?? box.x + box.width / 2;
    const dx = gridSize / 2 - (comX - box.x) * scale;
    const dy = gridSize - 2 - drawH;

    ctx.drawImage(target, box.x, box.y, box.width, box.height, dx, dy, drawW, drawH);
    const imgData = ctx.getImageData(0, 0, gridSize, gridSize).data;
    rgbThumbs.push(imgData);

    const mask = new Float32Array(cellCount);
    for (let p = 0; p < cellCount; p++) {
      mask[p] = imgData[p * 4 + 3] / 255;
    }
    silhouettes.push(mask);
    comNormX.push(comX / Math.max(1, target.width));
    aspectRatios.push(box.width / Math.max(1, box.height));
  }

  // Compute temporal velocity fields (Motion-Direction vectors) for every frame k
  const velocityMaps: Float32Array[] = [];
  const comVelocities: number[] = [];
  const aspectVelocities: number[] = [];

  for (let k = 0; k < frames.length; k++) {
    const prevIdx = Math.max(0, k - 1);
    const nextIdx = Math.min(frames.length - 1, k + 1);
    const dt = Math.max(1, nextIdx - prevIdx);

    const vMap = new Float32Array(cellCount);
    const sPrev = silhouettes[prevIdx];
    const sNext = silhouettes[nextIdx];
    for (let p = 0; p < cellCount; p++) {
      vMap[p] = (sNext[p] - sPrev[p]) / dt;
    }
    velocityMaps.push(vMap);
    comVelocities.push(((comNormX[nextIdx] - comNormX[prevIdx]) / dt) * 10);
    aspectVelocities.push(((aspectRatios[nextIdx] - aspectRatios[prevIdx]) / dt) * 4);
  }

  const evaluatePair = (
    i: number,
    j: number
  ): { iou: number; velDiff: number; rgbSim: number; cost: number } => {
    const sA = silhouettes[i];
    const sB = silhouettes[j];
    const vA = velocityMaps[i];
    const vB = velocityMaps[j];
    const rgbA = rgbThumbs[i];
    const rgbB = rgbThumbs[j];

    let intersection = 0;
    let union = 0;
    let velDiffSum = 0;
    let activeVelCells = 0;
    let rgbDiffSq = 0;

    for (let p = 0; p < cellCount; p++) {
      const a = sA[p];
      const b = sB[p];
      if (a > 0.05 || b > 0.05) {
        intersection += Math.min(a, b);
        union += Math.max(a, b);
      }
      if (
        Math.abs(vA[p]) > 0.04 ||
        Math.abs(vB[p]) > 0.04 ||
        a > 0.1 ||
        b > 0.1
      ) {
        velDiffSum += Math.abs(vA[p] - vB[p]);
        activeVelCells++;
      }

      const idx4 = p * 4;
      const dr = rgbA[idx4] - rgbB[idx4];
      const dg = rgbA[idx4 + 1] - rgbB[idx4 + 1];
      const db = rgbA[idx4 + 2] - rgbB[idx4 + 2];
      const da = rgbA[idx4 + 3] - rgbB[idx4 + 3];
      rgbDiffSq += dr * dr + dg * dg + db * db + da * da;
    }

    const iou = union > 0 ? intersection / union : 1.0;
    const gridVelDiff =
      activeVelCells > 0 ? velDiffSum / activeVelCells : 0;
    const comVelDiff = Math.abs(comVelocities[i] - comVelocities[j]);
    const aspVelDiff = Math.abs(aspectVelocities[i] - aspectVelocities[j]);
    const velDiff = Math.min(1, gridVelDiff * 0.65 + comVelDiff * 0.2 + aspVelDiff * 0.15);

    const rmse = Math.sqrt(rgbDiffSq / cellCount / 4);
    const rgbSim = Math.max(0, Math.min(1, 1 - rmse / 140));

    // Minimize: (1 - Silhouette_IoU(F_i, F_j)) + Velocity_Difference(F_i, F_j)
    const cost = (1 - iou) * 0.68 + velDiff * 0.32 + (1 - rgbSim) * 0.15;
    return { iou, velDiff, rgbSim, cost };
  };

  const similarities: number[] = [];
  const silhouetteIoUs: number[] = [];
  const velocityDiffs: number[] = [];

  for (let idx = 0; idx < frames.length; idx++) {
    if (idx === 0) {
      similarities.push(100);
      silhouetteIoUs.push(100);
      velocityDiffs.push(0);
    } else {
      const m = evaluatePair(0, idx);
      const combinedScore = Math.max(
        0,
        Math.min(100, (1 - m.cost) * 100)
      );
      similarities.push(Number(combinedScore.toFixed(1)));
      silhouetteIoUs.push(Number((m.iou * 100).toFixed(1)));
      velocityDiffs.push(Number((m.velDiff * 100).toFixed(1)));
    }
  }

  let bestStart = 0;
  let bestEnd = frames.length - 1;
  let bestEval = evaluatePair(0, frames.length - 1);

  // Compute pairwise Silhouette Dissimilarity (1 - IoU) matrix so we can measure
  // the peak motion excursion inside any candidate loop [s, e].
  // This prevents picking a static pre-action pause (where nothing moved yet)!
  const pairDissim: Float32Array = new Float32Array(frames.length * frames.length);
  let globalMaxExcursion = 0;
  for (let a = 0; a < frames.length; a++) {
    for (let b = a + 1; b < frames.length; b++) {
      const sA = silhouettes[a];
      const sB = silhouettes[b];
      let inter = 0;
      let uni = 0;
      for (let p = 0; p < cellCount; p++) {
        const va = sA[p];
        const vb = sB[p];
        if (va > 0.05 || vb > 0.05) {
          inter += Math.min(va, vb);
          uni += Math.max(va, vb);
        }
      }
      const dissim = uni > 0 ? 1 - inter / uni : 0;
      pairDissim[a * frames.length + b] = dissim;
      pairDissim[b * frames.length + a] = dissim;
      if (dissim > globalMaxExcursion) {
        globalMaxExcursion = dissim;
      }
    }
  }

  const minCycleFrames = Math.max(6, Math.floor(frames.length * 0.45));
  let bestAdjustedScore = Infinity;

  for (let s = 0; s < frames.length - minCycleFrames; s++) {
    for (let e = s + minCycleFrames; e < frames.length; e++) {
      // Find peak silhouette motion excursion inside [s, e]
      let peakExcursion = 0;
      for (let k = s + 1; k < e; k++) {
        const dStart = pairDissim[s * frames.length + k];
        const dEnd = pairDissim[e * frames.length + k];
        const m = Math.max(dStart, dEnd);
        if (m > peakExcursion) peakExcursion = m;
      }

      // Skip static idle segments if the clip contains a real action peak (like a punch or walk)
      if (globalMaxExcursion > 0.06 && peakExcursion < globalMaxExcursion * 0.72) {
        continue;
      }

      const ev = evaluatePair(s, e);
      // Reward capturing the full action excursion and longer spans
      const actionCoverageBonus =
        globalMaxExcursion > 0.01 ? (peakExcursion / globalMaxExcursion) * 0.12 : 0;
      const lengthBonus = ((e - s) / frames.length) * 0.08;
      const adjustedCost = ev.cost - actionCoverageBonus - lengthBonus;

      if (adjustedCost < bestAdjustedScore) {
        bestAdjustedScore = adjustedCost;
        bestEval = ev;
        bestStart = s;
        bestEnd = e;
      }
    }
  }

  const finalSimilarity = Number(
    Math.max(0, Math.min(100, (1 - bestEval.cost * 0.85) * 100)).toFixed(1)
  );

  return {
    similarities,
    silhouetteIoUs,
    velocityDiffs,
    bestLoop: {
      startIdx: bestStart,
      endIdx: bestEnd,
      similarity: finalSimilarity,
      silhouetteIoU: Number((bestEval.iou * 100).toFixed(1)),
      velocityDiff: Number((bestEval.velDiff * 100).toFixed(1)),
      loopCost: Number(bestEval.cost.toFixed(3)),
    },
  };
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * V2 STAGE 4B: True Box / Area-Averaging Supersampling Downscaler
 * Integrates pre-multiplied RGB and alpha over each exact source pixel footprint [sx0..sx1, sy0..sy1]
 * when scaling native 720p/1080p frames down to target sprite dimensions (e.g. 128x128 or 256x256).
 */
export function drawWithAreaAveragingSupersampling(
  srcCanvas: HTMLCanvasElement,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  destCanvas: HTMLCanvasElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  pixelArtHard: boolean = false
): void {
  const destCtx = destCanvas.getContext('2d')!;
  if (pixelArtHard || destW >= srcW || destH >= srcH) {
    destCtx.imageSmoothingEnabled = !pixelArtHard;
    if (!pixelArtHard) destCtx.imageSmoothingQuality = 'high';
    destCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
    return;
  }

  const sCtx = srcCanvas.getContext('2d')!;
  const safeSX = Math.max(0, Math.floor(srcX));
  const safeSY = Math.max(0, Math.floor(srcY));
  const safeSW = Math.min(srcCanvas.width - safeSX, Math.ceil(srcW));
  const safeSH = Math.min(srcCanvas.height - safeSY, Math.ceil(srcH));
  if (safeSW <= 0 || safeSH <= 0 || destW <= 0 || destH <= 0) return;

  const srcImg = sCtx.getImageData(safeSX, safeSY, safeSW, safeSH).data;
  const outImg = destCtx.createImageData(destW, destH);
  const outData = outImg.data;

  const scaleX = safeSW / destW;
  const scaleY = safeSH / destH;

  for (let dy = 0; dy < destH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(safeSH - 1, Math.floor(sy1));

    for (let dx = 0; dx < destW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(safeSW - 1, Math.floor(sx1));

      let sumPremulR = 0;
      let sumPremulG = 0;
      let sumPremulB = 0;
      let sumAlpha = 0;
      let totalArea = 0;

      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        const rowOffset = sy * safeSW;

        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const area = wx * wy;
          const idx = (rowOffset + sx) * 4;
          const a = srcImg[idx + 3] / 255;

          totalArea += area;
          if (a > 0) {
            const premul = a * area;
            sumPremulR += srcImg[idx] * premul;
            sumPremulG += srcImg[idx + 1] * premul;
            sumPremulB += srcImg[idx + 2] * premul;
            sumAlpha += premul;
          }
        }
      }

      const outIdx = (dy * destW + dx) * 4;
      if (sumAlpha > 0.001 && totalArea > 0) {
        const finalAlpha = Math.min(1, sumAlpha / totalArea);
        outData[outIdx] = Math.round(Math.min(255, sumPremulR / sumAlpha));
        outData[outIdx + 1] = Math.round(Math.min(255, sumPremulG / sumAlpha));
        outData[outIdx + 2] = Math.round(Math.min(255, sumPremulB / sumAlpha));
        outData[outIdx + 3] = Math.round(finalAlpha * 255);
      }
    }
  }

  const temp = document.createElement('canvas');
  temp.width = destW;
  temp.height = destH;
  temp.getContext('2d')!.putImageData(outImg, 0, 0);
  destCtx.drawImage(temp, destX, destY);
}

/**
 * Normalizes and packs frames into the final Sprite Sheet with:
 * - Center-of-Mass (centerX) Horizontal Stabilization
 * - Lowest Foot Pixel (maxY) Unified Baseline Locking
 * - Area-Averaging Supersampling to target sprite dimensions (e.g. 128x128 or 256x256)
 */
export function buildNormalizedSpriteSheetAndMetadata(
  assetName: string,
  frames: ExtractedFrame[],
  settings: ProcessingSettings,
  loopStart: number,
  loopEnd: number
): {
  sheetCanvas: HTMLCanvasElement;
  normalizedFrames: { name: string; canvas: HTMLCanvasElement }[];
  metadataJson: string;
  metadataExt: string;
  frameWidth: number;
  frameHeight: number;
} {
  const activeFrames = frames.filter(
    (f, idx) => f.enabled && idx >= loopStart && idx <= loopEnd
  );
  const workingList = activeFrames.length > 0 ? activeFrames : frames.slice(0, 1);

  let globalMinX = 99999;
  let globalMinY = 99999;
  let globalMaxX = 0;
  let globalMaxY = 0;

  let maxCropW = 16;
  let maxCropH = 16;

  // Extents relative to each frame's Center-of-Mass (centerX) and Lowest Foot Pixel (maxY)
  let maxLeftFromCom = 8;
  let maxRightFromCom = 8;
  let maxTopFromFeet = 16;
  let maxBottomFromFeet = 0;

  for (const f of workingList) {
    const box = settings.autoCrop
      ? f.cropBox
      : { x: 0, y: 0, width: f.originalWidth, height: f.originalHeight };
    const core = f.coreBodyBox || box;

    if (box.x < globalMinX) globalMinX = box.x;
    if (box.y < globalMinY) globalMinY = box.y;
    if (box.x + box.width > globalMaxX) globalMaxX = box.x + box.width;
    if (box.y + box.height > globalMaxY) globalMaxY = box.y + box.height;

    if (box.width > maxCropW) maxCropW = box.width;
    if (box.height > maxCropH) maxCropH = box.height;

    const anchorCenterX = f.centerOfMassX ?? core.x + core.width / 2;
    const anchorFeetY = f.lowestFootY ?? core.y + core.height;

    const leftExt = Math.max(0, anchorCenterX - box.x);
    const rightExt = Math.max(0, box.x + box.width - anchorCenterX);
    const topExt = Math.max(0, anchorFeetY - box.y);
    const botExt = Math.max(0, box.y + box.height - anchorFeetY);

    if (leftExt > maxLeftFromCom) maxLeftFromCom = leftExt;
    if (rightExt > maxRightFromCom) maxRightFromCom = rightExt;
    if (topExt > maxTopFromFeet) maxTopFromFeet = topExt;
    if (botExt > maxBottomFromFeet) maxBottomFromFeet = botExt;
  }

  const globalUnionBox: BoundingBox = {
    x: Math.max(0, globalMinX),
    y: Math.max(0, globalMinY),
    width: Math.max(16, globalMaxX - Math.max(0, globalMinX)),
    height: Math.max(16, globalMaxY - Math.max(0, globalMinY)),
  };

  const pad = settings.padding * 2;
  let baseW = maxCropW;
  let baseH = maxCropH;

  if (settings.autoCrop && settings.centerStabilization === 'global_locked') {
    baseW = globalUnionBox.width;
    baseH = globalUnionBox.height;
  } else if (settings.autoCrop && settings.centerStabilization === 'core_grounded') {
    baseW = Math.ceil(Math.max(maxLeftFromCom, maxRightFromCom) * 2);
    baseH = Math.ceil(maxTopFromFeet + maxBottomFromFeet);
  }

  const targetRes = settings.targetSpriteResolution || 0;
  let normW: number;
  let normH: number;
  let uniformScale: number;

  if (targetRes > 0) {
    // Uniform scaling into targetRes x targetRes (e.g. 128x128 or 256x256) with Foot Locking
    normW = targetRes;
    normH = targetRes;
    const availW = Math.max(16, targetRes - pad);
    const availH = Math.max(16, targetRes - pad);
    uniformScale = Math.min(availW / Math.max(1, baseW), availH / Math.max(1, baseH));
  } else {
    uniformScale = settings.targetScale;
    normW = Math.max(8, Math.round((baseW + pad) * uniformScale));
    normH = Math.max(8, Math.round((baseH + pad) * uniformScale));
  }

  const normalizedFrames: { name: string; canvas: HTMLCanvasElement }[] = workingList.map(
    (f, i) => {
      const src = f.processedCanvas || f.sourceCanvas;

      const box = !settings.autoCrop
        ? { x: 0, y: 0, width: src.width, height: src.height }
        : settings.centerStabilization === 'global_locked'
        ? globalUnionBox
        : f.cropBox;

      const core = f.coreBodyBox || box;
      const anchorCenterX = f.centerOfMassX ?? core.x + core.width / 2;
      const anchorFeetY = f.lowestFootY ?? core.y + core.height;

      const frameW = settings.normalizeDimensions
        ? normW
        : Math.max(8, Math.round((box.width + pad) * uniformScale));
      const frameH = settings.normalizeDimensions
        ? normH
        : Math.max(8, Math.round((box.height + pad) * uniformScale));

      const c = document.createElement('canvas');
      c.width = frameW;
      c.height = frameH;

      const drawW = Math.max(1, Math.round(box.width * uniformScale));
      const drawH = Math.max(1, Math.round(box.height * uniformScale));

      let destX = Math.round((frameW - drawW) / 2);
      let destY = Math.round((frameH - drawH) / 2);

      if (
        settings.autoCrop &&
        settings.normalizeDimensions &&
        settings.centerStabilization === 'core_grounded'
      ) {
        // Lock Center-of-Mass (centerX) to the exact horizontal center of the sprite cell
        const comXInCrop = (anchorCenterX - box.x) * uniformScale;
        destX = Math.round(frameW / 2 - comXInCrop);

        if (settings.anchorAlignment === 'bottom_center') {
          // Lock Lowest Foot Pixel (maxY) to the unified ground baseline row!
          const feetYInCrop = (anchorFeetY - box.y) * uniformScale;
          const groundLineY =
            frameH -
            Math.max(
              Math.round(settings.padding),
              Math.round((settings.padding + maxBottomFromFeet) * uniformScale)
            );
          destY = Math.round(groundLineY - feetYInCrop);
        } else {
          const coreCenterYInCrop = (core.y + core.height / 2 - box.y) * uniformScale;
          destY = Math.round(frameH / 2 - coreCenterYInCrop);
        }
      } else if (settings.anchorAlignment === 'bottom_center') {
        destX = Math.round((frameW - drawW) / 2);
        destY = frameH - drawH - Math.max(2, Math.round(settings.padding * uniformScale));
      } else if (settings.anchorAlignment === 'preserve_original' && !settings.autoCrop) {
        destX = Math.round(settings.padding * uniformScale);
        destY = Math.round(settings.padding * uniformScale);
      }

      drawWithAreaAveragingSupersampling(
        src,
        box.x,
        box.y,
        box.width,
        box.height,
        c,
        destX,
        destY,
        drawW,
        drawH,
        settings.edgeMode === 'pixel_art_hard'
      );

      return {
        name: f.label || `frame_${String(i).padStart(3, '0')}`,
        canvas: c,
      };
    }
  );

  const count = normalizedFrames.length;
  const spacing = settings.sheetSpacing;
  let cols = settings.sheetColumns;
  if (settings.sheetLayout === 'horizontal_strip') cols = count;
  else if (settings.sheetLayout === 'vertical_strip') cols = 1;
  else if (settings.sheetLayout === 'pot_packed') cols = Math.ceil(Math.sqrt(count));
  cols = Math.max(1, Math.min(count, cols));
  const rows = Math.ceil(count / cols);

  let sheetW = cols * normW + Math.max(0, cols - 1) * spacing;
  let sheetH = rows * normH + Math.max(0, rows - 1) * spacing;

  if (settings.powerOfTwo || settings.sheetLayout === 'pot_packed') {
    sheetW = nextPowerOfTwo(sheetW);
    sheetH = nextPowerOfTwo(sheetH);
  }

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = Math.max(1, sheetW);
  sheetCanvas.height = Math.max(1, sheetH);
  const sheetCtx = sheetCanvas.getContext('2d')!;

  const frameCoords: {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];

  normalizedFrames.forEach((nf, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * (normW + spacing);
    const y = row * (normH + spacing);
    sheetCtx.drawImage(nf.canvas, x, y);
    frameCoords.push({
      name: nf.name,
      x,
      y,
      w: nf.canvas.width,
      h: nf.canvas.height,
    });
  });

  const cleanImageName = `${assetName.replace(/\.[^/.]+$/, '')}_sheet.png`;
  const metadataJson = formatEngineMetadata(
    settings.engineFormat,
    cleanImageName,
    sheetCanvas.width,
    sheetCanvas.height,
    frameCoords,
    settings.videoFps
  );

  return {
    sheetCanvas,
    normalizedFrames,
    metadataJson,
    metadataExt: 'json',
    frameWidth: normW,
    frameHeight: normH,
  };
}

function formatEngineMetadata(
  format: EngineExportFormat,
  imageName: string,
  sheetW: number,
  sheetH: number,
  frames: { name: string; x: number; y: number; w: number; h: number }[],
  fps: number
): string {
  if (format === 'unity') {
    return JSON.stringify(
      {
        exporter: 'SpriteSmithy Pro V2',
        textureImporter: {
          textureType: 'Sprite',
          spriteMode: 2,
          pixelsPerUnit: 100,
          filterMode: 'Bilinear',
          alphaIsTransparency: true,
          sprites: frames.map((f) => ({
            name: f.name,
            rect: { x: f.x, y: sheetH - f.y - f.h, width: f.w, height: f.h },
            alignment: 7,
            pivot: { x: 0.5, y: 0.0 },
          })),
        },
      },
      null,
      2
    );
  }

  if (format === 'godot4') {
    return JSON.stringify(
      {
        resource_type: 'SpriteFrames',
        exporter: 'SpriteSmithy Pro V2',
        texture: imageName,
        animations: [
          {
            name: 'default_loop',
            speed: fps,
            loop: true,
            frames: frames.map((f, i) => ({
              index: i,
              name: f.name,
              region: { x: f.x, y: f.y, w: f.w, h: f.h },
            })),
          },
        ],
      },
      null,
      2
    );
  }

  if (format === 'gdevelop') {
    return JSON.stringify(
      {
        adaptCollisionMaskAutomatically: true,
        name: imageName.replace('_sheet.png', ''),
        animations: [
          {
            name: 'Loop',
            useMultipleDirections: false,
            directions: [
              {
                looping: true,
                timeBetweenFrames: Number((1 / fps).toFixed(4)),
                sprites: frames.map((f) => ({
                  image: `${f.name}.png`,
                  atlasRect: { x: f.x, y: f.y, width: f.w, height: f.h },
                  originPoint: { name: 'Origin', x: Math.round(f.w / 2), y: f.h },
                })),
              },
            ],
          },
        ],
      },
      null,
      2
    );
  }

  if (format === 'aseprite') {
    const framesObj: Record<string, any> = {};
    for (const f of frames) {
      framesObj[`${f.name}.png`] = {
        frame: { x: f.x, y: f.y, w: f.w, h: f.h },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
        sourceSize: { w: f.w, h: f.h },
        duration: Math.round(1000 / fps),
      };
    }
    return JSON.stringify(
      {
        frames: framesObj,
        meta: {
          app: 'SpriteSmithy Pro V2',
          image: imageName,
          format: 'RGBA8888',
          size: { w: sheetW, h: sheetH },
          scale: '1',
        },
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      textures: [
        {
          image: imageName,
          format: 'RGBA8888',
          size: { w: sheetW, h: sheetH },
          scale: 1,
          frames: frames.map((f) => ({
            filename: f.name,
            rotated: false,
            trimmed: true,
            sourceSize: { w: f.w, h: f.h },
            spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
            frame: { x: f.x, y: f.y, w: f.w, h: f.h },
          })),
        },
      ],
      meta: {
        app: 'SpriteSmithy Pro V2',
        fps,
      },
    },
    null,
    2
  );
}

/**
 * Instant (<50ms) video metadata & 3-Cluster K-Means background profiler for Stage 1
 */
export async function readVideoMetadataQuick(url: string): Promise<{
  videoDurationSec: number;
  videoWidth: number;
  videoHeight: number;
  detectedKeyColor: string;
  bgProfile: AutoCalibratedBgProfile;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      const duration = Number(Math.max(0.1, video.duration || 4.0).toFixed(2));
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 720;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = Math.min(w, 480);
      sampleCanvas.height = Math.min(h, 480);
      const ctx = sampleCanvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);

      const bgProfile = computeAutoCalibratedBgProfile(sampleCanvas, true);
      const detectedKeyColor = bgProfile.clusters[0].hex;

      resolve({
        videoDurationSec: duration,
        videoWidth: w,
        videoHeight: h,
        detectedKeyColor,
        bgProfile,
      });
    };

    video.onerror = () => {
      reject(new Error(`Unable to read video metadata from ${url}`));
    };
  });
}

/**
 * Fast Silhouette-IoU + Motion-Direction timeline scanner for Stage 2
 */
export async function autoDetectSeamlessLoopTimeWindow(
  url: string,
  onProgress?: (pct: number) => void
): Promise<{
  startSec: number;
  endSec: number;
  similarity: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = async () => {
      try {
        const duration = Math.max(0.4, video.duration || 4.0);
        const sampleCount = Math.min(28, Math.max(10, Math.round(duration * 7)));
        const thumbSize = 48;
        const thumbs: { timeSec: number; data: Uint8ClampedArray }[] = [];

        const c = document.createElement('canvas');
        c.width = thumbSize;
        c.height = thumbSize;
        const ctx = c.getContext('2d')!;

        for (let i = 0; i < sampleCount; i++) {
          const t = (i / (sampleCount - 1)) * (duration - 0.05);
          await seekVideo(video, t);
          ctx.clearRect(0, 0, thumbSize, thumbSize);
          ctx.drawImage(video, 0, 0, thumbSize, thumbSize);
          thumbs.push({
            timeSec: Number(t.toFixed(2)),
            data: ctx.getImageData(0, 0, thumbSize, thumbSize).data,
          });
          if (onProgress) {
            onProgress(Math.round(((i + 1) / sampleCount) * 100));
          }
        }

        // Compare both pose and temporal velocity difference across timeline samples
        const compareWithVelocity = (idxA: number, idxB: number): number => {
          const a = thumbs[idxA].data;
          const b = thumbs[idxB].data;
          const aNext = thumbs[Math.min(thumbs.length - 1, idxA + 1)].data;
          const bNext = thumbs[Math.min(thumbs.length - 1, idxB + 1)].data;

          let poseSq = 0;
          let velSq = 0;
          const pxCount = a.length / 4;

          for (let i = 0; i < a.length; i += 4) {
            const dr = a[i] - b[i];
            const dg = a[i + 1] - b[i + 1];
            const db = a[i + 2] - b[i + 2];
            poseSq += dr * dr + dg * dg + db * db;

            const vAr = aNext[i] - a[i];
            const vBr = bNext[i] - b[i];
            const vAg = aNext[i + 1] - a[i + 1];
            const vBg = bNext[i + 1] - b[i + 1];
            velSq += (vAr - vBr) * (vAr - vBr) + (vAg - vBg) * (vAg - vBg);
          }

          const poseRmse = Math.sqrt(poseSq / pxCount / 3);
          const velRmse = Math.sqrt(velSq / pxCount / 2);
          const combined = poseRmse * 0.72 + velRmse * 0.28;
          return Number(Math.max(0, Math.min(100, (1 - combined / 120) * 100)).toFixed(1));
        };

        // Measure pairwise frame difference so we only pick loops that span the actual action peak!
        const frameDiff = (idxA: number, idxB: number): number => {
          const a = thumbs[idxA].data;
          const b = thumbs[idxB].data;
          let sq = 0;
          for (let i = 0; i < a.length; i += 4) {
            const dr = a[i] - b[i];
            const dg = a[i + 1] - b[i + 1];
            const db = a[i + 2] - b[i + 2];
            sq += dr * dr + dg * dg + db * db;
          }
          return Math.sqrt(sq / (a.length / 4) / 3);
        };

        let globalMaxDiff = 0;
        for (let i = 0; i < thumbs.length; i++) {
          for (let j = i + 1; j < thumbs.length; j++) {
            const d = frameDiff(i, j);
            if (d > globalMaxDiff) globalMaxDiff = d;
          }
        }

        let bestStart = 0;
        let bestEnd = Number(duration.toFixed(2));
        let bestScore = -1;

        for (let s = 0; s < thumbs.length - 4; s++) {
          for (let e = s + 4; e < thumbs.length; e++) {
            const span = thumbs[e].timeSec - thumbs[s].timeSec;
            if (span < Math.min(1.0, duration * 0.4)) continue;

            // Ensure window [s, e] spans the peak character action (never a static pre-action pause!)
            let peakInternalDiff = 0;
            for (let k = s + 1; k < e; k++) {
              const d = Math.max(frameDiff(s, k), frameDiff(e, k));
              if (d > peakInternalDiff) peakInternalDiff = d;
            }
            if (globalMaxDiff > 4 && peakInternalDiff < globalMaxDiff * 0.75) {
              continue;
            }

            const poseAndVelScore = compareWithVelocity(s, e);
            const actionBonus =
              globalMaxDiff > 1 ? (peakInternalDiff / globalMaxDiff) * 8 : 0;
            const totalScore = poseAndVelScore + actionBonus;

            if (totalScore > bestScore) {
              bestScore = totalScore;
              bestStart = thumbs[s].timeSec;
              bestEnd = thumbs[e].timeSec;
            }
          }
        }

        resolve({
          startSec: bestStart,
          endSec: bestEnd,
          similarity: Number(Math.min(99.8, Math.max(85, bestScore)).toFixed(1)),
        });
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => reject(new Error('Failed to scan video for loop detection'));
  });
}

/**
 * Extracts frames at native 720p/1080p resolution before any downscaling,
 * and computes the V2 Auto-Calibrated 3-Cluster K-Means Background Profile.
 */
export async function extractFramesFromVideoUrl(
  url: string,
  labelPrefix: string,
  fps: number = 24,
  startSec: number = 0,
  endSec?: number,
  maxFrames: number = 120,
  onProgress?: (current: number, total: number) => void
): Promise<{
  frames: ExtractedFrame[];
  detectedKeyColor: string;
  bgProfile: AutoCalibratedBgProfile;
  videoDurationSec: number;
  actualStartSec: number;
  actualEndSec: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = async () => {
      try {
        const fullDuration = Math.max(0.1, video.duration || 4.0);
        const safeStart = Math.max(0, Math.min(startSec, fullDuration - 0.05));
        const safeEnd =
          endSec !== undefined && endSec > safeStart
            ? Math.min(fullDuration, endSec)
            : fullDuration;
        const windowDuration = Math.max(0.05, safeEnd - safeStart);

        const rawFrameCount = Math.max(1, Math.round(windowDuration * fps));
        const totalFrames = Math.min(maxFrames, rawFrameCount);

        // Preserve high-resolution 720p/1080p frame detail before any sprite downscaling
        const maxDim = 960;
        const scale =
          Math.max(video.videoWidth, video.videoHeight) > maxDim
            ? maxDim / Math.max(video.videoWidth, video.videoHeight)
            : 1;
        const w = Math.max(32, Math.round(video.videoWidth * scale));
        const h = Math.max(32, Math.round(video.videoHeight * scale));

        const frames: ExtractedFrame[] = [];
        for (let i = 0; i < totalFrames; i++) {
          const time = Math.min(
            safeEnd - 0.01,
            safeStart + (i / Math.max(1, totalFrames)) * windowDuration
          );
          await seekVideo(video, time);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, w, h);
          const sourceRgba = ctx.getImageData(0, 0, w, h).data;

          frames.push({
            id: `${labelPrefix}-frame-${i}-${Math.round(time * 100)}`,
            index: i,
            label: `F_${String(i + 1).padStart(2, '0')} (${time.toFixed(2)}s)`,
            timestampSec: Number(time.toFixed(2)),
            enabled: true,
            sourceCanvas: canvas,
            sourceRgba,
            cropBox: { x: 0, y: 0, width: w, height: h },
            originalWidth: w,
            originalHeight: h,
            processedWidth: w,
            processedHeight: h,
          });

          if (onProgress) {
            onProgress(i + 1, totalFrames);
          }
        }

        const bgProfile =
          frames.length > 0
            ? computeAutoCalibratedBgProfile(frames[0].sourceCanvas, true)
            : computeAutoCalibratedBgProfile(document.createElement('canvas'), true);
        const detectedKeyColor = bgProfile.clusters[0].hex;

        resolve({
          frames,
          detectedKeyColor,
          bgProfile,
          videoDurationSec: Number(fullDuration.toFixed(2)),
          actualStartSec: Number(safeStart.toFixed(2)),
          actualEndSec: Number(safeEnd.toFixed(2)),
        });
      } catch (e) {
        reject(e);
      }
    };

    video.onerror = () => {
      reject(new Error(`Unable to load video from ${url}`));
    };
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, timeSec);
  });
}

export async function extractFramesFromImageFile(
  file: File
): Promise<{
  frames: ExtractedFrame[];
  detectedKeyColor: string;
  bgProfile: AutoCalibratedBgProfile;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxDim = 1080;
      const scale =
        Math.max(img.width, img.height) > maxDim
          ? maxDim / Math.max(img.width, img.height)
          : 1;
      const w = Math.max(16, Math.round(img.width * scale));
      const h = Math.max(16, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      const bgProfile = computeAutoCalibratedBgProfile(canvas, true);
      const detectedKeyColor = bgProfile.clusters[0].hex;
      URL.revokeObjectURL(url);

      resolve({
        frames: [
          {
            id: `${file.name}-frame-0`,
            index: 0,
            label: file.name.replace(/\.[^/.]+$/, ''),
            enabled: true,
            sourceCanvas: canvas,
            cropBox: { x: 0, y: 0, width: w, height: h },
            originalWidth: w,
            originalHeight: h,
            processedWidth: w,
            processedHeight: h,
            bgProfile,
          },
        ],
        detectedKeyColor,
        bgProfile,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to read image ${file.name}`));
    };
    img.src = url;
  });
}
