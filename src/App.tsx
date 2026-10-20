/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AtlasAndDocsView } from './components/AtlasAndDocsView';
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
import { DEFAULT_SETTINGS, USER_ARSENAL_VIDEOS } from './utils/demoAssets';
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
  computePerfectLoopDetection,
  extractFramesFromImageFile,
  extractFramesFromVideoUrl,
  processSpriteFrameCanvas,
  readVideoMetadataQuick,
} from './utils/imageProcessor';

type ActiveNavView = 'single_wizard' | 'batch' | 'atlas' | 'guide';

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
   * Runs the deterministic SpriteSmithy Halo Removal, Trapped Pocket Solver, Loose Particle Cleaner & Anti-Shift Centering pipeline.
   */
  const runPipelineOnAsset = useCallback(
    (
      asset: BatchAssetItem,
      currentSettings: ProcessingSettings,
      bypassHalo: boolean
    ): BatchAssetItem => {
      if (asset.frames.length === 0) return asset;

      const t0 = performance.now();
      const effectiveSettings: ProcessingSettings = bypassHalo
        ? {
            ...currentSettings,
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

      const updatedFrames: ExtractedFrame[] = asset.frames.map((frame) => {
        const {
          processedCanvas,
          heatmapCanvas,
          cropBox,
          coreBodyBox,
          removedParticleBoxes,
          metrics,
        } = processSpriteFrameCanvas(frame.sourceCanvas, effectiveSettings);
        return {
          ...frame,
          processedCanvas,
          heatmapCanvas,
          cropBox,
          coreBodyBox,
          removedParticleBoxes,
          processedWidth: cropBox.width,
          processedHeight: cropBox.height,
          haloMetrics: metrics,
        };
      });

      const loopResult = computePerfectLoopDetection(updatedFrames);
      const framesWithLoop = updatedFrames.map((f, idx) => ({
        ...f,
        loopSimilarityScore: loopResult.similarities[idx],
      }));

      const safeStart = Math.max(
        0,
        Math.min(asset.loopStartFrame, Math.max(0, framesWithLoop.length - 1))
      );
      const safeEnd = Math.max(
        safeStart,
        Math.min(asset.loopEndFrame, Math.max(0, framesWithLoop.length - 1))
      );

      const { sheetCanvas, metadataJson } = buildNormalizedSpriteSheetAndMetadata(
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
        outputSheetCanvas: sheetCanvas,
        outputMetadataJson: metadataJson,
        bestLoopCandidate: loopResult.bestLoop,
        processingTimeMs: Math.round(performance.now() - t0),
      };
    },
    []
  );

  const activeAsset = assets.find((a) => a.id === activeAssetId) || assets[0] || null;

  // Re-process active video whenever settings or bypassHaloTweaks change (only if frames are already extracted)
  useEffect(() => {
    if (!activeAsset || activeAsset.frames.length === 0) return;
    setAssets((prev) =>
      prev.map((item) =>
        item.id === activeAsset.id
          ? runPipelineOnAsset(item, settings, bypassHaloTweaks)
          : item
      )
    );
  }, [settings, bypassHaloTweaks, activeAssetId, runPipelineOnAsset]);

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
      id: `seed-${Date.now()}`,
      relX,
      relY,
      mode,
      sampledHex,
    };
    setSettings((prev) => ({
      ...prev,
      protectInteriorColors:
        mode !== 'erase_particle' ? true : prev.protectInteriorColors,
      holeSeeds: [...prev.holeSeeds, newSeed],
    }));
    showToast(
      mode === 'punch_hole'
        ? `Punched localised pocket (${sampledHex || 'auto'}) across all frames!`
        : mode === 'protect_spot'
        ? 'Protected local character area across all frames!'
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
   * Stage 3: Genuine On-Demand Frame Extraction with live progress feedback.
   */
  const handleExtractFramesNow = useCallback(
    async (advanceToStage4After: boolean = false) => {
      if (!activeAsset?.sourceUrl) return;
      setIsExtractingFrames(true);
      setExtractionProgress({ current: 0, total: 1 });

      try {
        const {
          frames,
          detectedKeyColor,
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
        setSettings(nextSettings);
        setActiveFrameIndex(0);

        setAssets((prev) =>
          prev.map((item) => {
            if (item.id !== activeAsset.id) return item;
            const updatedItem: BatchAssetItem = {
              ...item,
              videoDurationSec,
              extractStartSec: actualStartSec,
              extractEndSec: actualEndSec,
              extractedAtFps: winFps,
              frames,
              detectedKeyColor: keyHex,
              loopStartFrame: 0,
              loopEndFrame: Math.max(0, frames.length - 1),
            };
            return runPipelineOnAsset(updatedItem, nextSettings, bypassHaloTweaks);
          })
        );

        showToast(
          `Extracted ${frames.length} frames (${actualStartSec.toFixed(
            2
          )}s – ${actualEndSec.toFixed(2)}s @ ${winFps} FPS)`
        );
        if (advanceToStage4After) {
          setCurrentStep(4);
        }
      } catch (err: any) {
        showToast(err?.message || 'Failed to extract frames');
      } finally {
        setIsExtractingFrames(false);
        setExtractionProgress(null);
      }
    },
    [activeAsset, winFps, winStartSec, winEndSec, settings, bypassHaloTweaks, runPipelineOnAsset, showToast]
  );

  // If user jumps directly to Stage 4+ before extracting frames in Stage 3, automatically trigger extraction so they aren't stuck
  const handleStepChange = (targetStep: WizardStep) => {
    if (targetStep > 1 && !activeAsset) {
      showToast('Please upload a video or pick an Arsenal test video first!');
      return;
    }
    setCurrentStep(targetStep);
    if (
      targetStep >= 4 &&
      activeAsset &&
      activeAsset.frames.length === 0 &&
      !isExtractingFrames
    ) {
      handleExtractFramesNow(false);
    }
  };

  /**
   * Instant (<50ms) load when selecting an Arsenal Video in Stage 1 — advances immediately to Stage 2 (Loop Selection)!
   */
  const handleSelectArsenalVideo = async (preset: ArsenalVideoPreset) => {
    try {
      const meta = await readVideoMetadataQuick(preset.url);
      const startSec = preset.defaultStartSec ?? 0;
      const endSec = preset.defaultEndSec ?? Math.min(meta.videoDurationSec, 1.5);
      const fps = preset.defaultFps || 24;

      const nextSettings: ProcessingSettings = {
        ...DEFAULT_SETTINGS,
        ...preset.recommendedSettings,
        keyColor: preset.recommendedSettings.keyColor || meta.detectedKeyColor,
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
        frames: [], // Extracted on demand in Stage 3!
        detectedKeyColor: nextSettings.keyColor,
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
      showToast(`Loaded ${preset.title} (${meta.videoDurationSec}s) — Choose Loop in Step 2!`);
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
        return runPipelineOnAsset({ ...item, frames: nextFrames }, settings, bypassHaloTweaks);
      })
    );
  };

  const handleUpdateLoopRange = (start: number, end: number) => {
    if (!activeAsset) return;
    setAssets((prev) =>
      prev.map((item) => {
        if (item.id !== activeAsset.id) return item;
        return runPipelineOnAsset(
          { ...item, loopStartFrame: start, loopEndFrame: end },
          settings,
          bypassHaloTweaks
        );
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
          const defaultEnd = Number(Math.min(meta.videoDurationSec, 2.0).toFixed(2));

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
            extractedAtFps: 24,
            frames: [], // Extracted on demand in Stage 3!
            detectedKeyColor: meta.detectedKeyColor,
            loopStartFrame: 0,
            loopEndFrame: 0,
          };
          importedItems.push(item);
        } else {
          const { frames, detectedKeyColor } = await extractFramesFromImageFile(file);
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
            loopStartFrame: 0,
            loopEndFrame: Math.max(0, frames.length - 1),
          };
          importedItems.push(
            runPipelineOnAsset(
              item,
              { ...settings, keyColor: detectedKeyColor, holeSeeds: [] },
              bypassHaloTweaks
            )
          );
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

      if (first.detectedKeyColor) {
        const [r, g, b] = [
          parseInt(first.detectedKeyColor.slice(1, 3), 16) || 0,
          parseInt(first.detectedKeyColor.slice(3, 5), 16) || 0,
          parseInt(first.detectedKeyColor.slice(5, 7), 16) || 0,
        ];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        setSettings((prev) => ({
          ...prev,
          keyColor: first.detectedKeyColor!,
          chromaWeight: sat < 30 ? 35 : 80,
          holeSeeds: [],
        }));
      }

      if (first.type === 'video') {
        setCurrentStep(2);
        showToast(
          `Loaded ${first.name} (${first.videoDurationSec}s) — Pick Loop or Auto-Detect in Step 2!`
        );
      } else {
        setCurrentStep(4);
        showToast(`Loaded image ${first.name}`);
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
        updatedList.push(
          runPipelineOnAsset(
            workingItem,
            {
              ...settings,
              keyColor: itemKey,
              chromaWeight: sat < 30 ? 35 : settings.chromaWeight,
            },
            bypassHaloTweaks
          )
        );
      }
      setAssets(updatedList);
      showToast(`Processed all ${updatedList.length} assets with your recipe!`);
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

        {/* Zone 2: 4 concise single-line text navigation links */}
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
            Staged Studio
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
          <a
            href="#atlas"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('atlas');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'atlas' ? 'text-sky-400 underline font-semibold' : ''
            }`}
          >
            Sheet & JSON
          </a>
          <a
            href="#guide"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('guide');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'guide' ? 'text-sky-400 underline font-semibold' : ''
            }`}
          >
            Architecture Guide
          </a>
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
              winEndSec={winEndSec}
              winFps={winFps}
              isExtractingFrames={isExtractingFrames}
              extractionProgress={extractionProgress}
              onExtractFramesNow={() => handleExtractFramesNow(true)}
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
              onExtractFramesNow={() => handleExtractFramesNow(false)}
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

      {/* ATLAS & GUIDE VIEWS */}
      {(activeView === 'atlas' || activeView === 'guide') && activeAsset && (
        <main className="flex-1 overflow-y-auto">
          <AtlasAndDocsView
            activeAsset={activeAsset}
            settings={settings}
            updateSettings={updateSettings}
            onExportCurrentSheetPng={handleExportCurrentSheetPng}
            onExportCurrentBundleZip={handleExportCurrentBundleZip}
            mode={activeView}
          />
        </main>
      )}
    </div>
  );
}
