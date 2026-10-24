import {
  AutoCalibratedBgProfile,
  BatchAssetItem,
  ExtractedFrame,
  ProcessingSettings,
} from '../types/sprite';
import {
  buildNormalizedSpriteSheetAndMetadata,
  computeAutoCalibratedBgProfile,
  computePerfectLoopDetection,
  materializeProcessedFrameCanvases,
  processSpriteFrameBuffer,
} from './imageProcessor';
import type { SpriteWorkerRequest, SpriteWorkerResponse } from './spriteWorker';

interface QueuedTask {
  taskId: number;
  priority: boolean;
  request: SpriteWorkerRequest;
  resolve: (res: SpriteWorkerResponse) => void;
  reject: (err: Error) => void;
  isCancelled: () => boolean;
}

class SpriteWorkerPool {
  private workers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private queue: QueuedTask[] = [];
  private activeTasks: Map<
    number,
    {
      worker: Worker;
      resolve: (res: SpriteWorkerResponse) => void;
      reject: (err: Error) => void;
    }
  > = new Map();
  private nextTaskId = 1;
  private workerSupported = true;

  constructor() {
    this.initPool();
  }

  private initPool() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.workerSupported = false;
      return;
    }

    const poolSize = Math.min(
      4,
      Math.max(2, (navigator.hardwareConcurrency || 4) - 1)
    );

    try {
      for (let i = 0; i < poolSize; i++) {
        const w = new Worker(new URL('./spriteWorker.ts', import.meta.url), {
          type: 'module',
        });
        w.onmessage = (e: MessageEvent<SpriteWorkerResponse>) => {
          this.handleWorkerMessage(w, e.data);
        };
        w.onerror = (err) => {
          this.handleWorkerError(w, new Error(err.message || 'Worker error'));
        };
        this.workers.push(w);
      }
    } catch {
      this.workerSupported = false;
    }
  }

  private handleWorkerMessage(worker: Worker, data: SpriteWorkerResponse) {
    this.busyWorkers.delete(worker);
    const entry = this.activeTasks.get(data.taskId);
    if (entry) {
      this.activeTasks.delete(data.taskId);
      if (data.error) {
        entry.reject(new Error(data.error));
      } else {
        entry.resolve(data);
      }
    }
    this.pumpQueue();
  }

  private handleWorkerError(worker: Worker, err: Error) {
    this.busyWorkers.delete(worker);
    for (const [taskId, entry] of this.activeTasks.entries()) {
      if (entry.worker === worker) {
        this.activeTasks.delete(taskId);
        entry.reject(err);
      }
    }
    this.pumpQueue();
  }

  private pumpQueue() {
    while (this.queue.length > 0) {
      const idleWorker = this.workers.find((w) => !this.busyWorkers.has(w));
      if (!idleWorker) break;

      const nextTask = this.queue.shift()!;
      if (nextTask.isCancelled()) {
        nextTask.reject(new Error('CANCELLED'));
        continue;
      }

      this.busyWorkers.add(idleWorker);
      this.activeTasks.set(nextTask.taskId, {
        worker: idleWorker,
        resolve: nextTask.resolve,
        reject: nextTask.reject,
      });
      idleWorker.postMessage(nextTask.request);
    }
  }

  public executeFrame(
    srcData: Uint8ClampedArray,
    width: number,
    height: number,
    settings: ProcessingSettings,
    frameIndex: number,
    precomputedBgProfile: AutoCalibratedBgProfile | undefined,
    priority: boolean,
    isCancelled: () => boolean
  ): Promise<SpriteWorkerResponse> {
    if (!this.workerSupported || this.workers.length === 0) {
      return new Promise((resolve, reject) => {
        window.setTimeout(() => {
          if (isCancelled()) {
            reject(new Error('CANCELLED'));
            return;
          }
          try {
            const res = processSpriteFrameBuffer(
              srcData,
              width,
              height,
              settings,
              frameIndex,
              precomputedBgProfile
            );
            resolve({
              taskId: 0,
              outBuffer: res.outData.buffer as ArrayBuffer,
              heatBuffer: res.heatData.buffer as ArrayBuffer,
              width: res.width,
              height: res.height,
              cropBox: res.cropBox,
              coreBodyBox: res.coreBodyBox,
              centerOfMassX: res.centerOfMassX,
              lowestFootY: res.lowestFootY,
              removedParticleBoxes: res.removedParticleBoxes,
              trappedPocketBoxes: res.trappedPocketBoxes,
              bgProfile: res.bgProfile,
              metrics: res.metrics,
            });
          } catch (e: any) {
            reject(e);
          }
        }, 0);
      });
    }

    const taskId = this.nextTaskId++;
    return new Promise<SpriteWorkerResponse>((resolve, reject) => {
      const task: QueuedTask = {
        taskId,
        priority,
        request: {
          taskId,
          srcData,
          width,
          height,
          settings,
          frameIndex,
          precomputedBgProfile,
        },
        resolve,
        reject,
        isCancelled,
      };

      if (priority) {
        this.queue.unshift(task);
      } else {
        this.queue.push(task);
      }
      this.pumpQueue();
    });
  }
}

export const globalSpriteWorkerPool = new SpriteWorkerPool();

function ensureFrameSourceRgba(frame: ExtractedFrame): Uint8ClampedArray {
  if (frame.sourceRgba) return frame.sourceRgba;
  const { width, height } = frame.sourceCanvas;
  const ctx = frame.sourceCanvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, width, height).data;
  frame.sourceRgba = data;
  return data;
}

export interface AsyncPipelineCallbacks {
  priorityFrameIndex?: number;
  isCancelled?: () => boolean;
  onPriorityFrameReady?: (updatedFrame: ExtractedFrame, frameIdx: number) => void;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Non-blocking Multi-Worker Sprite Pipeline:
 * 1. Processes the user's currently viewed frame (`priorityFrameIndex`) FIRST in a background Web Worker
 *    so the viewport updates in ~25ms when dragging sliders.
 * 2. Processes all remaining frames in parallel across CPU cores via Web Workers without freezing the UI.
 * 3. Supports instant cancellation if settings change mid-run.
 */
export async function runPipelineOnAssetInWorkers(
  asset: BatchAssetItem,
  currentSettings: ProcessingSettings,
  bypassHalo: boolean,
  autoApplySeamlessLoop: boolean = false,
  callbacks: AsyncPipelineCallbacks = {}
): Promise<BatchAssetItem | null> {
  if (asset.frames.length === 0) return asset;

  const isCancelled = callbacks.isCancelled || (() => false);
  const t0 = performance.now();

  const effectiveSettings: ProcessingSettings = bypassHalo
    ? {
        ...currentSettings,
        autonomousV2Mode: false,
        keyingMode: 'chroma_perceptual',
        autoPunchTrappedHoles: false,
        cleanLooseParticles: false,
        colorUnmixStrength: 0,
        deSpillStrength: 0,
        innerColorBleedRadius: 0,
        alphaChoke: 0,
        haloLuminanceClamp: 0,
        edgeContrast: 0,
        edgeSharpness: 0,
      }
    : currentSettings;

  // Ensure shared background profile is available
  const sharedBgProfile =
    asset.bgProfile ||
    computeAutoCalibratedBgProfile(
      asset.frames[0].sourceCanvas,
      effectiveSettings.removeCornerWatermark
    );

  const total = asset.frames.length;
  const updatedFrames: ExtractedFrame[] = [...asset.frames];
  let completedCount = 0;

  const processSingleFrameIdx = async (
    frameIdx: number,
    isPriority: boolean
  ): Promise<ExtractedFrame | null> => {
    if (isCancelled()) return null;
    const frame = asset.frames[frameIdx];
    const srcRgba = ensureFrameSourceRgba(frame);

    try {
      const res = await globalSpriteWorkerPool.executeFrame(
        srcRgba,
        frame.sourceCanvas.width,
        frame.sourceCanvas.height,
        effectiveSettings,
        frameIdx,
        sharedBgProfile,
        isPriority,
        isCancelled
      );
      if (isCancelled()) return null;

      const outData = new Uint8ClampedArray(res.outBuffer);
      const heatData = new Uint8ClampedArray(res.heatBuffer);
      const { processedCanvas, heatmapCanvas } = materializeProcessedFrameCanvases(
        outData,
        heatData,
        res.width,
        res.height,
        frame.processedCanvas,
        frame.heatmapCanvas
      );

      const nextFrame: ExtractedFrame = {
        ...frame,
        sourceRgba: srcRgba,
        processedCanvas,
        heatmapCanvas,
        cropBox: res.cropBox,
        coreBodyBox: res.coreBodyBox,
        centerOfMassX: res.centerOfMassX,
        lowestFootY: res.lowestFootY,
        removedParticleBoxes: res.removedParticleBoxes,
        trappedPocketBoxes: res.trappedPocketBoxes,
        bgProfile: res.bgProfile,
        processedWidth: res.cropBox.width,
        processedHeight: res.cropBox.height,
        haloMetrics: res.metrics,
      };

      updatedFrames[frameIdx] = nextFrame;
      completedCount++;
      if (callbacks.onProgress) {
        callbacks.onProgress(completedCount, total);
      }
      return nextFrame;
    } catch (err: any) {
      if (err?.message === 'CANCELLED') return null;
      throw err;
    }
  };

  // STEP 1: Process priority active frame first for instant 60fps UI responsiveness
  const priorityIdx = Math.max(
    0,
    Math.min(callbacks.priorityFrameIndex ?? 0, total - 1)
  );
  const firstFrameResult = await processSingleFrameIdx(priorityIdx, true);
  if (isCancelled() || !firstFrameResult) return null;

  if (callbacks.onPriorityFrameReady) {
    callbacks.onPriorityFrameReady(firstFrameResult, priorityIdx);
  }

  // STEP 2: Process remaining frames in parallel across the Web Worker pool
  const remainingIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i !== priorityIdx) remainingIndices.push(i);
  }

  if (remainingIndices.length > 0) {
    await Promise.all(
      remainingIndices.map((idx) => processSingleFrameIdx(idx, false))
    );
  }

  if (isCancelled()) return null;

  // Yield one microtask before building normalized sheet & loop metrics
  await new Promise((r) => window.setTimeout(r, 0));
  if (isCancelled()) return null;

  const loopResult = computePerfectLoopDetection(updatedFrames);
  const framesWithLoop = updatedFrames.map((f, idx) => ({
    ...f,
    loopSimilarityScore: loopResult.similarities[idx],
    silhouetteIoUScore: loopResult.silhouetteIoUs[idx],
    velocityDiffScore: loopResult.velocityDiffs[idx],
  }));

  const targetStart = autoApplySeamlessLoop
    ? loopResult.bestLoop.startIdx
    : asset.loopStartFrame;
  const targetEnd = autoApplySeamlessLoop
    ? loopResult.bestLoop.endIdx
    : asset.loopEndFrame;

  const safeStart = Math.max(
    0,
    Math.min(targetStart, Math.max(0, framesWithLoop.length - 1))
  );
  const safeEnd = Math.max(
    safeStart,
    Math.min(targetEnd, Math.max(0, framesWithLoop.length - 1))
  );

  const {
    sheetCanvas,
    normalizedFrames,
    metadataJson,
    frameWidth,
    frameHeight,
  } = buildNormalizedSpriteSheetAndMetadata(
    asset.name,
    framesWithLoop,
    effectiveSettings,
    safeStart,
    safeEnd
  );

  return {
    ...asset,
    status: 'completed',
    progress: 100,
    frames: framesWithLoop,
    bgProfile: framesWithLoop[0]?.bgProfile || sharedBgProfile,
    loopStartFrame: safeStart,
    loopEndFrame: safeEnd,
    outputSheetCanvas: sheetCanvas,
    outputNormalizedFrames: normalizedFrames,
    outputCellWidth: frameWidth,
    outputCellHeight: frameHeight,
    outputMetadataJson: metadataJson,
    bestLoopCandidate: loopResult.bestLoop,
    processingTimeMs: Math.round(performance.now() - t0),
  };
}
