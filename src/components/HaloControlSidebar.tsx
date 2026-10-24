import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  Loader2,
  Pause,
  Pipette,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Scissors,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  ArsenalVideoPreset,
  BatchAssetItem,
  CanvasClickTool,
  CenterStabilizationMode,
  EdgePreservationMode,
  EngineExportFormat,
  ParticleFilterMode,
  ProcessingSettings,
  SheetLayoutMode,
  TargetSpriteResolution,
  WizardStep,
} from '../types/sprite';
import { STUDIO_PRESETS, USER_ARSENAL_VIDEOS } from '../utils/demoAssets';

export const SIX_STAGES: {
  step: WizardStep;
  label: string;
  headline: string;
}[] = [
  {
    step: 1,
    label: 'Upload Video',
    headline: 'Upload Your Video',
  },
  {
    step: 2,
    label: 'Initial Setup & Loop',
    headline: 'Initial Parameters, Action Window & Extraction',
  },
  {
    step: 3,
    label: 'Background Removal',
    headline: 'Multi-Shade Background & Local Pocket Removal',
  },
  {
    step: 4,
    label: 'Auto-Crop & Sizing',
    headline: 'Loose Particle Cleaner & Foot-Locked Centering',
  },
  {
    step: 5,
    label: 'Halo Remover',
    headline: '3px Boundary Unmixing & Edge Preservation',
  },
  {
    step: 6,
    label: 'Preview & Export',
    headline: 'Live Animated Sprite Player & Sprite Sheet Export',
  },
];

interface LeftStepRailProps {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  hasActiveVideo: boolean;
  hasExtractedFrames: boolean;
  batchCount: number;
  onOpenBatchView: () => void;
}

export const LeftStepRail: React.FC<LeftStepRailProps> = ({
  currentStep,
  setCurrentStep,
  hasActiveVideo,
  hasExtractedFrames,
  batchCount,
  onOpenBatchView,
}) => {
  return (
    <aside className="w-56 shrink-0 bg-[#070A10] border-r border-slate-800/80 flex flex-col justify-between h-full select-none">
      <div>
        {/* Brand Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-800/60">
          <div className="flex items-center justify-between gap-1.5">
            <div className="text-base font-extrabold tracking-tight text-white">
              Sprite Smithy
            </div>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-300">
              V2 AUTO
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Video to Sprite Sheet Studio
          </p>
        </div>

        {/* 6 Vertical Stepped Tabs */}
        <nav className="p-3 space-y-1">
          {SIX_STAGES.map((item) => {
            const isActive = currentStep === item.step;
            const isDone =
              (item.step === 1 && hasActiveVideo) ||
              (item.step === 2 && hasExtractedFrames) ||
              (item.step >= 3 && hasExtractedFrames && currentStep > item.step);

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#3B82F6] text-white font-semibold shadow-sm'
                    : isDone
                    ? 'text-slate-200 hover:bg-slate-800/50'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono shrink-0 ${
                    isActive
                      ? 'bg-slate-950/35 text-white font-bold'
                      : isDone
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800/80 text-slate-400'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3" /> : item.step}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Step Indicator & Batch Mode Button */}
      <div className="p-3.5 border-t border-slate-800/70 space-y-2.5">
        {batchCount > 0 && (
          <button
            type="button"
            onClick={onOpenBatchView}
            className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-amber-400 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Queue</span>
            </span>
            <span className="font-mono text-[11px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">
              {batchCount}
            </span>
          </button>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1) as WizardStep)}
            className={`p-1.5 rounded-md border text-xs transition-colors ${
              currentStep === 1
                ? 'border-slate-900 text-slate-700 cursor-not-allowed'
                : 'border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            title="Previous Stage"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          <span className="text-xs font-mono text-slate-400">
            Step {currentStep} of 6
          </span>

          <button
            type="button"
            disabled={currentStep === 6}
            onClick={() => setCurrentStep(Math.min(6, currentStep + 1) as WizardStep)}
            className={`p-1.5 rounded-md border text-xs transition-colors ${
              currentStep === 6
                ? 'border-slate-900 text-slate-700 cursor-not-allowed'
                : 'border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            title="Next Stage"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

interface RightFramesPanelProps {
  activeAsset: BatchAssetItem | null;
  activeFrameIndex: number;
  setActiveFrameIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  fps: number;
  onToggleFrameEnabled: (idx: number) => void;
}

export const RightFramesPanel: React.FC<RightFramesPanelProps> = ({
  activeAsset,
  activeFrameIndex,
  setActiveFrameIndex,
  isPlaying,
  setIsPlaying,
  fps,
  onToggleFrameEnabled,
}) => {
  const thumbRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const frames = activeAsset?.frames || [];

  const activeLoopFrames = frames.filter(
    (f, idx) =>
      f.enabled &&
      idx >= (activeAsset?.loopStartFrame ?? 0) &&
      idx <= (activeAsset?.loopEndFrame ?? frames.length - 1)
  );

  useEffect(() => {
    frames.forEach((f, idx) => {
      const canvas = thumbRefs.current.get(idx);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const src = f.processedCanvas || f.sourceCanvas;
      const box = f.cropBox || { x: 0, y: 0, width: src.width, height: src.height };
      const pad = 4;
      const availW = canvas.width - pad * 2;
      const availH = canvas.height - pad * 2;
      const scale = Math.min(
        availW / Math.max(1, box.width),
        availH / Math.max(1, box.height)
      );
      const dw = box.width * scale;
      const dh = box.height * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;

      ctx.drawImage(src, box.x, box.y, box.width, box.height, dx, dy, dw, dh);
    });
  }, [frames, activeAsset]);

  return (
    <aside className="w-68 xl:w-72 shrink-0 bg-[#070A10] border-l border-slate-800/80 flex flex-col h-full select-none">
      {/* Top Frames Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800/70 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Frames</h3>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            {frames.length === 0
              ? 'No frames yet'
              : `${activeLoopFrames.length} active · ${fps} FPS`}
          </p>
        </div>

        {frames.length > 0 && (
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              isPlaying
                ? 'bg-[#3B82F6] text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
        )}
      </div>

      {/* Empty 1..9 Placeholder Grid when no frames are extracted yet */}
      {frames.length === 0 ? (
        <div className="p-3 grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <div
              key={n}
              className="aspect-square rounded-lg bg-[#111827]/75 border border-slate-800/70 flex items-center justify-center text-xs font-mono text-slate-500"
            >
              {n}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
            {frames.map((frame, idx) => {
              const isSelected = idx === activeFrameIndex;
              const inLoop =
                idx >= (activeAsset?.loopStartFrame ?? 0) &&
                idx <= (activeAsset?.loopEndFrame ?? frames.length - 1);
              const specksRemoved = frame.haloMetrics?.looseParticlesRemoved || 0;

              return (
                <div
                  key={frame.id}
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveFrameIndex(idx);
                  }}
                  className={`group relative rounded-lg border p-1 cursor-pointer transition-all flex flex-col items-center ${
                    isSelected
                      ? 'bg-slate-800/95 border-[#3B82F6] ring-1 ring-[#3B82F6]/50'
                      : inLoop && frame.enabled
                      ? 'bg-[#111827] border-slate-800/90 hover:border-slate-700'
                      : 'bg-[#0B0F17]/40 border-slate-900 opacity-35'
                  }`}
                >
                  <div className="relative w-full aspect-square bg-checkerboard-dark rounded overflow-hidden flex items-center justify-center">
                    <canvas
                      width={72}
                      height={72}
                      ref={(el) => {
                        if (el) thumbRefs.current.set(idx, el);
                        else thumbRefs.current.delete(idx);
                      }}
                      className="w-full h-full object-contain"
                    />

                    {specksRemoved > 0 && (
                      <span
                        title={`${specksRemoved} loose particle(s) cleaned`}
                        className="absolute top-0.5 right-0.5 px-1 rounded bg-emerald-950/90 text-[9px] font-mono text-emerald-300"
                      >
                        -{specksRemoved}
                      </span>
                    )}
                  </div>

                  <div className="w-full flex items-center justify-between mt-1 px-0.5 text-[10px] font-mono tabular-nums">
                    <span className={isSelected ? 'text-sky-400 font-bold' : 'text-slate-400'}>
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFrameEnabled(idx);
                      }}
                      className={`px-1 rounded text-[9px] font-semibold ${
                        frame.enabled
                          ? 'text-slate-500 hover:text-white'
                          : 'text-rose-400 bg-rose-950/60'
                      }`}
                    >
                      {frame.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};

interface StageControlDeckProps {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  activeAsset: BatchAssetItem | null;
  activeFrameIndex?: number;
  winStartSec: number;
  setWinStartSec: (v: number) => void;
  winEndSec: number;
  setWinEndSec: (v: number) => void;
  winFps: number;
  setWinFps: (v: number) => void;
  settings: ProcessingSettings;
  updateSettings: (partial: Partial<ProcessingSettings>) => void;
  resetSettings: () => void;
  clickTool: CanvasClickTool;
  setClickTool: (tool: CanvasClickTool) => void;
  onSelectArsenalVideo: (preset: ArsenalVideoPreset) => void;
  onAutoDetectVideoLoop: () => void;
  isScanningLoop: boolean;
  loopScanProgress: number;
  detectedVideoLoopScore: number | null;
  onExtractFramesNow: () => void;
  onRunV2ZeroTouchNow: () => void;
  isExtractingFrames: boolean;
  extractionProgress: { current: number; total: number } | null;
  onPickLocalFiles: () => void;
  onApplyBestLoop: () => void;
  onUpdateLoopRange: (start: number, end: number) => void;
  onExportCurrentSheetPng: () => void;
  onExportCurrentBundleZip: () => void;
  onOpenBatchModeWithRecipe: () => void;
}

export const StageControlDeck: React.FC<StageControlDeckProps> = ({
  currentStep,
  setCurrentStep,
  activeAsset,
  activeFrameIndex = 0,
  winStartSec,
  setWinStartSec,
  winEndSec,
  setWinEndSec,
  winFps,
  setWinFps,
  settings,
  updateSettings,
  resetSettings,
  clickTool,
  setClickTool,
  onAutoDetectVideoLoop,
  isScanningLoop,
  loopScanProgress,
  detectedVideoLoopScore,
  onExtractFramesNow,
  onRunV2ZeroTouchNow,
  isExtractingFrames,
  extractionProgress,
  onApplyBestLoop,
  onExportCurrentSheetPng,
  onExportCurrentBundleZip,
  onOpenBatchModeWithRecipe,
}) => {
  const [openPopover, setOpenPopover] = useState<
    'subclips' | 'pocket_studio' | 'pocket_more' | 'particle_more' | 'halo_more' | null
  >(null);

  useEffect(() => {
    setOpenPopover(null);
  }, [currentStep]);

  if (currentStep === 1 && !activeAsset) {
    return null;
  }

  const frames = activeAsset?.frames || [];
  const videoDuration = activeAsset?.videoDurationSec || 4.0;
  const estimatedFrames = Math.min(
    120,
    Math.max(1, Math.round(Math.max(0.05, winEndSec - winStartSec) * winFps))
  );
  const activeArsenalPreset = USER_ARSENAL_VIDEOS.find((v) => v.id === activeAsset?.id);

  const removeSecondaryColor = (id: string) => {
    updateSettings({
      secondaryKeyColors: (settings.secondaryKeyColors || []).filter((c) => c.id !== id),
    });
  };

  const addPocketTargetColorSwatch = (defaultHex?: string) => {
    const existing = settings.pocketTargetColors || [];
    const fallbackShades = ['#D8DCE3', '#B4BAC6', '#8E96A4', '#E6E2D8'];
    const hex = defaultHex || fallbackShades[existing.length % fallbackShades.length];
    updateSettings({
      pocketTargetColors: [
        ...existing,
        {
          id: `pcol-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          hex,
          tolerance: settings.localPunchTolerance ?? 24,
        },
      ],
    });
  };

  const updatePocketTargetColor = (
    id: string,
    patch: { hex?: string; tolerance?: number }
  ) => {
    updateSettings({
      pocketTargetColors: (settings.pocketTargetColors || []).map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    });
  };

  const removePocketTargetColor = (id: string) => {
    updateSettings({
      pocketTargetColors: (settings.pocketTargetColors || []).filter((c) => c.id !== id),
    });
  };

  const pocketLayers = (settings.holeSeeds || []).filter(
    (s) => s.mode === 'punch_hole' || s.mode === 'protect_spot'
  );

  const updatePocketLayer = (
    layerId: string,
    patch: Partial<(typeof settings.holeSeeds)[number]>
  ) => {
    updateSettings({
      holeSeeds: (settings.holeSeeds || []).map((s) =>
        s.id === layerId ? { ...s, ...patch } : s
      ),
    });
  };

  const removePocketLayer = (layerId: string) => {
    updateSettings({
      holeSeeds: (settings.holeSeeds || []).filter((s) => s.id !== layerId),
    });
  };

  return (
    <section className="relative shrink-0 bg-[#0D131F] border-t border-slate-800/90 px-5 py-3 select-none">
      {/* STEP 1: VIDEO LOADED CONFIRMATION BAR */}
      {currentStep === 1 && activeAsset && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
              Video Ready
            </span>
            <span className="font-semibold text-white">{activeAsset.name}</span>
            <span className="text-slate-400 font-mono">
              {videoDuration.toFixed(2)}s duration
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <span>Configure Initial Parameters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 2: INITIAL SETUP, LOOP SELECTION & EXTRACTION */}
      {currentStep === 2 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isScanningLoop}
              onClick={onAutoDetectVideoLoop}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isScanningLoop ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning ({loopScanProgress}%)...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Auto-Detect Loop Window</span>
                </>
              )}
            </button>

            {detectedVideoLoopScore !== null && !isScanningLoop && (
              <span className="px-2 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-300">
                {detectedVideoLoopScore}% Match
              </span>
            )}

            {activeArsenalPreset?.subClips && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenPopover(openPopover === 'subclips' ? null : 'subclips')
                  }
                  className="px-2.5 py-2 rounded-lg bg-[#070A10] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1"
                >
                  <span>Action Presets</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {openPopover === 'subclips' && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-1">
                    {activeArsenalPreset.subClips.map((clip, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setWinStartSec(clip.startSec);
                          setWinEndSec(clip.endSec);
                          setWinFps(clip.fps);
                          updateSettings({ videoFps: clip.fps });
                          setOpenPopover(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-[#3B82F6] hover:text-white transition-colors"
                      >
                        {clip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {frames.length > 2 && activeAsset?.bestLoopCandidate && (
              <button
                type="button"
                onClick={onApplyBestLoop}
                className="px-2.5 py-2 rounded-lg bg-[#070A10] hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5"
                title="Trim extracted frames using Silhouette-IoU + Motion-Direction Velocity match"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>
                  Snap Loop (#{activeAsset.bestLoopCandidate.startIdx + 1}→#
                  {activeAsset.bestLoopCandidate.endIdx + 1} · IoU{' '}
                  {activeAsset.bestLoopCandidate.silhouetteIoU ??
                    activeAsset.bestLoopCandidate.similarity}
                  %)
                </span>
              </button>
            )}
          </div>

          <div className="flex-1 min-w-[240px] max-w-lg grid grid-cols-2 gap-4">
            <CompactSlider
              label="Start Time"
              value={winStartSec}
              unit="s"
              min={0}
              max={Math.max(0.1, Number((videoDuration - 0.1).toFixed(2)))}
              step={0.05}
              onChange={(v) => {
                setWinStartSec(v);
                if (v >= winEndSec) setWinEndSec(Math.min(videoDuration, v + 0.25));
              }}
            />

            <CompactSlider
              label="End Time"
              value={winEndSec}
              unit="s"
              min={0.1}
              max={videoDuration}
              step={0.05}
              onChange={(v) => {
                setWinEndSec(v);
                if (v <= winStartSec) setWinStartSec(Math.max(0, v - 0.25));
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExtractingFrames}
              onClick={onExtractFramesNow}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              {isExtractingFrames ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                  <span>
                    Extracting{' '}
                    {extractionProgress
                      ? `${extractionProgress.current}/${extractionProgress.total}`
                      : '...'}
                  </span>
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5 text-sky-400" />
                  <span>Step-by-Step ({estimatedFrames}f)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExtractingFrames}
              onClick={onRunV2ZeroTouchNow}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate & Play Sprite ({estimatedFrames}f)</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: MULTI-COLOR BACKGROUND REMOVAL & LAYERED MULTI-COLOR POCKET STUDIO */}
      {currentStep === 3 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary BG Color + V2 Auto-Calibrated 3 K-Means BG Clusters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {activeAsset?.bgProfile && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-[11px] text-emerald-200"
                title="Stage 1 Auto-Calibrated 5% Border K-Means Clusters (Bright BG, Midtone BG, Shadowed Floor BG) + CIELAB Standard Deviation"
              >
                <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-semibold hidden xl:inline">Auto 3-Cluster BG:</span>
                {activeAsset.bgProfile.clusters.map((c) => (
                  <span
                    key={c.id}
                    title={`${c.label}: ${c.hex} (σ=${c.sigmaLab.toFixed(1)}, ${c.weightPct}% border)`}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 font-mono text-[10px]"
                  >
                    <span
                      style={{ backgroundColor: c.hex }}
                      className="w-2.5 h-2.5 rounded-sm border border-slate-400 inline-block"
                    />
                    <span>±{c.sigmaLab.toFixed(1)}σ</span>
                  </span>
                ))}
              </div>
            )}

            <input
              type="color"
              value={settings.keyColor}
              onChange={(e) =>
                updateSettings({
                  keyColor: e.target.value.toUpperCase(),
                  keyingMode: 'chroma_perceptual',
                })
              }
              className="w-7 h-7 rounded bg-transparent border border-slate-700 cursor-pointer"
              title="Primary Background Color"
            />
            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'eyedropper' ? 'pan' : 'eyedropper')
              }
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1 ${
                clickTool === 'eyedropper'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                  : 'bg-[#070A10] text-slate-200 border-slate-800 hover:border-slate-700'
              }`}
              title="Sample primary background color from canvas"
            >
              <Pipette className="w-3.5 h-3.5" />
              <span>Pick BG</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'add_bg_shade' ? 'pan' : 'add_bg_shade')
              }
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
                clickTool === 'add_bg_shade'
                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-semibold'
                  : 'bg-[#070A10] text-sky-300 border-slate-800 hover:border-sky-500/50'
              }`}
              title="Click a cast shadow or secondary background shade on the stage to remove multiple background colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add BG Shade</span>
            </button>

            {(settings.secondaryKeyColors || []).map((sec) => (
              <div
                key={sec.id}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#070A10] border border-slate-700 text-[11px] font-mono text-slate-200"
                title={`Secondary BG/Shadow Color (${sec.hex})`}
              >
                <span
                  style={{ backgroundColor: sec.hex }}
                  className="w-3 h-3 rounded-sm border border-slate-500 inline-block"
                />
                <span>{sec.hex}</span>
                <button
                  type="button"
                  onClick={() => removeSecondaryColor(sec.id)}
                  className="text-slate-400 hover:text-rose-400 ml-0.5"
                  title="Remove this shade"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Primary Tolerance Slider */}
          <div className="w-36">
            <CompactSlider
              label="BG Tolerance"
              value={settings.tolerance}
              unit="%"
              min={5}
              max={80}
              step={1}
              onChange={(val) => updateSettings({ tolerance: val })}
            />
          </div>

          {/* PUNCH LOCAL POCKET + DEDICATED MULTI-COLOR PALETTE & LAYERED STUDIO */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#070A10]/90 px-2.5 py-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'punch_hole' ? 'pan' : 'punch_hole')
              }
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                clickTool === 'punch_hole'
                  ? 'bg-rose-600 text-white border-rose-400 shadow-sm'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-rose-500/60'
              }`}
              title="Click inside any enclosed gap or shaded pocket on the canvas to add a Punch Pocket Layer"
            >
              <Eraser className="w-3.5 h-3.5 text-rose-400" />
              <span>Punch Local Pocket</span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateSettings({
                  punchUsePrimaryBg: !(settings.punchUsePrimaryBg !== false),
                })
              }
              className={`px-2 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                settings.punchUsePrimaryBg !== false
                  ? 'bg-slate-800/90 border-rose-500/50 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through'
              }`}
              title="By default, Punch Local Pocket matches the Primary Background Color. Click to toggle."
            >
              <span
                style={{ backgroundColor: settings.keyColor }}
                className="w-3 h-3 rounded-sm border border-slate-400 inline-block"
              />
              <span>Same as BG</span>
            </button>

            {(settings.pocketTargetColors || []).map((pcol, idx) => (
              <div
                key={pcol.id}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900 border border-rose-500/40 text-[11px] font-mono text-slate-200"
                title={`Pocket Target Color #${idx + 1} (${pcol.hex})`}
              >
                <input
                  type="color"
                  value={pcol.hex}
                  onChange={(e) =>
                    updatePocketTargetColor(pcol.id, {
                      hex: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-4 h-4 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="hidden xl:inline">{pcol.hex}</span>
                <button
                  type="button"
                  onClick={() => removePocketTargetColor(pcol.id)}
                  className="text-slate-400 hover:text-rose-400"
                  title="Remove pocket color"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setClickTool(
                  clickTool === 'pick_pocket_color' ? 'pan' : 'pick_pocket_color'
                )
              }
              className={`px-2 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                clickTool === 'pick_pocket_color'
                  ? 'bg-rose-500 text-slate-950 border-rose-300 font-semibold'
                  : 'bg-slate-900 text-rose-300 border-slate-700 hover:border-rose-500/50'
              }`}
              title="Sample a 2nd or 3rd shade inside a pocket on the canvas to add to Punch Local Pocket's multi-color list"
            >
              <Pipette className="w-3 h-3" />
              <span>+ Pocket Color</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'protect_spot' ? 'pan' : 'protect_spot')
              }
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition-colors ${
                clickTool === 'protect_spot'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-500/60'
              }`}
              title="Click any inner character region to add a Protect Layer that keeps its shade 100% solid"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Protect</span>
            </button>

            {/* POCKET LAYERS POPOVER STUDIO */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover(
                    openPopover === 'pocket_studio' ? null : 'pocket_studio'
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  openPopover === 'pocket_studio' || pocketLayers.length > 0
                    ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                    : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                <span>Pocket Layers ({pocketLayers.length})</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {openPopover === 'pocket_studio' && (
                <div className="absolute bottom-full right-0 mb-2 w-[380px] max-h-[72vh] overflow-y-auto p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-xs font-bold text-white">
                        Punch Local Pocket — Colors & Layered Editor
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Defaults to BG color; add 2–3+ pocket colors & manage each click as an editable layer
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenPopover(null)}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 bg-[#070A10] p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                        1. Pocket Target Colors
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setClickTool('pick_pocket_color');
                            setOpenPopover(null);
                          }}
                          className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-[11px] font-semibold text-rose-200 flex items-center gap-1"
                        >
                          <Pipette className="w-3 h-3" />
                          <span>Pick on Canvas</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addPocketTargetColorSwatch()}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-200 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Swatch</span>
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer pt-1">
                      <span className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: settings.keyColor }}
                          className="w-3.5 h-3.5 rounded border border-slate-500 inline-block"
                        />
                        <span>Match Primary BG Color ({settings.keyColor})</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.punchUsePrimaryBg !== false}
                        onChange={(e) =>
                          updateSettings({ punchUsePrimaryBg: e.target.checked })
                        }
                        className="accent-rose-500 w-4 h-4 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                      <span>Auto-Include Clicked Pixel Shade on Each Layer</span>
                      <input
                        type="checkbox"
                        checked={settings.punchUseSampledColor !== false}
                        onChange={(e) =>
                          updateSettings({ punchUseSampledColor: e.target.checked })
                        }
                        className="accent-rose-500 w-4 h-4 rounded"
                      />
                    </label>

                    {(settings.pocketTargetColors || []).length > 0 ? (
                      <div className="space-y-2 pt-1.5 border-t border-slate-800/80">
                        {(settings.pocketTargetColors || []).map((pcol, idx) => (
                          <div
                            key={pcol.id}
                            className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800"
                          >
                            <input
                              type="color"
                              value={pcol.hex}
                              onChange={(e) =>
                                updatePocketTargetColor(pcol.id, {
                                  hex: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-6 h-6 rounded bg-transparent border border-slate-700 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-200">
                                  Pocket Color #{idx + 1} ({pcol.hex})
                                </span>
                                <span className="font-mono text-rose-300">
                                  Tol {pcol.tolerance}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={75}
                                value={pcol.tolerance}
                                onChange={(e) =>
                                  updatePocketTargetColor(pcol.id, {
                                    tolerance: Number(e.target.value),
                                  })
                                }
                                className="w-full h-1 bg-slate-800 rounded-lg accent-rose-500 cursor-pointer"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removePocketTargetColor(pcol.id)}
                              className="text-slate-400 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic pt-1">
                        No extra pocket colors added yet.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 bg-[#070A10] p-3 rounded-lg border border-slate-800">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                      2. Pocket Flood-Fill Options
                    </div>

                    <CompactSlider
                      label="Default Pocket Color Tolerance"
                      value={settings.localPunchTolerance ?? 24}
                      unit="%"
                      min={5}
                      max={75}
                      step={1}
                      onChange={(val) => updateSettings({ localPunchTolerance: val })}
                    />

                    <CompactSlider
                      label="Max Pocket Spread Radius"
                      value={settings.localPunchRadius ?? 30}
                      unit="%"
                      min={5}
                      max={60}
                      step={1}
                      onChange={(val) => updateSettings({ localPunchRadius: val })}
                    />

                    <CompactSlider
                      label="Pocket Inner Rim Choke (Anti-Halo)"
                      value={settings.localPunchEdgeChoke ?? 35}
                      unit="%"
                      min={0}
                      max={100}
                      step={5}
                      onChange={(val) => updateSettings({ localPunchEdgeChoke: val })}
                    />

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-slate-300">Flood Connectivity</span>
                      <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings({ localPunchConnectivity: '4_way' })
                          }
                          className={`px-2 py-1 rounded text-[11px] font-medium ${
                            (settings.localPunchConnectivity ?? '4_way') === '4_way'
                              ? 'bg-[#3B82F6] text-white font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          4-Way Safe Outlines
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings({ localPunchConnectivity: '8_way' })
                          }
                          className={`px-2 py-1 rounded text-[11px] font-medium ${
                            settings.localPunchConnectivity === '8_way'
                              ? 'bg-[#3B82F6] text-white font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          8-Way Diagonal
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
                      <span>Show Layer Pins on Canvas</span>
                      <input
                        type="checkbox"
                        checked={settings.showPocketMarkers !== false}
                        onChange={(e) =>
                          updateSettings({ showPocketMarkers: e.target.checked })
                        }
                        className="accent-[#3B82F6] w-4 h-4 rounded"
                      />
                    </label>
                  </div>

                  <div className="space-y-2 bg-[#070A10] p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                        3. Layered Pocket Edits ({pocketLayers.length})
                      </span>
                      {pocketLayers.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings({
                              holeSeeds: (settings.holeSeeds || []).filter(
                                (s) => s.mode === 'erase_particle'
                              ),
                            })
                          }
                          className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Clear All Layers</span>
                        </button>
                      )}
                    </div>

                    {pocketLayers.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-2 text-center border border-dashed border-slate-800 rounded-lg">
                        Click inside any trapped gap on the canvas with{' '}
                        <strong className="text-rose-300">Punch Local Pocket</strong> to create Layer #1.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {pocketLayers.map((layer, idx) => {
                          const isEnabled = layer.enabled !== false;
                          const layerColor = layer.sampledHex || settings.keyColor;
                          const layerTol =
                            layer.localTolerance ?? settings.localPunchTolerance ?? 24;
                          const isSingleFrame = layer.frameScope === 'single_frame';

                          return (
                            <div
                              key={layer.id}
                              className={`p-2.5 rounded-lg border space-y-2 transition-colors ${
                                isEnabled
                                  ? 'bg-slate-900/90 border-slate-700'
                                  : 'bg-slate-950/60 border-slate-800/60 opacity-60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updatePocketLayer(layer.id, {
                                        enabled: !isEnabled,
                                      })
                                    }
                                    className="text-slate-300 hover:text-white p-0.5"
                                  >
                                    {isEnabled ? (
                                      <Eye className="w-3.5 h-3.5 text-sky-400" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                                    )}
                                  </button>

                                  <span className="text-xs font-bold text-white">
                                    Layer #{idx + 1}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      updatePocketLayer(layer.id, {
                                        mode:
                                          layer.mode === 'punch_hole'
                                            ? 'protect_spot'
                                            : 'punch_hole',
                                      })
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      layer.mode === 'punch_hole'
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    }`}
                                  >
                                    {layer.mode === 'punch_hole' ? 'Punch' : 'Protect'}
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updatePocketLayer(layer.id, {
                                        frameScope: isSingleFrame
                                          ? 'all_frames'
                                          : 'single_frame',
                                        targetFrameIndex: activeFrameIndex,
                                      })
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                      isSingleFrame
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-slate-800 text-slate-300 border-slate-700'
                                    }`}
                                  >
                                    {isSingleFrame
                                      ? `Frame #${(layer.targetFrameIndex ?? activeFrameIndex) + 1} Only`
                                      : 'All Frames'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => removePocketLayer(layer.id)}
                                    className="text-slate-400 hover:text-rose-400 p-0.5"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="text-slate-400">Layer Colors:</span>
                                <input
                                  type="color"
                                  value={layerColor}
                                  onChange={(e) =>
                                    updatePocketLayer(layer.id, {
                                      sampledHex: e.target.value.toUpperCase(),
                                    })
                                  }
                                  className="w-5 h-5 rounded bg-transparent border border-slate-600 cursor-pointer"
                                />

                                {(layer.extraColors || []).map((hex, cIdx) => (
                                  <div
                                    key={`${layer.id}-ext-${cIdx}`}
                                    className="flex items-center gap-0.5 bg-slate-950 px-1 py-0.5 rounded border border-slate-700"
                                  >
                                    <input
                                      type="color"
                                      value={hex}
                                      onChange={(e) => {
                                        const nextExtra = [...(layer.extraColors || [])];
                                        nextExtra[cIdx] = e.target.value.toUpperCase();
                                        updatePocketLayer(layer.id, {
                                          extraColors: nextExtra,
                                        });
                                      }}
                                      className="w-4 h-4 rounded bg-transparent border-0 cursor-pointer"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextExtra = (
                                          layer.extraColors || []
                                        ).filter((_, i) => i !== cIdx);
                                        updatePocketLayer(layer.id, {
                                          extraColors: nextExtra,
                                        });
                                      }}
                                      className="text-slate-400 hover:text-rose-400"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextExtra = [
                                      ...(layer.extraColors || []),
                                      '#C8CDD6',
                                    ];
                                    updatePocketLayer(layer.id, {
                                      extraColors: nextExtra,
                                    });
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 flex items-center gap-0.5"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>Color</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-400 w-16 shrink-0">
                                  Tol: {layerTol}%
                                </span>
                                <input
                                  type="range"
                                  min={5}
                                  max={75}
                                  value={layerTol}
                                  onChange={(e) =>
                                    updatePocketLayer(layer.id, {
                                      localTolerance: Number(e.target.value),
                                    })
                                  }
                                  className="flex-1 h-1 bg-slate-800 rounded-lg accent-rose-500 cursor-pointer"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* General Background Options Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover(openPopover === 'pocket_more' ? null : 'pocket_more')
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>BG Options</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {openPopover === 'pocket_more' && (
                <div className="absolute bottom-full right-0 mb-2 w-80 p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-3">
                  <div className="text-xs font-bold text-white border-b border-slate-800 pb-1.5">
                    V2 Autonomous Sobel & Trapped Space Engine
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">Keying Engine</span>
                    <select
                      value={settings.keyingMode}
                      onChange={(e) =>
                        updateSettings({
                          keyingMode: e.target.value as ProcessingSettings['keyingMode'],
                        })
                      }
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white"
                    >
                      <option value="v2_auto_kmeans">V2 Auto 3-Cluster K-Means</option>
                      <option value="chroma_perceptual">Manual Chroma + Shades</option>
                      <option value="luma_key">Luma Key</option>
                    </select>
                  </div>

                  <CompactSlider
                    label="Sobel Limb Barrier Strength"
                    value={settings.v2SobelBoundaryStrength ?? 55}
                    unit="%"
                    min={15}
                    max={95}
                    step={1}
                    onChange={(val) => updateSettings({ v2SobelBoundaryStrength: val })}
                  />

                  <CompactSlider
                    label="Trapped Pocket K-Means Range"
                    value={settings.v2PocketSigmaMultiplier ?? 2.0}
                    unit="σ"
                    min={1.0}
                    max={3.5}
                    step={0.1}
                    onChange={(val) => updateSettings({ v2PocketSigmaMultiplier: val })}
                  />

                  <CompactSlider
                    label="Max Pocket Texture Variance"
                    value={settings.v2MaxPocketTextureVariance ?? 16}
                    unit=""
                    min={4}
                    max={40}
                    step={1}
                    onChange={(val) =>
                      updateSettings({ v2MaxPocketTextureVariance: val })
                    }
                  />

                  <CompactSlider
                    label="Boundary Linear Unmix Ring"
                    value={settings.v2BoundaryUnmixRadius ?? 3}
                    unit=" px"
                    min={1}
                    max={5}
                    step={1}
                    onChange={(val) => updateSettings({ v2BoundaryUnmixRadius: val })}
                  />

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer pt-1 border-t border-slate-800">
                    <span>Strict Interior Protection (Eyes/Armor)</span>
                    <input
                      type="checkbox"
                      checked={settings.protectInteriorColors}
                      onChange={(e) =>
                        updateSettings({ protectInteriorColors: e.target.checked })
                      }
                      className="accent-[#3B82F6] w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span>Auto-Punch Trapped Negative Spaces</span>
                    <input
                      type="checkbox"
                      checked={settings.autoPunchTrappedHoles}
                      onChange={(e) =>
                        updateSettings({ autoPunchTrappedHoles: e.target.checked })
                      }
                      className="accent-[#3B82F6] w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span>Remove Ground Floor Shadow Oval</span>
                    <input
                      type="checkbox"
                      checked={settings.removeGroundShadow}
                      onChange={(e) =>
                        updateSettings({ removeGroundShadow: e.target.checked })
                      }
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(4)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ml-auto"
          >
            <span>Next: Auto-Crop & Particles</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 4: AUTO-CROP, LOOSE PARTICLE CLEANER & CENTER LOCK */}
      {currentStep === 4 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer bg-[#070A10] px-3 py-1.5 rounded-lg border border-emerald-500/40">
              <input
                type="checkbox"
                checked={settings.cleanLooseParticles}
                onChange={(e) => updateSettings({ cleanLooseParticles: e.target.checked })}
                className="accent-emerald-500 w-4 h-4 rounded"
              />
              <span className="text-xs font-semibold text-emerald-300">
                Clean Loose Specks
              </span>
            </label>

            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'erase_particle' ? 'pan' : 'erase_particle')
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                clickTool === 'erase_particle'
                  ? 'bg-rose-600 text-white border-rose-400'
                  : 'bg-[#070A10] text-slate-200 border-slate-800 hover:border-rose-500/60'
              }`}
            >
              <Eraser className="w-3.5 h-3.5 text-rose-400" />
              <span>Click to Zap Speck</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium">Stabilizer:</span>
              <select
                value={settings.centerStabilization}
                onChange={(e) =>
                  updateSettings({
                    centerStabilization: e.target.value as CenterStabilizationMode,
                  })
                }
                className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium"
              >
                <option value="core_grounded">
                  Center-of-Mass (centerX) + Foot Baseline Lock (maxY)
                </option>
                <option value="global_locked">Global Locked Box (0px Shift)</option>
                <option value="per_frame_bounds">Per-Frame Tight Crop</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-300 font-medium">Target Cell:</span>
              <select
                value={settings.targetSpriteResolution ?? 256}
                onChange={(e) =>
                  updateSettings({
                    targetSpriteResolution: Number(
                      e.target.value
                    ) as TargetSpriteResolution,
                  })
                }
                className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-semibold"
              >
                <option value={128}>128×128 (Supersampled)</option>
                <option value={256}>256×256 (Supersampled)</option>
                <option value={512}>512×512 (Supersampled)</option>
                <option value={0}>Native Crop Size</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenPopover(openPopover === 'particle_more' ? null : 'particle_more')
              }
              className="px-2.5 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Particle & Crop Tuning</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {openPopover === 'particle_more' && (
              <div className="absolute bottom-full right-0 mb-2 w-80 p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-3">
                <div className="text-xs font-bold text-white border-b border-slate-800 pb-1.5">
                  Loose Particle Filter & Sizing
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Particle Filter Mode
                  </label>
                  <select
                    value={settings.particleFilterMode}
                    onChange={(e) =>
                      updateSettings({
                        particleFilterMode: e.target.value as ParticleFilterMode,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="smart_proximity">Smart Size + Distance Filter</option>
                    <option value="main_body_only">Strict Main Character Body Only</option>
                    <option value="min_size_only">Keep Distant Projectiles / VFX</option>
                  </select>
                </div>
                <CompactSlider
                  label="Min Speck Size to Keep"
                  value={settings.minParticleArea}
                  unit=" px²"
                  min={4}
                  max={300}
                  step={4}
                  onChange={(val) => updateSettings({ minParticleArea: val })}
                />
                <CompactSlider
                  label="Max Distance from Body"
                  value={settings.maxParticleDistance}
                  unit=" px"
                  min={2}
                  max={100}
                  step={2}
                  onChange={(val) => updateSettings({ maxParticleDistance: val })}
                />
                <CompactSlider
                  label="Safe Cell Padding"
                  value={settings.padding}
                  unit=" px"
                  min={0}
                  max={32}
                  step={2}
                  onChange={(val) => updateSettings({ padding: val })}
                />
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer pt-1">
                  <span>Highlight Stripped Specks (Red Boxes)</span>
                  <input
                    type="checkbox"
                    checked={settings.showParticleOverlay}
                    onChange={(e) =>
                      updateSettings({ showParticleOverlay: e.target.checked })
                    }
                    className="accent-rose-500 w-4 h-4 rounded"
                  />
                </label>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(5)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ml-auto"
          >
            <span>Next: Halo Remover</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 5: HALO REMOVER */}
      {currentStep === 5 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[280px] grid grid-cols-3 gap-4">
            <CompactSlider
              label="Halo Eater (Shrink Edge)"
              value={settings.alphaChoke}
              unit=" px"
              min={-1.5}
              max={3.5}
              step={0.1}
              onChange={(val) => updateSettings({ alphaChoke: val })}
            />

            <CompactSlider
              label="Remove Edge Tint"
              value={settings.colorUnmixStrength}
              unit="%"
              min={0}
              max={100}
              step={1}
              onChange={(val) =>
                updateSettings({
                  colorUnmixStrength: val,
                  deSpillStrength: Math.round(val * 0.9),
                })
              }
            />

            <CompactSlider
              label="Inward Color Bleed"
              value={settings.innerColorBleedRadius}
              unit=" px"
              min={0}
              max={6}
              step={1}
              onChange={(val) => updateSettings({ innerColorBleedRadius: val })}
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenPopover(openPopover === 'halo_more' ? null : 'halo_more')
              }
              className="px-2.5 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edge Style & Presets</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {openPopover === 'halo_more' && (
              <div className="absolute bottom-full right-0 mb-2 w-80 p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-bold text-white">
                    High-Res Edge & Presets
                  </span>
                  <button
                    type="button"
                    onClick={resetSettings}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  {(
                    [
                      { id: 'hd_antialiased', label: 'Smooth HD' },
                      { id: 'subpixel_crisp', label: 'Crisp HD' },
                      { id: 'pixel_art_hard', label: 'Pixel Art' },
                    ] as { id: EdgePreservationMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateSettings({ edgeMode: m.id })}
                      className={`py-1 text-[11px] font-medium rounded ${
                        settings.edgeMode === m.id
                          ? 'bg-[#3B82F6] text-white font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <CompactSlider
                  label="HD Line Art Sharpness"
                  value={settings.edgeSharpness}
                  unit="%"
                  min={0}
                  max={100}
                  step={1}
                  onChange={(val) => updateSettings({ edgeSharpness: val })}
                />

                <div className="space-y-1 pt-1">
                  <span className="text-[11px] text-slate-400">Quick Presets:</span>
                  <div className="grid grid-cols-1 gap-1">
                    {STUDIO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          updateSettings(preset.settings);
                          setOpenPopover(null);
                        }}
                        className="text-left px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-xs text-slate-200 border border-slate-800"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(6)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Next: Preview & Export</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 6: LIVE ANIMATED SPRITE PREVIEW & EXPORT */}
      {currentStep === 6 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {activeAsset?.bestLoopCandidate && (
              <button
                type="button"
                onClick={onApplyBestLoop}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 flex items-center gap-1.5 transition-colors"
                title="Click to snap active frame range to the detected Silhouette-IoU seamless loop"
              >
                <Repeat className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  Loop #{(activeAsset.loopStartFrame ?? 0) + 1}→#
                  {(activeAsset.loopEndFrame ?? frames.length - 1) + 1} · Foot Locked
                </span>
              </button>
            )}

            <select
              value={settings.targetSpriteResolution ?? 256}
              onChange={(e) =>
                updateSettings({
                  targetSpriteResolution: Number(
                    e.target.value
                  ) as TargetSpriteResolution,
                })
              }
              className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-semibold"
              title="Area-Averaging Supersampled Sprite Cell Resolution"
            >
              <option value={128}>128×128 Supersampled</option>
              <option value={256}>256×256 Supersampled</option>
              <option value={512}>512×512 Supersampled</option>
              <option value={0}>Native Cell Size</option>
            </select>

            <select
              value={settings.sheetLayout}
              onChange={(e) =>
                updateSettings({ sheetLayout: e.target.value as SheetLayoutMode })
              }
              className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              <option value="grid">Grid Rows & Cols</option>
              <option value="horizontal_strip">Horizontal Strip</option>
              <option value="vertical_strip">Vertical Strip</option>
              <option value="pot_packed">Power-of-Two Atlas</option>
            </select>

            {settings.sheetLayout === 'grid' && (
              <div className="w-32">
                <CompactSlider
                  label="Columns"
                  value={settings.sheetColumns}
                  unit=" cols"
                  min={1}
                  max={12}
                  step={1}
                  onChange={(val) => updateSettings({ sheetColumns: val })}
                />
              </div>
            )}

            <select
              value={settings.engineFormat}
              onChange={(e) =>
                updateSettings({ engineFormat: e.target.value as EngineExportFormat })
              }
              className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              <option value="unity">Unity JSON</option>
              <option value="godot4">Godot 4 JSON</option>
              <option value="phaser3">Phaser 3 JSON</option>
              <option value="gdevelop">GDevelop JSON</option>
              <option value="aseprite">Aseprite JSON</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onExportCurrentSheetPng}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Sprite Sheet (.PNG)</span>
            </button>

            <button
              type="button"
              onClick={onExportCurrentBundleZip}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>ZIP + {settings.engineFormat.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={onOpenBatchModeWithRecipe}
              className="px-3.5 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Send Recipe to Batch Mode →</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

interface CompactSliderProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}

const CompactSlider: React.FC<CompactSliderProps> = ({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-300 truncate">{label}</span>
        <span className="font-mono tabular-nums text-sky-400 font-semibold shrink-0 ml-1">
          {step < 1 ? value.toFixed(1) : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-slider w-full"
      />
    </div>
  );
};
