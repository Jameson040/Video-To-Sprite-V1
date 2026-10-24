/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BatchQueuePanel } from './components/BatchQueuePanel';
import { CanvasViewport } from './components/CanvasViewport';
import {
  LeftStepRail,
  RightFramesPanel,
  StageControlDeck,
} from './components/HaloControlSidebar';
import {
  ArsenalVideoPreset,
  BatchAssetItem,
  CanvasClickTool,
  ExtractedFrame,
  ProcessingSettings,
  WizardStep,
} from './types/sprite';
import { DEFAULT_SETTINGS } from './utils/demoAssets';
import {
  exportSpriteBundle,
  LocalFileResult,
  mountLocalAssetDirectory,
  pickLocalAssetFiles,
  saveSinglePngWithFSAPI,
} from './utils/fileSystemAccess';
import {
  autoDetectSeamlessLoopTimeWindow,
  buildNormalizedSpriteSheetAndMetadata,
  extractFramesFromImageFile,
  extractFramesFromVideoUrl,
  readVideoMetadataQuick,
} from './utils/imageProcessor';
import { runPipelineOnAssetInWorkers } from './utils/workerPool';

type ActiveNavView = 'single_wizard' | 'batch';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveNavView>('single_wizard');
  // Start on Step 1 with a completely clean Upload Window — zero background compute on startup!
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [bypassHaloTweaks, setBypassHaloTweaks] = useState<boolean>(false);
  const [clickTool, setClickTool] = useState<CanvasClickTool>('pan');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const [assets, setAssets] = useState<BatchAssetItem[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string>('');
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);

  // Stage 2 Loop Window & Stage 3 Frame Extraction State
  const [winStartSec, setWinStartSec] = useState<number>(0);
  const [winEndSec, setWinEndSec] = useState<number>(1.5);
  const [winFps, setWinFps] = useState<number>(24);
  const [isScanningLoop, setIsScanningLoop] = useState<boolean>(false);
  const [loopScanProgress, setLoopScanProgress] = useState<number>(0);
  const [detectedVideoLoopScore, setDetectedVideoLoopScore] = useState<number | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [workerProgress, setWorkerProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const workerJobIdRef = useRef<number>(0);
  const skipNextWorkerEffectRef = useRef<boolean>(false);

  // Browser File System Access API state for Batch Mode
  const [mountedDirectoryHandle, setMountedDirectoryHandle] =
    useState<FileSystemDirectoryHandle | undefined>(undefined);
  const [mountedFolderName, setMountedFolderName] = useState<string | null>(null);
  const [usingNativeFS, setUsingNativeFS] = useState<boolean>(false);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  /**
   * Fast <8ms Sprite Sheet & Normalized Frame Rebuilder when only loop range, frame toggle, or sheet layout changes
   * (no need to re-run pixel keying when frames are already processed).
   */
  const rebuildSheetOnly = useCallback(
    (
      asset: BatchAssetItem,
      currentSettings: ProcessingSettings,
      startIdx?: number,
      endIdx?: number
    ): BatchAssetItem => {
      if (asset.frames.length === 0) return asset;
      const safeStart = Math.max(
        0,
        Math.min(
          startIdx ?? asset.loopStartFrame,
          Math.max(0, asset.frames.length - 1)
        )
      );
      const safeEnd = Math.max(
        safeStart,
        Math.min(
          endIdx ?? asset.loopEndFrame,
          Math.max(0, asset.frames.length - 1)
        )
      );

      const {
        sheetCanvas,
        normalizedFrames,
        metadataJson,
        frameWidth,
        frameHeight,
      } = buildNormalizedSpriteSheetAndMetadata(
        asset.name,
        asset.frames,
        currentSettings,
        safeStart,
        safeEnd
      );

      return {
        ...asset,
        loopStartFrame: safeStart,
        loopEndFrame: safeEnd,
        outputSheetCanvas: sheetCanvas,
        outputNormalizedFrames: normalizedFrames,
        outputCellWidth: frameWidth,
        outputCellHeight: frameHeight,
        outputMetadataJson: metadataJson,
      };
    },
    []
  );

  const activeAsset = assets.find((a) => a.id === activeAssetId) || assets[0] || null;
  const activeAssetRef = useRef<BatchAssetItem | null>(null);
  activeAssetRef.current = activeAsset;
  const activeFrameIndexRef = useRef<number>(0);
  activeFrameIndexRef.current = activeFrameIndex;

  // Non-blocking Web Worker re-processing when settings or bypassHaloTweaks change:
  // 1. Processes the currently viewed frame FIRST (~25ms) so the canvas updates immediately.
  // 2. Processes remaining frames in parallel in the background Web Worker Pool.
  // 3. Immediately cancels stale runs if the user drags a slider again!
  useEffect(() => {
    if (skipNextWorkerEffectRef.current) {
      skipNextWorkerEffectRef.current = false;
      return;
    }
    const currentAsset = activeAssetRef.current;
    if (!currentAsset || currentAsset.frames.length === 0) return;

    const jobToken = ++workerJobIdRef.current;
    const targetAssetId = currentAsset.id;
    const priorityIdx = activeFrameIndexRef.current;

    setWorkerProgress({ completed: 0, total: currentAsset.frames.length });

    runPipelineOnAssetInWorkers(
      currentAsset,
      settings,
      bypassHaloTweaks,
      false,
      {
        priorityFrameIndex: priorityIdx,
        isCancelled: () => jobToken !== workerJobIdRef.current,
        onPriorityFrameReady: (updatedFrame, frameIdx) => {
          if (jobToken !== workerJobIdRef.current) return;
          // Immediately paint the active frame so slider feedback is instant (<30ms)
          setAssets((prev) =>
            prev.map((item) => {
              if (item.id !== targetAssetId) return item;
              const nextFrames = [...item.frames];
              nextFrames[frameIdx] = updatedFrame;
              return { ...item, frames: nextFrames };
            })
          );
        },
        onProgress: (completed, total) => {
          if (jobToken !== workerJobIdRef.current) return;
          setWorkerProgress({ completed, total });
        },
      }
    )
      .then((finishedItem) => {
        if (jobToken !== workerJobIdRef.current || !finishedItem) return;
        setAssets((prev) =>
          prev.map((item) => (item.id === targetAssetId ? finishedItem : item))
        );
        setWorkerProgress(null);
      })
      .catch(() => {
        if (jobToken === workerJobIdRef.current) {
          setWorkerProgress(null);
        }
      });
  }, [settings, bypassHaloTweaks, activeAssetId]);

  const updateSettings = useCallback((partial: Partial<ProcessingSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleAddHoleSeed = (
    relX: number,
    relY: number,
    mode: 'punch_hole' | 'protect_spot' | 'erase_particle',
    sampledHex?: string
  ) => {
    const newSeed = {
      id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      relX,
      relY,
      mode,
      enabled: true,
      sampledHex: sampledHex || settings.keyColor,
      extraColors: [],
      useGlobalPocketPalette: true,
      localTolerance: settings.localPunchTolerance ?? 24,
      maxRadiusPct: settings.localPunchRadius ?? 30,
      frameScope: 'all_frames' as const,
      targetFrameIndex: activeFrameIndex,
    };
    setSettings((prev) => ({
      ...prev,
      protectInteriorColors:
        mode !== 'erase_particle' ? true : prev.protectInteriorColors,
      holeSeeds: [...prev.holeSeeds, newSeed],
    }));
    const layerCount =
      settings.holeSeeds.filter((s) => s.mode === 'punch_hole' || s.mode === 'protect_spot')
        .length + 1;
    showToast(
      mode === 'punch_hole'
        ? `Added Pocket Layer #${layerCount} (${sampledHex || settings.keyColor}) — Edit colors & options in Pocket Layers!`
        : mode === 'protect_spot'
        ? `Added Protect Layer #${layerCount} (${sampledHex || 'solid'}) across frames!`
        : 'Zapped loose floating speck across frames!'
    );
  };

  /**
   * Stage 2: Auto-Detect Seamless Loop on the video timeline before frame extraction.
   */
  const handleAutoDetectVideoLoop = async () => {
    if (!activeAsset?.sourceUrl) return;
    setIsScanningLoop(true);
    setLoopScanProgress(0);
    try {
      const best = await autoDetectSeamlessLoopTimeWindow(
        activeAsset.sourceUrl,
        (pct) => setLoopScanProgress(pct)
      );
      setWinStartSec(best.startSec);
      setWinEndSec(best.endSec);
      setDetectedVideoLoopScore(best.similarity);
      showToast(
        `Auto-Detected Seamless Loop: ${best.startSec.toFixed(2)}s → ${best.endSec.toFixed(
          2
        )}s (${best.similarity}% Pose Match)`
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not auto-detect loop window');
    } finally {
      setIsScanningLoop(false);
    }
  };

  /**
   * On-Demand Frame Extraction for Step-by-Step mode with live progress feedback.
   */
  const handleExtractFramesNow = useCallback(
    async (advanceToStage3After: boolean = false) => {
      if (!activeAsset?.sourceUrl) return;
      setIsExtractingFrames(true);
      setExtractionProgress({ current: 0, total: 1 });

      try {
        const {
          frames,
          detectedKeyColor,
          bgProfile,
          videoDurationSec,
          actualStartSec,
          actualEndSec,
        } = await extractFramesFromVideoUrl(
          activeAsset.sourceUrl,
          activeAsset.id,
          winFps,
          winStartSec,
          winEndSec,
          120,
          (current, total) => setExtractionProgress({ current, total })
        );

        const keyHex = activeAsset.detectedKeyColor || detectedKeyColor;
        const [r, g, b] = [
          parseInt(keyHex.slice(1, 3), 16) || 0,
          parseInt(keyHex.slice(3, 5), 16) || 0,
          parseInt(keyHex.slice(5, 7), 16) || 0,
        ];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);

        const nextSettings: ProcessingSettings = {
          ...settings,
          videoFps: winFps,
          keyColor: keyHex,
          chromaWeight: sat < 30 ? 35 : 80,
        };
        skipNextWorkerEffectRef.current = true;
        setSettings(nextSettings);
        setActiveFrameIndex(0);

        const jobToken = ++workerJobIdRef.current;
        const baseItem: BatchAssetItem = {
          ...activeAsset,
          videoDurationSec,
          extractStartSec: actualStartSec,
          extractEndSec: actualEndSec,
          extractedAtFps: winFps,
          frames,
          detectedKeyColor: keyHex,
          bgProfile,
          loopStartFrame: 0,
          loopEndFrame: Math.max(0, frames.length - 1),
        };

        setWorkerProgress({ completed: 0, total: frames.length });
        const finishedItem = await runPipelineOnAssetInWorkers(
          baseItem,
          nextSettings,
          bypassHaloTweaks,
          Boolean(nextSettings.autoTrimToLoop),
          {
            priorityFrameIndex: 0,
            isCancelled: () => jobToken !== workerJobIdRef.current,
            onProgress: (completed, total) => {
              setExtractionProgress({ current: completed, total });
              setWorkerProgress({ completed, total });
            },
          }
        );

        if (finishedItem) {
          setAssets((prev) =>
            prev.map((item) => (item.id === finishedItem.id ? finishedItem : item))
          );
        }

        showToast(
          `Extracted & processed ${frames.length} frames in Background Workers (${actualStartSec.toFixed(
            2
          )}s–${actualEndSec.toFixed(2)}s @ ${winFps} FPS)!`
        );
        if (advanceToStage3After) {
          setCurrentStep(3);
        }
      } catch (err: any) {
        showToast(err?.message || 'Failed to extract frames');
      } finally {
        setIsExtractingFrames(false);
        setExtractionProgress(null);
        setWorkerProgress(null);
      }
    },
    [activeAsset, winFps, winStartSec, winEndSec, settings, bypassHaloTweaks, showToast]
  );

  // If user jumps directly to Stage 3+ before extracting frames, automatically trigger extraction so they aren't stuck
  const handleStepChange = (targetStep: WizardStep) => {
    if (targetStep > 1 && !activeAsset) {
      showToast('Please upload a video or pick an Arsenal test video first!');
      return;
    }
    setCurrentStep(targetStep);
    if (targetStep === 6) {
      setIsPlaying(true);
    }
    if (
      targetStep >= 3 &&
      activeAsset &&
      activeAsset.frames.length === 0 &&
      !isExtractingFrames
    ) {
      handleExtractFramesNow(false);
    }
  };

  /**
   * V2 Autonomous Zero-Touch Runner (Background Web Worker Pool):
   * Automatically extracts native frames, runs 3-Cluster K-Means BG profiling, Sobel Trapped Space Punch,
   * 3px Boundary Linear Color Unmixing, and Silhouette-IoU + Velocity Auto-Loop + Foot Locking off the main thread!
   */
  const runZeroTouchV2ForVideo = useCallback(
    async (
      item: BatchAssetItem,
      targetSettings: ProcessingSettings,
      startSec: number,
      endSec: number,
      fps: number
    ) => {
      if (!item.sourceUrl) return;
      setIsExtractingFrames(true);
      setExtractionProgress({ current: 0, total: 1 });
      setCurrentStep(3);

      try {
        const {
          frames,
          detectedKeyColor,
          bgProfile,
          videoDurationSec,
          actualStartSec,
          actualEndSec,
        } = await extractFramesFromVideoUrl(
          item.sourceUrl,
          item.id,
          fps,
          startSec,
          endSec,
          120,
          (current, total) => setExtractionProgress({ current, total })
        );

        const keyHex = detectedKeyColor || item.detectedKeyColor || '#FBFBFB';
        const calibratedSettings: ProcessingSettings = {
          ...targetSettings,
          autonomousV2Mode: true,
          keyingMode: 'v2_auto_kmeans',
          keyColor: keyHex,
          videoFps: fps,
        };
        skipNextWorkerEffectRef.current = true;
        setSettings(calibratedSettings);

        const populatedItem: BatchAssetItem = {
          ...item,
          videoDurationSec,
          extractStartSec: actualStartSec,
          extractEndSec: actualEndSec,
          extractedAtFps: fps,
          frames,
          detectedKeyColor: keyHex,
          bgProfile,
          loopStartFrame: 0,
          loopEndFrame: Math.max(0, frames.length - 1),
        };

        const jobToken = ++workerJobIdRef.current;
        setWorkerProgress({ completed: 0, total: frames.length });

        const finishedItem = await runPipelineOnAssetInWorkers(
          populatedItem,
          calibratedSettings,
          false,
          Boolean(calibratedSettings.autoTrimToLoop),
          {
            priorityFrameIndex: 0,
            isCancelled: () => jobToken !== workerJobIdRef.current,
            onProgress: (completed, total) => {
              setExtractionProgress({ current: completed, total });
              setWorkerProgress({ completed, total });
            },
          }
        );

        if (finishedItem) {
          setAssets((prev) =>
            prev.map((a) => (a.id === finishedItem.id ? finishedItem : a))
          );
          setActiveFrameIndex(finishedItem.loopStartFrame);
          setIsPlaying(true);
          setCurrentStep(6);

          const activeCount =
            finishedItem.loopEndFrame - finishedItem.loopStartFrame + 1;
          showToast(
            `V2 Worker Pipeline Complete: ${activeCount} frames (${actualStartSec.toFixed(
              2
            )}s–${actualEndSec.toFixed(2)}s @ ${fps} FPS) — Playing Live Sprite Preview!`
          );
        }
      } catch (err: any) {
        showToast(err?.message || 'V2 Autonomous Pipeline failed');
      } finally {
        setIsExtractingFrames(false);
        setExtractionProgress(null);
        setWorkerProgress(null);
      }
    },
    [showToast]
  );

  /**
   * Load Arsenal Video — in V2 Autonomous Mode, automatically runs all 4 stages to a finished sprite sheet!
   */
  const handleSelectArsenalVideo = async (preset: ArsenalVideoPreset) => {
    try {
      const meta = await readVideoMetadataQuick(preset.url);
      const startSec = preset.defaultStartSec ?? 0;
      const endSec = preset.defaultEndSec ?? Math.min(meta.videoDurationSec, 1.6);
      const fps = preset.defaultFps || 24;

      const nextSettings: ProcessingSettings = {
        ...DEFAULT_SETTINGS,
        ...preset.recommendedSettings,
        autonomousV2Mode: settings.autonomousV2Mode,
        keyingMode: settings.autonomousV2Mode
          ? 'v2_auto_kmeans'
          : preset.recommendedSettings.keyingMode || 'chroma_perceptual',
        keyColor: meta.detectedKeyColor || preset.recommendedSettings.keyColor || '#FBFBFB',
        holeSeeds: [],
      };
      setSettings(nextSettings);
      setWinStartSec(startSec);
      setWinEndSec(endSec);
      setWinFps(fps);
      setDetectedVideoLoopScore(null);

      const newItem: BatchAssetItem = {
        id: preset.id,
        name: `${preset.title.replace(/[^a-zA-Z0-9]+/g, '_')}.mp4`,
        type: 'video',
        sourceUrl: preset.url,
        fileSize: 1840000,
        status: 'ready',
        progress: 100,
        videoDurationSec: meta.videoDurationSec,
        extractStartSec: startSec,
        extractEndSec: endSec,
        extractedAtFps: fps,
        frames: [],
        detectedKeyColor: nextSettings.keyColor,
        bgProfile: meta.bgProfile,
        loopStartFrame: 0,
        loopEndFrame: 0,
      };

      setAssets((prev) => [
        newItem,
        ...prev.filter((item) => item.id !== newItem.id),
      ]);
      setActiveAssetId(newItem.id);
      setActiveFrameIndex(0);
      setCurrentStep(2);
      showToast(
        `Loaded ${preset.title} (${meta.videoDurationSec}s) — Review Initial Parameters & click Generate Sprite Sheet!`
      );
    } catch (err: any) {
      showToast(err?.message || 'Failed to load video');
    }
  };

  const handleSelectAssetById = (id: string) => {
    const target = assets.find((a) => a.id === id);
    if (!target) return;
    setActiveAssetId(id);
    setActiveFrameIndex(0);
    setWinStartSec(target.extractStartSec ?? 0);
    setWinEndSec(target.extractEndSec ?? (target.videoDurationSec || 4.0));
    setWinFps(target.extractedAtFps ?? 24);
  };

  const handleRemoveAsset = (id: string) => {
    setAssets((prev) => {
      const filtered = prev.filter((a) => a.id !== id);
      if (id === activeAssetId) {
        setActiveAssetId(filtered[0]?.id || '');
        setActiveFrameIndex(0);
        if (filtered.length === 0) setCurrentStep(1);
      }
      return filtered;
    });
  };

  const handleToggleFrameEnabled = (frameIndex: number) => {
    if (!activeAsset) return;
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== activeAsset.id) return item;
        const nextFrames = item.frames.map((f, idx) =>
          idx === frameIndex ? { ...f, enabled: !f.enabled } : f
        );
        return rebuildSheetOnly({ ...item, frames: nextFrames }, settings);
      })
    );
  };

  const handleUpdateLoopRange = (start: number, end: number) => {
    if (!activeAsset) return;
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== activeAsset.id) return item;
        return rebuildSheetOnly(item, settings, start, end);
      })
    );
  };

  const handleApplyBestLoop = () => {
    if (!activeAsset?.bestLoopCandidate) return;
    const { startIdx, endIdx, similarity } = activeAsset.bestLoopCandidate;
    handleUpdateLoopRange(startIdx, endIdx);
    showToast(
      `Snapped to seamless frame loop: Frame #${startIdx + 1} → #${endIdx + 1} (${similarity}% match)`
    );
  };

  /**
   * Instant (<50ms) upload ingestion for local video files — advances immediately to Stage 2 (Loop Selection)
   * with zero 3-4s freeze!
   */
  const ingestLocalFiles = async (localResults: LocalFileResult[]) => {
    if (localResults.length === 0) return;

    const importedItems: BatchAssetItem[] = [];
    for (const { file, handle } of localResults) {
      const isVideo =
        file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);

      try {
        if (isVideo) {
          const objectUrl = URL.createObjectURL(file);
          const meta = await readVideoMetadataQuick(objectUrl);
          // Default to the FULL video duration so action animations (e.g. 0s-4s Minotaur punch) are never truncated!
          const defaultEnd = Number(meta.videoDurationSec.toFixed(2));
          const defaultFps = settings.videoFps || 12;

          const item: BatchAssetItem = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            type: 'video',
            sourceUrl: objectUrl,
            fileSize: file.size,
            status: 'ready',
            progress: 100,
            file,
            fileHandle: handle,
            videoDurationSec: meta.videoDurationSec,
            extractStartSec: 0,
            extractEndSec: defaultEnd,
            extractedAtFps: defaultFps,
            frames: [],
            detectedKeyColor: meta.detectedKeyColor,
            bgProfile: meta.bgProfile,
            loopStartFrame: 0,
            loopEndFrame: 0,
          };
          importedItems.push(item);
        } else {
          const { frames, detectedKeyColor, bgProfile } =
            await extractFramesFromImageFile(file);
          const item: BatchAssetItem = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            type: 'image_sheet',
            fileSize: file.size,
            status: 'ready',
            progress: 100,
            file,
            fileHandle: handle,
            extractStartSec: 0,
            extractEndSec: 1,
            extractedAtFps: 24,
            frames,
            detectedKeyColor,
            bgProfile,
            loopStartFrame: 0,
            loopEndFrame: Math.max(0, frames.length - 1),
          };
          const processedItem = await runPipelineOnAssetInWorkers(
            item,
            { ...settings, keyColor: detectedKeyColor, holeSeeds: [] },
            bypassHaloTweaks,
            true
          );
          if (processedItem) importedItems.push(processedItem);
        }
      } catch (err: any) {
        showToast(err?.message || `Failed to load ${file.name}`);
      }
    }

    if (importedItems.length > 0) {
      const first = importedItems[0];
      setAssets((prev) => [...importedItems, ...prev]);
      setActiveAssetId(first.id);
      setActiveFrameIndex(0);
      setWinStartSec(first.extractStartSec);
      setWinEndSec(first.extractEndSec);
      setWinFps(first.extractedAtFps);
      setDetectedVideoLoopScore(null);

      const nextSettings: ProcessingSettings = {
        ...settings,
        keyColor: first.detectedKeyColor || settings.keyColor,
        holeSeeds: [],
      };
      skipNextWorkerEffectRef.current = true;
      setSettings(nextSettings);

      if (first.type === 'video') {
        // Always open Step 2 (Initial Parameter Control) first so the user can verify/adjust
        // Time Window, FPS, Remove Ground Shadow, and Target Resolution before generating!
        setCurrentStep(2);
        showToast(
          `Loaded ${first.name} (${first.videoDurationSec}s) — Set Initial Parameters & click Generate Sprite Sheet!`
        );
      } else {
        setIsPlaying(true);
        setCurrentStep(6);
        showToast(`Processed ${first.name} — Playing Live Sprite Preview!`);
      }
    }
  };

  const handlePickLocalFiles = async () => {
    const { files, usingNativeFS: native } = await pickLocalAssetFiles();
    if (native) setUsingNativeFS(true);
    await ingestLocalFiles(files);
  };

  const handleMountLocalFolder = async () => {
    const result = await mountLocalAssetDirectory();
    if (!result) return;
    setMountedFolderName(result.directoryName);
    setMountedDirectoryHandle(result.directoryHandle);
    setUsingNativeFS(result.usingNativeFS);
    await ingestLocalFiles(result.files);
    showToast(
      `Mounted folder "${result.directoryName}" (${result.files.length} assets queued)`
    );
  };

  const handleBatchProcessAll = async () => {
    setIsBatchRunning(true);
    try {
      const updatedList: BatchAssetItem[] = [];
      for (const item of assets) {
        let workingItem = item;
        if (workingItem.frames.length === 0 && workingItem.sourceUrl) {
          const { frames, detectedKeyColor } = await extractFramesFromVideoUrl(
            workingItem.sourceUrl,
            workingItem.id,
            workingItem.extractedAtFps || settings.videoFps,
            workingItem.extractStartSec || 0,
            workingItem.extractEndSec || 2.0,
            120
          );
          workingItem = {
            ...workingItem,
            frames,
            detectedKeyColor: workingItem.detectedKeyColor || detectedKeyColor,
            loopStartFrame: 0,
            loopEndFrame: Math.max(0, frames.length - 1),
          };
        }

        const itemKey = workingItem.detectedKeyColor || settings.keyColor;
        const [r, g, b] = [
          parseInt(itemKey.slice(1, 3), 16) || 0,
          parseInt(itemKey.slice(3, 5), 16) || 0,
          parseInt(itemKey.slice(5, 7), 16) || 0,
        ];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const processed = await runPipelineOnAssetInWorkers(
          workingItem,
          {
            ...settings,
            keyColor: itemKey,
            chromaWeight: sat < 30 ? 35 : settings.chromaWeight,
          },
          bypassHaloTweaks
        );
        if (processed) updatedList.push(processed);
      }
      setAssets(updatedList);
      showToast(`Processed all ${updatedList.length} assets in Background Workers!`);
    } finally {
      setIsBatchRunning(false);
    }
  };

  const handleExportCurrentSheetPng = async () => {
    if (!activeAsset?.outputSheetCanvas) return;
    const base = activeAsset.name.replace(/\.[^/.]+$/, '');
    try {
      const res = await saveSinglePngWithFSAPI(
        activeAsset.outputSheetCanvas,
        `${base}_sheet.png`
      );
      showToast(
        res.savedViaNativeFS
          ? `Saved ${res.fileName} via Browser File System API`
          : `Downloaded ${res.fileName}`
      );
    } catch {
      // Cancelled save dialog
    }
  };

  const handleExportCurrentBundleZip = async () => {
    if (!activeAsset || activeAsset.frames.length === 0) return;
    const built = buildNormalizedSpriteSheetAndMetadata(
      activeAsset.name,
      activeAsset.frames,
      settings,
      activeAsset.loopStartFrame,
      activeAsset.loopEndFrame
    );
    const res = await exportSpriteBundle({
      baseName: activeAsset.name,
      sheetCanvas: built.sheetCanvas,
      frameCanvases: built.normalizedFrames,
      metadataJson: built.metadataJson,
      metadataExtension: built.metadataExt,
      directoryHandle: mountedDirectoryHandle,
      preferDirectFolderWrite: Boolean(mountedDirectoryHandle && usingNativeFS),
    });

    showToast(
      res.mode === 'directory_fs'
        ? `Wrote ${res.fileCount} files directly into /${mountedFolderName}`
        : `Exported ${activeAsset.name} Sprite Sheet + ${settings.engineFormat.toUpperCase()} JSON (.ZIP)`
    );
  };

  const handleBatchExportAll = async () => {
    for (const item of assets) {
      if (item.frames.length === 0) continue;
      const itemKey = item.detectedKeyColor || settings.keyColor;
      const built = buildNormalizedSpriteSheetAndMetadata(
        item.name,
        item.frames,
        { ...settings, keyColor: itemKey },
        item.loopStartFrame,
        item.loopEndFrame
      );
      await exportSpriteBundle({
        baseName: item.name,
        sheetCanvas: built.sheetCanvas,
        frameCanvases: built.normalizedFrames,
        metadataJson: built.metadataJson,
        metadataExtension: built.metadataExt,
        directoryHandle: mountedDirectoryHandle,
        preferDirectFolderWrite: Boolean(mountedDirectoryHandle && usingNativeFS),
      });
    }
    showToast(`Exported all processed sprite bundles!`);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      await ingestLocalFiles(droppedFiles.map((file) => ({ file })));
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="h-screen flex flex-col bg-[#070A10] text-slate-100 overflow-hidden"
    >
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-[#070A10] border-b border-slate-800/80 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#single"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('single_wizard');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          SpriteSmithy Pro
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a
            href="#single"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('single_wizard');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'single_wizard' ? 'text-sky-400 underline font-semibold' : ''
            }`}
          >
            6-Stage Studio
          </a>
          <a
            href="#batch"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('batch');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'batch' ? 'text-sky-400 underline font-semibold' : ''
            }`}
          >
            Batch Mode ({assets.length})
          </a>
          {activeAsset && activeAsset.frames.length > 0 && (
            <a
              href="#live-preview"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('single_wizard');
                setIsPlaying(true);
                setCurrentStep(6);
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'single_wizard' && currentStep === 6
                  ? 'text-emerald-400 underline font-semibold'
                  : 'text-emerald-300/90'
              }`}
            >
              ▶ Live Sprite Player & Export
            </a>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handlePickLocalFiles}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#3B82F6] rounded-lg hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
          >
            Open Video File
          </button>
        </div>
      </header>

      {/* Non-intrusive Action Feedback Banner */}
      {statusBanner && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 border border-sky-500/70 text-slate-100 px-4 py-2 rounded-lg shadow-xl text-xs font-medium">
          {statusBanner}
        </div>
      )}

      {/* MAIN VIEW: 3-COLUMN ZERO-SCROLL STAGED WORKFLOW */}
      {activeView === 'single_wizard' && (
        <main className="flex-1 min-h-0 flex overflow-hidden">
          {/* COLUMN 1: Left 7-Step Vertical Navigation Rail */}
          <LeftStepRail
            currentStep={currentStep}
            setCurrentStep={handleStepChange}
            hasActiveVideo={Boolean(activeAsset)}
            hasExtractedFrames={Boolean(activeAsset && activeAsset.frames.length > 0)}
            batchCount={assets.length}
            onOpenBatchView={() => setActiveView('batch')}
          />

          {/* COLUMN 2: Spacious Uncluttered Center Stage + Single-Line Bottom Control Deck */}
          <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
            <CanvasViewport
              currentStep={currentStep}
              setCurrentStep={handleStepChange}
              assets={assets}
              activeAsset={activeAsset}
              onSelectAssetById={handleSelectAssetById}
              winStartSec={winStartSec}
              setWinStartSec={setWinStartSec}
              winEndSec={winEndSec}
              setWinEndSec={setWinEndSec}
              winFps={winFps}
              setWinFps={setWinFps}
              isExtractingFrames={isExtractingFrames}
              extractionProgress={extractionProgress}
              workerProgress={workerProgress}
              onExtractFramesNow={() => handleExtractFramesNow(true)}
              onRunV2ZeroTouchNow={() => {
                if (activeAsset) {
                  runZeroTouchV2ForVideo(
                    activeAsset,
                    settings,
                    winStartSec,
                    winEndSec,
                    winFps
                  );
                }
              }}
              activeFrameIndex={activeFrameIndex}
              setActiveFrameIndex={setActiveFrameIndex}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              settings={settings}
              updateSettings={updateSettings}
              bypassHaloTweaks={bypassHaloTweaks}
              setBypassHaloTweaks={setBypassHaloTweaks}
              clickTool={clickTool}
              setClickTool={setClickTool}
              onAddHoleSeed={handleAddHoleSeed}
              onPickLocalFiles={handlePickLocalFiles}
              onSelectArsenalVideo={handleSelectArsenalVideo}
            />

            <StageControlDeck
              currentStep={currentStep}
              setCurrentStep={handleStepChange}
              activeAsset={activeAsset}
              activeFrameIndex={activeFrameIndex}
              winStartSec={winStartSec}
              setWinStartSec={setWinStartSec}
              winEndSec={winEndSec}
              setWinEndSec={setWinEndSec}
              winFps={winFps}
              setWinFps={setWinFps}
              settings={settings}
              updateSettings={updateSettings}
              resetSettings={() => setSettings(DEFAULT_SETTINGS)}
              clickTool={clickTool}
              setClickTool={setClickTool}
              onSelectArsenalVideo={handleSelectArsenalVideo}
              onAutoDetectVideoLoop={handleAutoDetectVideoLoop}
              isScanningLoop={isScanningLoop}
              loopScanProgress={loopScanProgress}
              detectedVideoLoopScore={detectedVideoLoopScore}
              onExtractFramesNow={() => handleExtractFramesNow(true)}
              onRunV2ZeroTouchNow={() => {
                if (activeAsset) {
                  runZeroTouchV2ForVideo(
                    activeAsset,
                    settings,
                    winStartSec,
                    winEndSec,
                    winFps
                  );
                }
              }}
              isExtractingFrames={isExtractingFrames}
              extractionProgress={extractionProgress}
              onPickLocalFiles={handlePickLocalFiles}
              onApplyBestLoop={handleApplyBestLoop}
              onUpdateLoopRange={handleUpdateLoopRange}
              onExportCurrentSheetPng={handleExportCurrentSheetPng}
              onExportCurrentBundleZip={handleExportCurrentBundleZip}
              onOpenBatchModeWithRecipe={() => {
                handleBatchProcessAll();
                setActiveView('batch');
              }}
            />
          </div>

          {/* COLUMN 3: Dedicated Right Frames Grid Panel */}
          <RightFramesPanel
            activeAsset={activeAsset}
            activeFrameIndex={activeFrameIndex}
            setActiveFrameIndex={setActiveFrameIndex}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            fps={settings.videoFps}
            onToggleFrameEnabled={handleToggleFrameEnabled}
          />
        </main>
      )}

      {/* SECONDARY VIEW: BATCH MODE ("THE CREAM ON TOP") */}
      {activeView === 'batch' && (
        <main className="flex-1 overflow-y-auto">
          <BatchQueuePanel
            assets={assets}
            activeAssetId={activeAsset?.id || ''}
            onSelectAsset={(id) => {
              handleSelectAssetById(id);
              setActiveView('single_wizard');
            }}
            onRemoveAsset={handleRemoveAsset}
            onPickLocalFiles={handlePickLocalFiles}
            onMountLocalFolder={handleMountLocalFolder}
            onBatchProcessAll={handleBatchProcessAll}
            onBatchExportAll={handleBatchExportAll}
            isBatchRunning={isBatchRunning}
            mountedFolderName={mountedFolderName}
            usingNativeFS={usingNativeFS}
            settings={settings}
            compactSidebar={false}
          />
        </main>
      )}
    </div>
  );
}
