import {
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

function boxDistance(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

/**
 * Samples perimeter border pixels of a canvas to auto-detect the dominant background key color.
 */
export function autoDetectCornerKeyColor(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#FBFBFB';
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const samplePoint = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const a = data[idx + 3];
    if (a < 128) return;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = `${r >> 3}_${g >> 3}_${b >> 3}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };

  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));
  for (let x = 0; x < width; x += stepX) {
    samplePoint(x, 0);
    samplePoint(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    samplePoint(0, y);
    samplePoint(width - 1, y);
  }

  let best = { count: 0, r: 251, g: 251, b: 251 };
  for (const b of buckets.values()) {
    if (b.count > best.count) best = b;
  }

  if (best.count === 0) return '#FBFBFB';
  return rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * Core deterministic SpriteSmithy Halo Removal, Trapped Pocket Solver, Loose Particle Cleaner & High-Res Edge pipeline.
 */
export function processSpriteFrameCanvas(
  sourceCanvas: HTMLCanvasElement,
  settings: ProcessingSettings
): {
  processedCanvas: HTMLCanvasElement;
  heatmapCanvas: HTMLCanvasElement;
  cropBox: BoundingBox;
  coreBodyBox: BoundingBox;
  removedParticleBoxes: BoundingBox[];
  metrics: HaloMetrics;
} {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const pixelCount = width * height;

  const srcCtx = sourceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, width, height).data;

  const activeKeyHex =
    settings.keyingMode === 'auto_corner'
      ? autoDetectCornerKeyColor(sourceCanvas)
      : settings.keyColor;
  const [keyR, keyG, keyB] = hexToRgb(activeKeyHex);
  const [keyY, keyCb, keyCr] = rgbToYCbCr(keyR, keyG, keyB);

  const keySaturation = Math.max(keyR, keyG, keyB) - Math.min(keyR, keyG, keyB);
  const isNeutralWhiteOrBlackKey = keySaturation < 30;

  const rBuf = new Float32Array(pixelCount);
  const gBuf = new Float32Array(pixelCount);
  const bBuf = new Float32Array(pixelCount);
  const rawAlpha = new Float32Array(pixelCount);
  const alphaBuf = new Float32Array(pixelCount);
  const colorDistBuf = new Float32Array(pixelCount);

  const tolDist = (settings.tolerance / 100) * 190;
  const softRamp = Math.max(2.0, (settings.softness / 100) * 150);
  const chromaRatio = isNeutralWhiteOrBlackKey
    ? Math.min(0.25, settings.chromaWeight / 100)
    : settings.chromaWeight / 100;

  // Precompute optional secondary background / shadow key colors
  const secondaryKeys = (settings.secondaryKeyColors || []).map((sec) => {
    const [sr, sg, sb] = hexToRgb(sec.hex);
    const [sy, scb, scr] = rgbToYCbCr(sr, sg, sb);
    const sSat = Math.max(sr, sg, sb) - Math.min(sr, sg, sb);
    const sChromaRatio = sSat < 30 ? 0.22 : 0.78;
    const sTolDist = ((sec.tolerance ?? 20) / 100) * 190;
    return { sr, sg, sb, sy, scb, scr, sChromaRatio, sTolDist };
  });

  // PASS 1: Multi-Color Perceptual Chroma + Luma Keying (Primary BG + Conditional Shadow/Secondary Colors)
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = srcData[idx];
    const g = srcData[idx + 1];
    const b = srcData[idx + 2];
    const srcA = srcData[idx + 3] / 255;

    rBuf[i] = r;
    gBuf[i] = g;
    bBuf[i] = b;

    if (settings.keyingMode === 'off' || srcA === 0) {
      rawAlpha[i] = srcA;
      alphaBuf[i] = srcA;
      colorDistBuf[i] = 255;
      continue;
    }

    if (settings.keyingMode === 'luma_key') {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
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

    // Evaluate any additional background shades / shadow colors conditionally
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
        if (sAlpha < bestA) {
          bestA = sAlpha;
        }
        if (sDist < minPerceptualDist) {
          minPerceptualDist = sDist;
        }
      }
    }

    colorDistBuf[i] = minPerceptualDist;
    rawAlpha[i] = bestA * srcA;
    alphaBuf[i] = rawAlpha[i];
  }

  let trappedHolesPunched = 0;

  // PASS 1B: Exterior Flood-Fill + Auto Enclosed Gap Solver + Localised Magic-Wand Pocket Puncher
  if (settings.keyingMode !== 'off') {
    const isExteriorBg = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);

    if (settings.protectInteriorColors) {
      let head = 0;
      let tail = 0;

      for (let x = 0; x < width; x++) {
        const top = x;
        const bot = (height - 1) * width + x;
        if (alphaBuf[top] < 0.85) {
          isExteriorBg[top] = 1;
          queue[tail++] = top;
        }
        if (alphaBuf[bot] < 0.85) {
          isExteriorBg[bot] = 1;
          queue[tail++] = bot;
        }
      }
      for (let y = 1; y < height - 1; y++) {
        const left = y * width;
        const right = y * width + (width - 1);
        if (alphaBuf[left] < 0.85) {
          isExteriorBg[left] = 1;
          queue[tail++] = left;
        }
        if (alphaBuf[right] < 0.85) {
          isExteriorBg[right] = 1;
          queue[tail++] = right;
        }
      }

      while (head < tail) {
        const curr = queue[head++];
        const cy = Math.floor(curr / width);
        const cx = curr - cy * width;

        if (cx > 0) {
          const n = curr - 1;
          if (!isExteriorBg[n] && alphaBuf[n] < 0.9) {
            isExteriorBg[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cx < width - 1) {
          const n = curr + 1;
          if (!isExteriorBg[n] && alphaBuf[n] < 0.9) {
            isExteriorBg[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy > 0) {
          const n = curr - width;
          if (!isExteriorBg[n] && alphaBuf[n] < 0.9) {
            isExteriorBg[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy < height - 1) {
          const n = curr + width;
          if (!isExteriorBg[n] && alphaBuf[n] < 0.9) {
            isExteriorBg[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      const visitedPocket = new Uint8Array(pixelCount);
      const pocketIdMap = new Int32Array(pixelCount);
      pocketIdMap.fill(-1);

      interface PocketInfo {
        id: number;
        pixels: number[];
        area: number;
        avgColorDist: number;
        avgSaturation: number;
        punched: boolean;
      }
      const pockets: PocketInfo[] = [];

      const maxAllowedColorDist = Math.max(
        4,
        ((105 - settings.holeColorStrictness) / 100) * 48
      );

      for (let y = 1; y < height - 1; y++) {
        const rowOffset = y * width;
        for (let x = 1; x < width - 1; x++) {
          const startIdx = rowOffset + x;
          if (
            isExteriorBg[startIdx] ||
            visitedPocket[startIdx] ||
            alphaBuf[startIdx] >= 0.75
          ) {
            continue;
          }

          const pocketPixels: number[] = [];
          let pHead = 0;
          let pTail = 0;
          queue[pTail++] = startIdx;
          visitedPocket[startIdx] = 1;

          let sumDist = 0;
          let sumSat = 0;

          while (pHead < pTail) {
            const curr = queue[pHead++];
            pocketPixels.push(curr);

            const r = rBuf[curr];
            const g = gBuf[curr];
            const b = bBuf[curr];
            sumDist += colorDistBuf[curr];
            sumSat += Math.max(r, g, b) - Math.min(r, g, b);

            const cy = Math.floor(curr / width);
            const cx = curr - cy * width;

            if (cx > 0) {
              const n = curr - 1;
              if (!isExteriorBg[n] && !visitedPocket[n] && alphaBuf[n] < 0.78) {
                visitedPocket[n] = 1;
                queue[pTail++] = n;
              }
            }
            if (cx < width - 1) {
              const n = curr + 1;
              if (!isExteriorBg[n] && !visitedPocket[n] && alphaBuf[n] < 0.78) {
                visitedPocket[n] = 1;
                queue[pTail++] = n;
              }
            }
            if (cy > 0) {
              const n = curr - width;
              if (!isExteriorBg[n] && !visitedPocket[n] && alphaBuf[n] < 0.78) {
                visitedPocket[n] = 1;
                queue[pTail++] = n;
              }
            }
            if (cy < height - 1) {
              const n = curr + width;
              if (!isExteriorBg[n] && !visitedPocket[n] && alphaBuf[n] < 0.78) {
                visitedPocket[n] = 1;
                queue[pTail++] = n;
              }
            }
          }

          const area = pocketPixels.length;
          const avgColorDist = sumDist / area;
          const avgSaturation = sumSat / area;
          const pid = pockets.length;

          for (let k = 0; k < area; k++) {
            pocketIdMap[pocketPixels[k]] = pid;
          }

          let shouldPunch = false;
          if (settings.autoPunchTrappedHoles) {
            const isPureBgColor =
              avgColorDist <= maxAllowedColorDist &&
              (!isNeutralWhiteOrBlackKey || avgSaturation <= 16);
            if (area >= settings.maxProtectedDetailArea && isPureBgColor) {
              shouldPunch = true;
            }
          }

          pockets.push({
            id: pid,
            pixels: pocketPixels,
            area,
            avgColorDist,
            avgSaturation,
            punched: shouldPunch,
          });
        }
      }

      if (settings.holeSeeds && settings.holeSeeds.length > 0) {
        for (const seed of settings.holeSeeds) {
          if (seed.mode === 'erase_particle') continue;
          const sx = Math.min(width - 1, Math.max(0, Math.round(seed.relX * width)));
          const sy = Math.min(height - 1, Math.max(0, Math.round(seed.relY * height)));

          const matchedPocketId = pocketIdMap[sy * width + sx];
          if (matchedPocketId !== -1 && pockets[matchedPocketId]) {
            pockets[matchedPocketId].punched = seed.mode === 'punch_hole';
          }
        }
      }

      for (const pocket of pockets) {
        if (pocket.punched) {
          trappedHolesPunched++;
          for (let k = 0; k < pocket.pixels.length; k++) {
            isExteriorBg[pocket.pixels[k]] = 1;
          }
        }
      }

      for (let y = 2; y < height - 2; y++) {
        const rowOffset = y * width;
        for (let x = 2; x < width - 2; x++) {
          const i = rowOffset + x;
          if (isExteriorBg[i]) continue;

          const nearBg =
            isExteriorBg[i - 1] ||
            isExteriorBg[i + 1] ||
            isExteriorBg[i - width] ||
            isExteriorBg[i + width] ||
            isExteriorBg[i - 2] ||
            isExteriorBg[i + 2] ||
            isExteriorBg[i - width * 2] ||
            isExteriorBg[i + width * 2];

          if (!nearBg) {
            alphaBuf[i] = 1.0;
            rawAlpha[i] = 1.0;
          }
        }
      }
    }

    // LOCALISED COLOR-AWARE MAGIC-WAND FLOOD FILL FOR 'punch_hole' AND 'protect_spot' SEEDS!
    // Works on ANY local shade (e.g. a cast shadow pocket, a darker shaded gap, or a local detail)
    // without requiring global removal of that color across the entire sprite!
    if (settings.holeSeeds && settings.holeSeeds.length > 0) {
      const localVisited = new Uint8Array(pixelCount);
      const localTol = ((settings.localPunchTolerance ?? 22) / 100) * 155;
      const maxLocalRadiusSq = Math.pow(Math.max(width, height) * 0.36, 2);

      for (const seed of settings.holeSeeds) {
        if (seed.mode === 'erase_particle') continue;
        const sx = Math.min(width - 1, Math.max(0, Math.round(seed.relX * width)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(seed.relY * height)));

        const [targetR, targetG, targetB] = seed.sampledHex
          ? hexToRgb(seed.sampledHex)
          : [rBuf[sy * width + sx], gBuf[sy * width + sx], bBuf[sy * width + sx]];

        // Find the closest matching pixel within a small 10px motion-tracking window around (sx, sy)
        let startIdx = sy * width + sx;
        let bestColorDiff = 999999;
        for (let dy = -10; dy <= 10; dy++) {
          const ny = sy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -10; dx <= 10; dx++) {
            const nx = sx + dx;
            if (nx < 0 || nx >= width) continue;
            const idx = ny * width + nx;
            const d =
              Math.hypot(
                rBuf[idx] - targetR,
                gBuf[idx] - targetG,
                bBuf[idx] - targetB
              ) * 0.65;
            if (d < bestColorDiff) {
              bestColorDiff = d;
              startIdx = idx;
            }
          }
        }

        if (bestColorDiff > localTol * 1.35) continue;

        localVisited.fill(0);
        let lHead = 0;
        let lTail = 0;
        queue[lTail++] = startIdx;
        localVisited[startIdx] = 1;

        while (lHead < lTail) {
          const curr = queue[lHead++];
          const cy = Math.floor(curr / width);
          const cx = curr - cy * width;

          const cDist =
            Math.hypot(
              rBuf[curr] - targetR,
              gBuf[curr] - targetG,
              bBuf[curr] - targetB
            ) * 0.62;

          if (seed.mode === 'punch_hole') {
            if (cDist <= localTol) {
              alphaBuf[curr] = 0;
              rawAlpha[curr] = 0;
            } else {
              const featherA = Math.min(1, (cDist - localTol) / Math.max(4, softRamp * 0.5));
              alphaBuf[curr] = Math.min(alphaBuf[curr], featherA);
              rawAlpha[curr] = Math.min(rawAlpha[curr], featherA);
            }
          } else if (seed.mode === 'protect_spot') {
            alphaBuf[curr] = 1.0;
            rawAlpha[curr] = 1.0;
          }

          // Expand 4-connected neighbors if within local color tolerance and local spatial radius
          const neighbors = [
            cx > 0 ? curr - 1 : -1,
            cx < width - 1 ? curr + 1 : -1,
            cy > 0 ? curr - width : -1,
            cy < height - 1 ? curr + width : -1,
          ];
          for (let k = 0; k < 4; k++) {
            const n = neighbors[k];
            if (n === -1 || localVisited[n]) continue;
            const ny = Math.floor(n / width);
            const nx = n - ny * width;
            const spatialDistSq = (nx - sx) * (nx - sx) + (ny - sy) * (ny - sy);
            if (spatialDistSq > maxLocalRadiusSq) continue;

            const nDist =
              Math.hypot(rBuf[n] - targetR, gBuf[n] - targetG, bBuf[n] - targetB) * 0.62;
            if (nDist <= localTol + Math.max(4, softRamp * 0.45)) {
              localVisited[n] = 1;
              queue[lTail++] = n;
            }
          }
        }

        if (seed.mode === 'punch_hole' && lTail > 2) {
          trappedHolesPunched++;
        }
      }
    }
  }

  // PASS 1C: Optional Ground Drop-Shadow Cleaner
  if (settings.removeGroundShadow && isNeutralWhiteOrBlackKey && keyY > 200) {
    const lowerStart = Math.floor(height * 0.72);
    for (let y = lowerStart; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const i = rowOffset + x;
        if (alphaBuf[i] === 0) continue;
        const r = rBuf[i];
        const g = gBuf[i];
        const b = bBuf[i];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (sat < 12 && luma > 165 && luma < 245) {
          alphaBuf[i] = 0;
          rawAlpha[i] = 0;
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
        alphaBuf[i] = 0;
        rawAlpha[i] = 0;
      }
    }
  }

  // PASS 2: Halo Eater (Sub-Pixel Alpha Choke / Dilation)
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

  // PASS 2.5: LOOSE PARTICLE & STRAY SPECKLE CLEANER + CORE BODY LOCK!
  // Finds the main character silhouette and eliminates floating dust specks, stray compression dots,
  // or detached particles that would otherwise shift the character off-center in the exported sprite sheet!
  const floorNorm = settings.alphaFloor / 255;
  const removedParticleBoxes: BoundingBox[] = [];
  let looseParticlesRemoved = 0;
  let coreBodyBox: BoundingBox = { x: 0, y: 0, width, height };

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

          // 8-connected neighbors with 2px bridge so closely attached hair/flame tips stay with body
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
      // Find the Main Character Body (largest connected foreground component)
      let mainIsland = islands[0];
      for (let i = 1; i < islands.length; i++) {
        if (islands[i].area > mainIsland.area) {
          mainIsland = islands[i];
        }
      }
      coreBodyBox = mainIsland.box;

      // Filter secondary islands if Loose Particle Cleaner is active or user clicked erase_particle
      if (islands.length > 1) {
        for (const isl of islands) {
          if (isl.id === mainIsland.id) continue;

          const distToMain = boxDistance(isl.box, mainIsland.box);
          let shouldRemove = false;

          if (settings.cleanLooseParticles) {
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

          // Also check if user manually clicked this particle with the 'erase_particle' tool
          if (!shouldRemove && settings.holeSeeds && settings.holeSeeds.length > 0) {
            for (const seed of settings.holeSeeds) {
              if (seed.mode !== 'erase_particle') continue;
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
    }
  }

  // PASS 3: Mathematical Foreground Color Unmixing & Chroma Spill Suppression
  const unmixAmt = settings.colorUnmixStrength / 100;
  const deSpillAmt = settings.deSpillStrength / 100;
  const lumaClampAmt = settings.haloLuminanceClamp / 100;

  if ((unmixAmt > 0 || deSpillAmt > 0 || lumaClampAmt > 0) && settings.keyingMode !== 'off') {
    const keyMax = Math.max(keyR, keyG, keyB);
    const isGreenDominant = keyG === keyMax && keyG > keyR + 20 && keyG > keyB + 20;
    const isMagentaDominant = keyR > 140 && keyB > 120 && keyG < 100;
    const isWhiteBackdrop = keyR > 210 && keyG > 210 && keyB > 210;

    for (let i = 0; i < pixelCount; i++) {
      const a = alphaBuf[i];
      if (a <= 0.005) continue;

      let r = rBuf[i];
      let g = gBuf[i];
      let b = bBuf[i];

      const mixFactor = Math.min(1, rawAlpha[i]);
      if (unmixAmt > 0 && mixFactor < 0.995) {
        const safeAlpha = Math.max(0.15, Math.pow(mixFactor, 0.85));
        const bgWeight = (1 - safeAlpha) * unmixAmt;
        const unmixedR = (r - bgWeight * keyR) / (1 - bgWeight * 0.92);
        const unmixedG = (g - bgWeight * keyG) / (1 - bgWeight * 0.92);
        const unmixedB = (b - bgWeight * keyB) / (1 - bgWeight * 0.92);

        r = Math.max(0, Math.min(255, unmixedR));
        g = Math.max(0, Math.min(255, unmixedG));
        b = Math.max(0, Math.min(255, unmixedB));
      }

      if (deSpillAmt > 0) {
        const edgeProximity = 1 - Math.min(1, a * 0.72);
        const effectiveSpill = deSpillAmt * Math.max(0.25, edgeProximity);

        if (isGreenDominant) {
          const avgRB = (r + b) * 0.5;
          if (g > avgRB) {
            const excessG = (g - avgRB) * effectiveSpill;
            g -= excessG;
            r = Math.min(255, r + excessG * 0.18);
            b = Math.min(255, b + excessG * 0.18);
          }
        } else if (isMagentaDominant) {
          const avgRB = (r + b) * 0.5;
          if (avgRB > g) {
            const excessM = (avgRB - g) * effectiveSpill;
            r = Math.max(0, r - excessM * 0.75);
            b = Math.max(0, b - excessM * 0.75);
            g = Math.min(255, g + excessM * 0.25);
          }
        } else if (isWhiteBackdrop && a < 0.94) {
          const pullDark = (1 - a) * effectiveSpill * 0.85;
          r *= 1 - pullDark;
          g *= 1 - pullDark;
          b *= 1 - pullDark;
        }
      }

      if (lumaClampAmt > 0 && a < 0.88) {
        const boundaryWeight = (1 - a / 0.88) * lumaClampAmt * 0.65;
        r *= 1 - boundaryWeight * 0.45;
        g *= 1 - boundaryWeight * 0.45;
        b *= 1 - boundaryWeight * 0.45;
      }

      rBuf[i] = r;
      gBuf[i] = g;
      bBuf[i] = b;
    }
  }

  // PASS 4: Fill Edge Colors from Inside (Inward Color Bleed)
  const bleedSteps = Math.round(settings.innerColorBleedRadius);
  if (bleedSteps > 0 && settings.keyingMode !== 'off') {
    const confidence = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      confidence[i] = rawAlpha[i] >= 0.91 && alphaBuf[i] >= 0.86 ? 1.0 : 0.0;
    }

    const nextR = new Float32Array(rBuf);
    const nextG = new Float32Array(gBuf);
    const nextB = new Float32Array(bBuf);
    const nextConf = new Float32Array(confidence);

    for (let step = 0; step < bleedSteps; step++) {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
          const i = rowOffset + x;
          if (alphaBuf[i] <= 0.004 || confidence[i] >= 0.99) continue;

          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let sumW = 0;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const ni = nRow + nx;
              const c = confidence[ni];
              if (c > 0.1) {
                const w = (dx === 0 || dy === 0 ? 1.0 : 0.707) * c;
                sumR += rBuf[ni] * w;
                sumG += gBuf[ni] * w;
                sumB += bBuf[ni] * w;
                sumW += w;
              }
            }
          }

          if (sumW > 0) {
            const bleedBlend = 0.88;
            nextR[i] = (sumR / sumW) * bleedBlend + rBuf[i] * (1 - bleedBlend);
            nextG[i] = (sumG / sumW) * bleedBlend + gBuf[i] * (1 - bleedBlend);
            nextB[i] = (sumB / sumW) * bleedBlend + bBuf[i] * (1 - bleedBlend);
            nextConf[i] = 0.95;
          }
        }
      }
      rBuf.set(nextR);
      gBuf.set(nextG);
      bBuf.set(nextB);
      confidence.set(nextConf);
    }
  }

  // PASS 5: High-Resolution Edge Preservation
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

  // PASS 7: Build Output Canvas, Diagnostic Halo Heatmap Canvas & Cleaned Bounding Box
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = width;
  processedCanvas.height = height;
  const outCtx = processedCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(width, height);
  const outData = outImg.data;

  const heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.width = width;
  heatmapCanvas.height = height;
  const heatCtx = heatmapCanvas.getContext('2d')!;
  const heatImg = heatCtx.createImageData(width, height);
  const heatData = heatImg.data;

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
        heatData[idx] = luma;
        heatData[idx + 1] = luma + 10;
        heatData[idx + 2] = luma + 22;
        heatData[idx + 3] = 190;
      }
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  heatCtx.putImageData(heatImg, 0, 0);

  const cropBox: BoundingBox = hasOpaque
    ? {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX + 1),
        height: Math.max(1, maxY - minY + 1),
      }
    : { x: 0, y: 0, width, height };

  const residualHaloScore =
    edgePixelCount > 0 ? Number(((haloPenaltySum / edgePixelCount) * 100).toFixed(1)) : 0;
  const crispnessIndex =
    edgePixelCount > 0 ? Number(((crispEdgeCount / edgePixelCount) * 100).toFixed(1)) : 100;
  const transparentRatio = Number(((transparentCount / pixelCount) * 100).toFixed(1));

  return {
    processedCanvas,
    heatmapCanvas,
    cropBox,
    coreBodyBox: hasOpaque ? coreBodyBox : cropBox,
    removedParticleBoxes,
    metrics: {
      edgePixelCount,
      residualHaloScore,
      crispnessIndex,
      transparentRatio,
      trappedHolesPunched,
      looseParticlesRemoved,
    },
  };
}

export function computePerfectLoopDetection(frames: ExtractedFrame[]): {
  similarities: number[];
  bestLoop: { startIdx: number; endIdx: number; similarity: number };
} {
  if (frames.length < 2) {
    return {
      similarities: frames.map(() => 100),
      bestLoop: { startIdx: 0, endIdx: 0, similarity: 100 },
    };
  }

  const thumbSize = 48;
  const thumbs = frames.map((f) => {
    const c = document.createElement('canvas');
    c.width = thumbSize;
    c.height = thumbSize;
    const ctx = c.getContext('2d')!;
    const target = f.processedCanvas || f.sourceCanvas;
    ctx.drawImage(target, 0, 0, thumbSize, thumbSize);
    return ctx.getImageData(0, 0, thumbSize, thumbSize).data;
  });

  const compareThumbs = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
    let sumSq = 0;
    const len = a.length;
    for (let i = 0; i < len; i += 4) {
      const dr = a[i] - b[i];
      const dg = a[i + 1] - b[i + 1];
      const db = a[i + 2] - b[i + 2];
      const da = a[i + 3] - b[i + 3];
      sumSq += dr * dr + dg * dg + db * db + da * da;
    }
    const rmse = Math.sqrt(sumSq / (len / 4) / 4);
    return Number(Math.max(0, Math.min(100, (1 - rmse / 140) * 100)).toFixed(1));
  };

  const similarities = thumbs.map((t, idx) => (idx === 0 ? 100 : compareThumbs(thumbs[0], t)));

  let bestStart = 0;
  let bestEnd = frames.length - 1;
  let bestScore = compareThumbs(thumbs[0], thumbs[frames.length - 1]);

  for (let s = 0; s < frames.length - 3; s++) {
    for (let e = s + 3; e < frames.length; e++) {
      const score = compareThumbs(thumbs[s], thumbs[e]);
      if (score > bestScore) {
        bestScore = score;
        bestStart = s;
        bestEnd = e;
      }
    }
  }

  return {
    similarities,
    bestLoop: {
      startIdx: bestStart,
      endIdx: bestEnd,
      similarity: bestScore,
    },
  };
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Normalizes and packs frames into the final Sprite Sheet with Anti-Shift Center Stabilization!
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

  // Compute global union bounding box across all active frames for `global_locked` mode
  let globalMinX = 99999;
  let globalMinY = 99999;
  let globalMaxX = 0;
  let globalMaxY = 0;

  let maxCropW = 16;
  let maxCropH = 16;

  // Also compute maximum left/right/top/bottom extents relative to each frame's Core Body Anchor
  let maxLeftFromCore = 8;
  let maxRightFromCore = 8;
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

    const coreCenterX = core.x + core.width / 2;
    const coreFeetY = core.y + core.height;

    const leftExt = Math.max(0, coreCenterX - box.x);
    const rightExt = Math.max(0, box.x + box.width - coreCenterX);
    const topExt = Math.max(0, coreFeetY - box.y);
    const botExt = Math.max(0, box.y + box.height - coreFeetY);

    if (leftExt > maxLeftFromCore) maxLeftFromCore = leftExt;
    if (rightExt > maxRightFromCore) maxRightFromCore = rightExt;
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
  const scale = settings.targetScale;

  let baseW = maxCropW;
  let baseH = maxCropH;

  if (settings.autoCrop && settings.centerStabilization === 'global_locked') {
    baseW = globalUnionBox.width;
    baseH = globalUnionBox.height;
  } else if (settings.autoCrop && settings.centerStabilization === 'core_grounded') {
    baseW = Math.ceil(Math.max(maxLeftFromCore, maxRightFromCore) * 2);
    baseH = Math.ceil(maxTopFromFeet + maxBottomFromFeet);
  }

  const normW = Math.max(8, Math.round((baseW + pad) * scale));
  const normH = Math.max(8, Math.round((baseH + pad) * scale));

  const normalizedFrames: { name: string; canvas: HTMLCanvasElement }[] = workingList.map(
    (f, i) => {
      const src = f.processedCanvas || f.sourceCanvas;

      // Determine active crop box depending on stabilization mode
      const box = !settings.autoCrop
        ? { x: 0, y: 0, width: src.width, height: src.height }
        : settings.centerStabilization === 'global_locked'
        ? globalUnionBox
        : f.cropBox;

      const core = f.coreBodyBox || box;

      const frameW = settings.normalizeDimensions
        ? normW
        : Math.max(8, Math.round((box.width + pad) * scale));
      const frameH = settings.normalizeDimensions
        ? normH
        : Math.max(8, Math.round((box.height + pad) * scale));

      const c = document.createElement('canvas');
      c.width = frameW;
      c.height = frameH;
      const ctx = c.getContext('2d')!;
      if (settings.edgeMode === 'pixel_art_hard') {
        ctx.imageSmoothingEnabled = false;
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }

      const drawW = Math.round(box.width * scale);
      const drawH = Math.round(box.height * scale);

      let destX = Math.round((frameW - drawW) / 2);
      let destY = Math.round((frameH - drawH) / 2);

      if (
        settings.autoCrop &&
        settings.normalizeDimensions &&
        settings.centerStabilization === 'core_grounded'
      ) {
        // Lock Core Body X to the exact horizontal center of the frame cell!
        const coreCenterXInCrop = (core.x + core.width / 2 - box.x) * scale;
        destX = Math.round(frameW / 2 - coreCenterXInCrop);

        if (settings.anchorAlignment === 'bottom_center') {
          // Lock Core Body Feet Y to the exact ground baseline of the frame cell!
          const coreFeetYInCrop = (core.y + core.height - box.y) * scale;
          const groundLineY =
            frameH - Math.round((settings.padding + maxBottomFromFeet) * scale);
          destY = Math.round(groundLineY - coreFeetYInCrop);
        } else {
          const coreCenterYInCrop = (core.y + core.height / 2 - box.y) * scale;
          destY = Math.round(frameH / 2 - coreCenterYInCrop);
        }
      } else if (settings.anchorAlignment === 'bottom_center') {
        destX = Math.round((frameW - drawW) / 2);
        destY = frameH - drawH - Math.round(settings.padding * scale);
      } else if (settings.anchorAlignment === 'preserve_original' && !settings.autoCrop) {
        destX = Math.round(settings.padding * scale);
        destY = Math.round(settings.padding * scale);
      }

      ctx.drawImage(src, box.x, box.y, box.width, box.height, destX, destY, drawW, drawH);

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
        exporter: 'SpriteSmithy Pro',
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
        exporter: 'SpriteSmithy Pro',
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
          app: 'SpriteSmithy Pro',
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
        app: 'SpriteSmithy Pro',
        fps,
      },
    },
    null,
    2
  );
}

/**
 * Instant (<50ms) video metadata & corner key-color reader for Stage 1 (Upload Video)
 * so the user gets immediate visual feedback without waiting for 96 frames to extract!
 */
export async function readVideoMetadataQuick(url: string): Promise<{
  videoDurationSec: number;
  videoWidth: number;
  videoHeight: number;
  detectedKeyColor: string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      const duration = Number(Math.max(0.1, video.duration || 4.0).toFixed(2));
      const w = video.videoWidth || 480;
      const h = video.videoHeight || 480;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 120;
      sampleCanvas.height = 120;
      const ctx = sampleCanvas.getContext('2d');
      let detectedKeyColor = '#FBFBFB';
      if (ctx) {
        ctx.drawImage(video, 0, 0, 120, 120);
        detectedKeyColor = autoDetectCornerKeyColor(sampleCanvas);
      }
      resolve({
        videoDurationSec: duration,
        videoWidth: w,
        videoHeight: h,
        detectedKeyColor,
      });
    };

    video.onerror = () => {
      reject(new Error(`Unable to read video metadata from ${url}`));
    };
  });
}

/**
 * Fast low-res (48x48) pose-similarity scan for Stage 2 (Loop Selection)
 * to automatically find the best seamless [startSec, endSec] loop window before full frame extraction.
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

        const compare = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
          let sumSq = 0;
          for (let i = 0; i < a.length; i += 4) {
            const dr = a[i] - b[i];
            const dg = a[i + 1] - b[i + 1];
            const db = a[i + 2] - b[i + 2];
            sumSq += dr * dr + dg * dg + db * db;
          }
          const rmse = Math.sqrt(sumSq / (a.length / 4) / 3);
          return Number(Math.max(0, Math.min(100, (1 - rmse / 120) * 100)).toFixed(1));
        };

        let bestStart = 0;
        let bestEnd = Number(Math.min(duration, 1.5).toFixed(2));
        let bestScore = -1;

        // Require a loop duration between 0.55s and 2.6s for a natural game animation cycle
        for (let s = 0; s < thumbs.length - 3; s++) {
          for (let e = s + 3; e < thumbs.length; e++) {
            const span = thumbs[e].timeSec - thumbs[s].timeSec;
            if (span < 0.55 || span > 2.8) continue;
            const score = compare(thumbs[s].data, thumbs[e].data);
            if (score > bestScore) {
              bestScore = score;
              bestStart = thumbs[s].timeSec;
              bestEnd = thumbs[e].timeSec;
            }
          }
        }

        resolve({
          startSec: bestStart,
          endSec: bestEnd,
          similarity: bestScore > 0 ? bestScore : 92.5,
        });
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => reject(new Error('Failed to scan video for loop detection'));
  });
}

/**
 * Extracts frames from a specific [startSec, endSec] time window of a video URL at the exact requested FPS.
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

        const maxDim = 480;
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

          frames.push({
            id: `${labelPrefix}-frame-${i}-${Math.round(time * 100)}`,
            index: i,
            label: `F_${String(i + 1).padStart(2, '0')} (${time.toFixed(2)}s)`,
            timestampSec: Number(time.toFixed(2)),
            enabled: true,
            sourceCanvas: canvas,
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

        const detectedKeyColor =
          frames.length > 0 ? autoDetectCornerKeyColor(frames[0].sourceCanvas) : '#FBFBFB';
        resolve({
          frames,
          detectedKeyColor,
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

export async function extractFramesFromVideoFile(
  file: File,
  fps: number = 24,
  startSec: number = 0,
  endSec?: number,
  maxFrames: number = 120,
  onProgress?: (current: number, total: number) => void
): Promise<{
  frames: ExtractedFrame[];
  detectedKeyColor: string;
  videoDurationSec: number;
  actualStartSec: number;
  actualEndSec: number;
  objectUrl: string;
}> {
  const objectUrl = URL.createObjectURL(file);
  const res = await extractFramesFromVideoUrl(
    objectUrl,
    file.name,
    fps,
    startSec,
    endSec,
    maxFrames,
    onProgress
  );
  return { ...res, objectUrl };
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
): Promise<{ frames: ExtractedFrame[]; detectedKeyColor: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxDim = 960;
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

      const detectedKeyColor = autoDetectCornerKeyColor(canvas);
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
          },
        ],
        detectedKeyColor,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to load image file: ${file.name}`));
    };
    img.src = url;
  });
}
