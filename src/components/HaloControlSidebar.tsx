import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  Download,
  Eraser,
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
  WizardStep,
} from '../types/sprite';
import { STUDIO_PRESETS, USER_ARSENAL_VIDEOS } from '../utils/demoAssets';

export const SEVEN_STAGES: {
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
    label: 'Loop Selection',
    headline: 'Select Action Window & Auto-Detect Loop',
  },
  {
    step: 3,
    label: 'Frame Extraction',
    headline: 'Extract Frames from Selected Loop',
  },
  {
    step: 4,
    label: 'Background Removal',
    headline: 'Multi-Shade Background & Local Pocket Removal',
  },
  {
    step: 5,
    label: 'Auto-Crop & Sizing',
    headline: 'Loose Particle Cleaner & Center Lock',
  },
  {
    step: 6,
    label: 'Halo Remover',
    headline: 'Halo Remover & Edge Preservation',
  },
  {
    step: 7,
    label: 'Export',
    headline: 'Export Sprite Sheet & Batch Mode',
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
          <div className="text-base font-extrabold tracking-tight text-white">
            Sprite Smithy
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            AI Video to Sprite Sheet Converter
          </p>
        </div>

        {/* 7 Vertical Stepped Tabs */}
        <nav className="p-3 space-y-1">
          {SEVEN_STAGES.map((item) => {
            const isActive = currentStep === item.step;
            const isDone =
              (item.step === 1 && hasActiveVideo) ||
              (item.step === 2 && hasActiveVideo && currentStep > 2) ||
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
            Step {currentStep} of 7
          </span>

          <button
            type="button"
            disabled={currentStep === 7}
            onClick={() => setCurrentStep(Math.min(7, currentStep + 1) as WizardStep)}
            className={`p-1.5 rounded-md border text-xs transition-colors ${
              currentStep === 7
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
  isExtractingFrames,
  extractionProgress,
  onApplyBestLoop,
  onExportCurrentSheetPng,
  onExportCurrentBundleZip,
  onOpenBatchModeWithRecipe,
}) => {
  const [openPopover, setOpenPopover] = useState<
    'subclips' | 'pocket_more' | 'particle_more' | 'halo_more' | null
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
            <span>Continue to Loop Selection</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 2: LOOP SELECTION & AUTO LOOP DETECTOR */}
      {currentStep === 2 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isScanningLoop}
              onClick={onAutoDetectVideoLoop}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
            >
              {isScanningLoop ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Poses ({loopScanProgress}%)...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Auto-Detect Seamless Loop</span>
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
                  <div className="absolute bottom-full left-0 mb-2 w-64 p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-1">
                    {activeArsenalPreset.subClips.map((clip, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setWinStartSec(clip.startSec);
                          setWinEndSec(clip.endSec);
                          setWinFps(clip.fps);
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
          </div>

          <div className="flex-1 min-w-[260px] max-w-xl grid grid-cols-2 gap-4">
            <CompactSlider
              label="Loop Start Time"
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
              label="Loop End Time"
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

          <button
            type="button"
            onClick={() => setCurrentStep(3)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Next: Frame Extraction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 3: GENUINE ON-DEMAND FRAME EXTRACTION */}
      {currentStep === 3 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-[260px] max-w-xl">
            <div className="flex-1">
              <CompactSlider
                label="Capture Frame Rate (FPS)"
                value={winFps}
                unit=" FPS"
                min={6}
                max={60}
                step={2}
                onChange={(val) => setWinFps(val)}
              />
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 text-xs font-mono tabular-nums text-slate-300 shrink-0">
              <span>{estimatedFrames} frames</span>
              <span className="text-slate-600 mx-1.5">·</span>
              <span className="text-sky-400">
                {winStartSec.toFixed(2)}s–{winEndSec.toFixed(2)}s
              </span>
            </div>
          </div>

          {frames.length > 2 && activeAsset?.bestLoopCandidate && (
            <button
              type="button"
              onClick={onApplyBestLoop}
              className="px-3 py-2 rounded-lg bg-[#070A10] hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5"
              title="Trim extracted frames to the closest start/end pose match"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>
                Snap Best Frame Loop (#{activeAsset.bestLoopCandidate.startIdx + 1}→#
                {activeAsset.bestLoopCandidate.endIdx + 1} ·{' '}
                {activeAsset.bestLoopCandidate.similarity}%)
              </span>
            </button>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              disabled={isExtractingFrames}
              onClick={onExtractFramesNow}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isExtractingFrames ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Extracting{' '}
                    {extractionProgress
                      ? `${extractionProgress.current}/${extractionProgress.total}`
                      : '...'}
                  </span>
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5" />
                  <span>
                    {frames.length === 0
                      ? `Extract ${estimatedFrames} Frames Now`
                      : `Re-Extract ${estimatedFrames} Frames (@ ${winFps} FPS)`}
                  </span>
                </>
              )}
            </button>

            {frames.length > 0 && (
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Next: Background Removal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: MULTI-COLOR BACKGROUND REMOVAL & LOCALISED POCKET PUNCHER */}
      {currentStep === 4 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary BG Color + Conditional Extra BG Shades / Shadows */}
          <div className="flex flex-wrap items-center gap-1.5">
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

            {/* Conditional Multi-Color / Shadow Shade Picker */}
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
              <span>Add BG Shade / Shadow</span>
            </button>

            {/* Render chips for any added secondary background / shadow colors */}
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
          <div className="w-44">
            <CompactSlider
              label="Removal Strength"
              value={settings.tolerance}
              unit="%"
              min={5}
              max={80}
              step={1}
              onChange={(val) => updateSettings({ tolerance: val })}
            />
          </div>

          {/* Localised Click-to-Punch Pocket & Protect Area */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'punch_hole' ? 'pan' : 'punch_hole')
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                clickTool === 'punch_hole'
                  ? 'bg-rose-600 text-white border-rose-400'
                  : 'bg-[#070A10] text-slate-200 border-slate-800 hover:border-rose-500/60'
              }`}
              title="Localised Magic Wand: Click any trapped gap or local shadow pocket to erase that contiguous shade region"
            >
              <Eraser className="w-3.5 h-3.5 text-rose-400" />
              <span>Punch Local Pocket</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setClickTool(clickTool === 'protect_spot' ? 'pan' : 'protect_spot')
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                clickTool === 'protect_spot'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-[#070A10] text-slate-200 border-slate-800 hover:border-emerald-500/60'
              }`}
              title="Click any inner character region to keep its local shade 100% solid"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Protect Area</span>
            </button>

            {/* Generalised Enclosed Gaps & Multi-Shade Options Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover(openPopover === 'pocket_more' ? null : 'pocket_more')
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Options</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {openPopover === 'pocket_more' && (
                <div className="absolute bottom-full right-0 mb-2 w-76 p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-3">
                  <div className="text-xs font-bold text-white border-b border-slate-800 pb-1.5">
                    Enclosed Gaps & Local Wand Options
                  </div>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span>Keep Inner Character Colors Solid</span>
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
                    <span>Auto-Clear Enclosed BG Gaps</span>
                    <input
                      type="checkbox"
                      checked={settings.autoPunchTrappedHoles}
                      onChange={(e) =>
                        updateSettings({ autoPunchTrappedHoles: e.target.checked })
                      }
                      className="accent-[#3B82F6] w-4 h-4 rounded"
                    />
                  </label>

                  <CompactSlider
                    label="Local Pocket Shade Tolerance"
                    value={settings.localPunchTolerance ?? 22}
                    unit="%"
                    min={6}
                    max={55}
                    step={1}
                    onChange={(val) => updateSettings({ localPunchTolerance: val })}
                  />

                  <CompactSlider
                    label="Min Auto-Cleared Gap Area"
                    value={settings.maxProtectedDetailArea}
                    unit=" px²"
                    min={15}
                    max={260}
                    step={5}
                    onChange={(val) => updateSettings({ maxProtectedDetailArea: val })}
                  />

                  {(settings.secondaryKeyColors || []).length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400">
                        Extra Background / Shadow Shades
                      </div>
                      {settings.secondaryKeyColors.map((sec, idx) => (
                        <CompactSlider
                          key={sec.id}
                          label={`Shade #${idx + 1} (${sec.hex}) Tolerance`}
                          value={sec.tolerance}
                          unit="%"
                          min={5}
                          max={55}
                          step={1}
                          onChange={(val) => {
                            const next = settings.secondaryKeyColors.map((c) =>
                              c.id === sec.id ? { ...c, tolerance: val } : c
                            );
                            updateSettings({ secondaryKeyColors: next });
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {settings.holeSeeds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateSettings({ holeSeeds: [] })}
                      className="w-full py-1.5 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear {settings.holeSeeds.length} Local Edits</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(5)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ml-auto"
          >
            <span>Next: Auto-Crop & Particles</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 5: AUTO-CROP, LOOSE PARTICLE CLEANER & CENTER LOCK */}
      {currentStep === 5 && (
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

          <div className="flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs text-slate-300 font-medium">Center Lock:</span>
            <select
              value={settings.centerStabilization}
              onChange={(e) =>
                updateSettings({
                  centerStabilization: e.target.value as CenterStabilizationMode,
                })
              }
              className="bg-[#070A10] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium"
            >
              <option value="core_grounded">Lock to Core Body & Feet (Anti-Shift)</option>
              <option value="global_locked">Global Locked Box (0px Shift)</option>
              <option value="per_frame_bounds">Per-Frame Tight Crop</option>
            </select>
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
            onClick={() => setCurrentStep(6)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ml-auto"
          >
            <span>Next: Halo Remover</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 6: HALO REMOVER */}
      {currentStep === 6 && (
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
            onClick={() => setCurrentStep(7)}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Next: Export</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STEP 7: EXPORT SPRITE SHEET & BATCH HANDOFF */}
      {currentStep === 7 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
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
