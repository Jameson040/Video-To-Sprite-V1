import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  Film,
  Grid,
  Loader2,
  Maximize2,
  Scissors,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ArsenalVideoPreset,
  BatchAssetItem,
  CanvasClickTool,
  ExtractedFrame,
  PreviewBackdrop,
  ProcessingSettings,
  WizardStep,
} from '../types/sprite';
import { USER_ARSENAL_VIDEOS } from '../utils/demoAssets';
import { rgbToHex } from '../utils/imageProcessor';
import { SEVEN_STAGES } from './HaloControlSidebar';

export type ViewportDisplayMode = 'processed' | 'split_compare' | 'halo_heatmap' | 'packed_sheet';

interface CanvasViewportProps {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  assets: BatchAssetItem[];
  activeAsset: BatchAssetItem | null;
  onSelectAssetById: (id: string) => void;
  winStartSec: number;
  winEndSec: number;
  winFps: number;
  isExtractingFrames: boolean;
  extractionProgress: { current: number; total: number } | null;
  onExtractFramesNow: () => void;
  activeFrameIndex: number;
  setActiveFrameIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  settings: ProcessingSettings;
  updateSettings: (partial: Partial<ProcessingSettings>) => void;
  bypassHaloTweaks: boolean;
  setBypassHaloTweaks: (val: boolean) => void;
  clickTool: CanvasClickTool;
  setClickTool: (tool: CanvasClickTool) => void;
  onAddHoleSeed: (
    relX: number,
    relY: number,
    mode: 'punch_hole' | 'protect_spot' | 'erase_particle',
    sampledHex?: string
  ) => void;
  onPickLocalFiles: () => void;
  onSelectArsenalVideo: (preset: ArsenalVideoPreset) => void;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  currentStep,
  assets,
  activeAsset,
  onSelectAssetById,
  winStartSec,
  winEndSec,
  winFps,
  isExtractingFrames,
  extractionProgress,
  onExtractFramesNow,
  activeFrameIndex,
  setActiveFrameIndex,
  isPlaying,
  settings,
  updateSettings,
  bypassHaloTweaks,
  setBypassHaloTweaks,
  clickTool,
  setClickTool,
  onAddHoleSeed,
  onPickLocalFiles,
  onSelectArsenalVideo,
}) => {
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>('processed');
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('checker_dark');
  const [zoom, setZoom] = useState<number>(1.25);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [splitPosition, setSplitPosition] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [showCropGuides, setShowCropGuides] = useState<boolean>(false);
  const [hoveredColorHex, setHoveredColorHex] = useState<string | null>(null);
  const [showViewMenu, setShowViewMenu] = useState<boolean>(false);
  const [showArsenalDrawer, setShowArsenalDrawer] = useState<boolean>(false);

  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loopVideoRef = useRef<HTMLVideoElement | null>(null);

  const frames = activeAsset?.frames || [];
  const safeFrameIdx = Math.min(Math.max(0, activeFrameIndex), Math.max(0, frames.length - 1));
  const currentFrame: ExtractedFrame | undefined = frames[safeFrameIdx];

  const stageMeta = SEVEN_STAGES.find((s) => s.step === currentStep) || SEVEN_STAGES[0];

  // Auto-fit Sprite Sheet in Stage 7 so large sheets never overflow the viewport
  const fitCanvasToViewport = () => {
    const container = containerRef.current;
    if (!container) return;
    const cw = Math.max(200, container.clientWidth - 48);
    const ch = Math.max(200, container.clientHeight - 48);

    if (displayMode === 'packed_sheet' && activeAsset?.outputSheetCanvas) {
      const sw = Math.max(1, activeAsset.outputSheetCanvas.width);
      const sh = Math.max(1, activeAsset.outputSheetCanvas.height);
      const fitScale = Math.min(cw / sw, ch / sh, 1.5);
      setZoom(Number(Math.max(0.15, fitScale).toFixed(2)));
      setPan({ x: 0, y: 0 });
    } else if (currentFrame) {
      const fw = Math.max(1, currentFrame.sourceCanvas.width);
      const fh = Math.max(1, currentFrame.sourceCanvas.height);
      const fitScale = Math.min(cw / fw, ch / fh, 1.6);
      setZoom(Number(Math.max(0.5, fitScale).toFixed(2)));
      setPan({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    setShowViewMenu(false);
    if (currentStep === 7) {
      setDisplayMode('packed_sheet');
      window.setTimeout(fitCanvasToViewport, 30);
    } else if (displayMode === 'packed_sheet') {
      setDisplayMode('processed');
      setZoom(1.2);
      setPan({ x: 0, y: 0 });
    }
  }, [currentStep, activeAsset?.outputSheetCanvas]);

  // Keep native <video> in Stage 2 looping smoothly inside [winStartSec, winEndSec]
  useEffect(() => {
    const vid = loopVideoRef.current;
    if (!vid || currentStep !== 2) return;
    if (vid.currentTime < winStartSec || vid.currentTime > winEndSec) {
      vid.currentTime = winStartSec;
    }
  }, [winStartSec, winEndSec, currentStep]);

  // Animation loop for extracted frames (Stages 3–6)
  useEffect(() => {
    if (
      !isPlaying ||
      frames.length <= 1 ||
      currentStep <= 2 ||
      displayMode === 'packed_sheet'
    ) {
      return;
    }

    const intervalMs = Math.max(25, Math.round(1000 / Math.max(1, settings.videoFps)));
    const timer = window.setInterval(() => {
      setActiveFrameIndex(
        (() => {
          const start = Math.max(0, activeAsset?.loopStartFrame ?? 0);
          const end = Math.min(
            frames.length - 1,
            activeAsset?.loopEndFrame ?? frames.length - 1
          );
          let next = safeFrameIdx + 1;
          if (next > end || next < start) next = start;
          let safety = 0;
          while (!frames[next]?.enabled && safety < frames.length) {
            next = next + 1 > end ? start : next + 1;
            safety++;
          }
          return next;
        })()
      );
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    frames,
    safeFrameIdx,
    settings.videoFps,
    activeAsset?.loopStartFrame,
    activeAsset?.loopEndFrame,
    currentStep,
    displayMode,
    setActiveFrameIndex,
  ]);

  // Render main stage canvas for Stages 3–7
  useEffect(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (displayMode === 'packed_sheet' && activeAsset?.outputSheetCanvas) {
      const sheet = activeAsset.outputSheetCanvas;
      canvas.width = sheet.width;
      canvas.height = sheet.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sheet, 0, 0);
      return;
    }

    const srcCanvas = currentFrame.sourceCanvas;
    const procCanvas = currentFrame.processedCanvas || srcCanvas;
    const heatCanvas = currentFrame.heatmapCanvas || procCanvas;

    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (settings.edgeMode === 'pixel_art_hard') {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    if (displayMode === 'processed') {
      ctx.drawImage(procCanvas, 0, 0);
    } else if (displayMode === 'halo_heatmap') {
      ctx.drawImage(heatCanvas, 0, 0);
    } else if (displayMode === 'split_compare') {
      const splitX = Math.round((splitPosition / 100) * canvas.width);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, canvas.height);
      ctx.clip();
      ctx.drawImage(srcCanvas, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, canvas.width - splitX, canvas.height);
      ctx.clip();
      ctx.drawImage(procCanvas, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = Math.max(1.5, 2 / zoom);
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, canvas.height);
      ctx.stroke();
      ctx.restore();
    }

    // Highlight Removed Loose Particles in Red Boxes when requested
    const removedBoxes = currentFrame.removedParticleBoxes || [];
    if (
      settings.showParticleOverlay &&
      removedBoxes.length > 0 &&
      displayMode !== 'packed_sheet'
    ) {
      ctx.save();
      ctx.strokeStyle = '#F43F5E';
      ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
      ctx.lineWidth = Math.max(1.2, 1.5 / zoom);
      for (const rBox of removedBoxes) {
        const rx = Math.max(0, rBox.x - 3);
        const ry = Math.max(0, rBox.y - 3);
        const rw = rBox.width + 6;
        const rh = rBox.height + 6;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }

    // Draw Seed Point pins if user placed any
    if (settings.holeSeeds.length > 0 && displayMode !== 'packed_sheet') {
      for (const seed of settings.holeSeeds) {
        const px = seed.relX * canvas.width;
        const py = seed.relY * canvas.height;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle =
          seed.mode === 'protect_spot'
            ? '#10B981'
            : seed.mode === 'erase_particle'
            ? '#F59E0B'
            : '#EF4444';
        ctx.fill();
        ctx.lineWidth = 1.2 / zoom;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
        ctx.restore();
      }
    }

    // Optional Crop & Center Alignment Guides
    if (showCropGuides && displayMode !== 'packed_sheet') {
      const box = currentFrame.cropBox;
      const core = currentFrame.coreBodyBox || box;

      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = Math.max(1, 1.2 / zoom);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);

      const anchorX =
        settings.centerStabilization === 'core_grounded'
          ? core.x + core.width / 2
          : box.x + box.width / 2;
      const anchorY =
        settings.anchorAlignment === 'bottom_center'
          ? settings.centerStabilization === 'core_grounded'
            ? core.y + core.height
            : box.y + box.height
          : settings.centerStabilization === 'core_grounded'
          ? core.y + core.height / 2
          : box.y + box.height / 2;

      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = Math.max(1.2, 1.6 / zoom);
      ctx.beginPath();
      ctx.moveTo(anchorX - 8, anchorY);
      ctx.lineTo(anchorX + 8, anchorY);
      ctx.moveTo(anchorX, anchorY - 8);
      ctx.lineTo(anchorX, anchorY + 8);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    currentFrame,
    currentStep,
    displayMode,
    splitPosition,
    showCropGuides,
    zoom,
    settings.edgeMode,
    settings.anchorAlignment,
    settings.centerStabilization,
    settings.showParticleOverlay,
    settings.holeSeeds,
    activeAsset?.outputSheetCanvas,
  ]);

  const handleCanvasPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentFrame || !stageCanvasRef.current) return;

    const rect = stageCanvasRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    const sampleHexAt = (rx: number, ry: number): string | undefined => {
      if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return undefined;
      const sx = Math.min(
        currentFrame.sourceCanvas.width - 1,
        Math.max(0, Math.floor(rx * currentFrame.sourceCanvas.width))
      );
      const sy = Math.min(
        currentFrame.sourceCanvas.height - 1,
        Math.max(0, Math.floor(ry * currentFrame.sourceCanvas.height))
      );
      const ctx = currentFrame.sourceCanvas.getContext('2d');
      if (!ctx) return undefined;
      const p = ctx.getImageData(sx, sy, 1, 1).data;
      return rgbToHex(p[0], p[1], p[2]);
    };

    if (clickTool === 'eyedropper') {
      const pickedHex = sampleHexAt(relX, relY);
      if (pickedHex) {
        const sx = Math.floor(relX * currentFrame.sourceCanvas.width);
        const sy = Math.floor(relY * currentFrame.sourceCanvas.height);
        const p = currentFrame.sourceCanvas
          .getContext('2d')!
          .getImageData(sx, sy, 1, 1).data;
        const sat = Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
        updateSettings({
          keyColor: pickedHex,
          keyingMode: 'chroma_perceptual',
          chromaWeight: sat < 30 ? 35 : 80,
        });
        setClickTool('pan');
      }
      return;
    }

    if (clickTool === 'add_bg_shade') {
      const pickedHex = sampleHexAt(relX, relY);
      if (pickedHex) {
        const existing = settings.secondaryKeyColors || [];
        if (!existing.some((c) => c.hex === pickedHex)) {
          updateSettings({
            secondaryKeyColors: [
              ...existing,
              { id: `shade-${Date.now()}`, hex: pickedHex, tolerance: 18 },
            ],
          });
        }
        setClickTool('pan');
      }
      return;
    }

    if (
      (clickTool === 'punch_hole' ||
        clickTool === 'protect_spot' ||
        clickTool === 'erase_particle') &&
      displayMode !== 'packed_sheet'
    ) {
      if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
        const sampledHex = sampleHexAt(relX, relY);
        onAddHoleSeed(relX, relY, clickTool, sampledHex);
      }
      return;
    }

    if (displayMode === 'split_compare') {
      const clickPct = relX * 100;
      if (Math.abs(clickPct - splitPosition) < 8) {
        setIsDraggingSplit(true);
        return;
      }
    }

    setIsDraggingPan(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      (clickTool === 'eyedropper' ||
        clickTool === 'add_bg_shade' ||
        clickTool === 'punch_hole') &&
      currentFrame &&
      stageCanvasRef.current
    ) {
      const rect = stageCanvasRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
        const sx = Math.floor(relX * currentFrame.sourceCanvas.width);
        const sy = Math.floor(relY * currentFrame.sourceCanvas.height);
        const ctx = currentFrame.sourceCanvas.getContext('2d');
        if (ctx) {
          const p = ctx.getImageData(sx, sy, 1, 1).data;
          setHoveredColorHex(rgbToHex(p[0], p[1], p[2]));
        }
      } else {
        setHoveredColorHex(null);
      }
      return;
    }

    if (isDraggingSplit && stageCanvasRef.current) {
      const rect = stageCanvasRef.current.getBoundingClientRect();
      const pct = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPosition(Math.round(pct));
      return;
    }

    if (isDraggingPan) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleCanvasPointerUp = () => {
    setIsDraggingPan(false);
    setIsDraggingSplit(false);
  };

  const backdropStyle = (): { className: string; style?: React.CSSProperties } => {
    switch (backdrop) {
      case 'checker_light':
        return { className: 'bg-checkerboard-light' };
      case 'neon_magenta':
        return { className: '', style: { backgroundColor: '#FF00FF' } };
      case 'void_black':
        return { className: '', style: { backgroundColor: '#05070C' } };
      case 'pure_white':
        return { className: '', style: { backgroundColor: '#FFFFFF' } };
      default:
        return { className: 'bg-checkerboard-dark' };
    }
  };

  const bd = backdropStyle();
  const estimatedFrames = Math.min(
    120,
    Math.max(1, Math.round(Math.max(0.05, winEndSec - winStartSec) * winFps))
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0B0F19] select-none overflow-hidden">
      {/* Ultra-Slim 40px Stage Header Bar — Zero Clutter */}
      <div className="h-11 px-5 bg-[#0D131F] border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-bold text-white truncate">
            {stageMeta.headline}
          </span>
          {activeAsset && (
            <span className="text-[11px] font-mono text-slate-400 truncate">
              · {activeAsset.name}
            </span>
          )}
        </div>

        {/* Right Controls: Only shown when extracted frames exist (tucked neatly into View Options dropdown!) */}
        {frames.length > 0 && currentStep >= 3 && (
          <div className="flex items-center gap-2">
            {/* Compact Mode Switcher */}
            <div className="flex items-center p-0.5 bg-[#070A10] rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setDisplayMode('processed')}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'processed'
                    ? 'bg-[#3B82F6] text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Sprite</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode('split_compare')}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'split_compare'
                    ? 'bg-[#3B82F6] text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3 h-3" />
                <span>Split</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDisplayMode('packed_sheet');
                  window.setTimeout(fitCanvasToViewport, 20);
                }}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'packed_sheet'
                    ? 'bg-[#3B82F6] text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Grid className="w-3 h-3" />
                <span>Sheet</span>
              </button>
            </div>

            {/* Single Consolidated View Options Dropdown (Backdrops, Heatmap, Guides, Raw Compare, Video Switcher) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowViewMenu(!showViewMenu)}
                className="px-2.5 py-1 rounded-lg bg-[#070A10] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>View Options</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {showViewMenu && (
                <div className="absolute top-full right-0 mt-1.5 w-64 p-3.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 space-y-3 text-xs">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                      Canvas Backdrop
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(
                        [
                          { id: 'checker_dark', label: 'Dark Checker' },
                          { id: 'void_black', label: 'Pure Black' },
                          { id: 'neon_magenta', label: 'Neon Magenta' },
                          { id: 'pure_white', label: 'Pure White' },
                        ] as { id: PreviewBackdrop; label: string }[]
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBackdrop(b.id)}
                          className={`px-2 py-1 rounded text-left text-[11px] ${
                            backdrop === b.id
                              ? 'bg-[#3B82F6] text-white font-semibold'
                              : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                      <span>Edge Halo Heatmap</span>
                      <input
                        type="checkbox"
                        checked={displayMode === 'halo_heatmap'}
                        onChange={(e) =>
                          setDisplayMode(e.target.checked ? 'halo_heatmap' : 'processed')
                        }
                        className="accent-[#3B82F6] w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                      <span>Show Crop & Center Guides</span>
                      <input
                        type="checkbox"
                        checked={showCropGuides}
                        onChange={(e) => setShowCropGuides(e.target.checked)}
                        className="accent-[#3B82F6] w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                      <span>Highlight Stripped Specks</span>
                      <input
                        type="checkbox"
                        checked={settings.showParticleOverlay}
                        onChange={(e) =>
                          updateSettings({ showParticleOverlay: e.target.checked })
                        }
                        className="accent-rose-500 w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                      <span>Compare Uncleaned Halo</span>
                      <input
                        type="checkbox"
                        checked={bypassHaloTweaks}
                        onChange={(e) => setBypassHaloTweaks(e.target.checked)}
                        className="accent-rose-500 w-3.5 h-3.5 rounded"
                      />
                    </label>
                  </div>

                  {assets.length > 1 && (
                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">
                        Switch Loaded Video
                      </div>
                      <select
                        value={activeAsset?.id || ''}
                        onChange={(e) => {
                          onSelectAssetById(e.target.value);
                          setShowViewMenu(false);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                      >
                        {assets.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Compact Zoom Controls */}
            <div className="flex items-center bg-[#070A10] rounded-lg border border-slate-800 px-1 py-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.15, Number((z - 0.25).toFixed(2))))}
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(8, Number((z + 0.25).toFixed(2))))}
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={fitCanvasToViewport}
                className="p-1 text-slate-400 hover:text-white border-l border-slate-800 ml-0.5 pl-1"
                title="Fit to Viewport"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Spacious Central Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasPointerDown}
        onMouseMove={handleCanvasPointerMove}
        onMouseUp={handleCanvasPointerUp}
        onMouseLeave={handleCanvasPointerUp}
        style={currentStep >= 3 && frames.length > 0 ? bd.style : undefined}
        className={`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${
          currentStep >= 3 && frames.length > 0 ? bd.className : 'bg-[#0B0F19]'
        } ${
          clickTool !== 'pan'
            ? 'cursor-crosshair'
            : isDraggingSplit
            ? 'cursor-ew-resize'
            : isDraggingPan
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
      >
        {/* STAGE 1: CLEAN STARTUP UPLOAD WINDOW (Matches Reference Image!) */}
        {currentStep === 1 && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl mx-6 flex flex-col items-center text-center"
          >
            <h2 className="text-2xl font-bold text-white">Upload Your Video</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Upload an AI-generated character video to begin
            </p>

            <div
              onClick={onPickLocalFiles}
              className="w-full py-14 px-8 rounded-2xl bg-[#0D131F]/80 hover:bg-[#111827] border-2 border-dashed border-slate-800 hover:border-[#3B82F6] transition-all cursor-pointer flex flex-col items-center justify-center group"
            >
              <div className="w-16 h-16 rounded-full bg-[#3B82F6]/15 flex items-center justify-center text-[#3B82F6] group-hover:scale-105 transition-transform mb-4">
                <Upload className="w-7 h-7" />
              </div>
              <div className="text-lg font-bold text-white">Drop your video here</div>
              <div className="text-xs text-slate-400 mt-1 mb-4">or click to browse</div>
              <div className="text-[11px] text-slate-500">
                Supports MP4, WebM, MOV · Instant Load · Privacy-First Local Processing
              </div>
            </div>

            {/* Optional Discrete Sample Video Drawer */}
            <div className="mt-5 w-full">
              <button
                type="button"
                onClick={() => setShowArsenalDrawer(!showArsenalDrawer)}
                className="mx-auto px-3.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <Film className="w-3.5 h-3.5 text-sky-400" />
                <span>Or load a test video from your Arsenal</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showArsenalDrawer && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-left">
                  {USER_ARSENAL_VIDEOS.map((vid) => (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => onSelectArsenalVideo(vid)}
                      className="p-2.5 rounded-xl bg-[#0D131F] hover:bg-slate-800 border border-slate-800 hover:border-[#3B82F6]/60 transition-all flex items-start gap-2.5"
                    >
                      <Film className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {vid.title}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {vid.subtitle}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STAGE 2: NATIVE VIDEO LOOP PREVIEW PLAYER */}
        {currentStep === 2 && activeAsset?.sourceUrl && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-2xl mx-6 flex flex-col items-center"
          >
            <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl flex items-center justify-center">
              <video
                ref={loopVideoRef}
                src={activeAsset.sourceUrl}
                autoPlay
                loop
                muted
                playsInline
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.currentTime >= winEndSec || v.currentTime < winStartSec) {
                    v.currentTime = winStartSec;
                  }
                }}
                className="max-h-[56vh] w-auto object-contain"
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/85 border border-slate-800 text-xs font-mono text-sky-400">
                Loop Preview: {winStartSec.toFixed(2)}s → {winEndSec.toFixed(2)}s (
                {(winEndSec - winStartSec).toFixed(2)}s)
              </div>
            </div>
          </div>
        )}

        {/* STAGE 3 WHEN NO FRAMES EXTRACTED YET OR EXTRACTING WITH PROGRESS BAR */}
        {currentStep === 3 && (frames.length === 0 || isExtractingFrames) && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-6 p-7 rounded-2xl bg-[#0D131F] border border-slate-800 shadow-2xl text-center space-y-4"
          >
            {isExtractingFrames ? (
              <>
                <Loader2 className="w-9 h-9 text-[#3B82F6] animate-spin mx-auto" />
                <div className="text-base font-bold text-white">
                  Extracting High-Res Frames...
                </div>
                {extractionProgress && (
                  <div className="space-y-2">
                    <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                      <div
                        style={{
                          width: `${Math.round(
                            (extractionProgress.current /
                              Math.max(1, extractionProgress.total)) *
                              100
                          )}%`,
                        }}
                        className="h-full bg-[#3B82F6] transition-all duration-150"
                      />
                    </div>
                    <div className="text-xs font-mono text-sky-400">
                      Frame {extractionProgress.current} of {extractionProgress.total} (
                      {Math.round(
                        (extractionProgress.current /
                          Math.max(1, extractionProgress.total)) *
                          100
                      )}
                      %)
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
                  <Scissors className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Ready to Extract {estimatedFrames} Frames
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Selected Loop: {winStartSec.toFixed(2)}s to {winEndSec.toFixed(2)}s at{' '}
                    {winFps} FPS
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExtractFramesNow}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Extract {estimatedFrames} Frames Now</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* STAGES 3–7: CLEAN INTERACTIVE SPRITE & SPRITE SHEET STAGE */}
        {currentStep >= 3 && frames.length > 0 && !isExtractingFrames && (
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            className="relative shadow-2xl border border-slate-700/30"
          >
            <canvas
              ref={stageCanvasRef}
              style={{
                imageRendering: settings.edgeMode === 'pixel_art_hard' ? 'pixelated' : 'auto',
              }}
              className="block max-w-none"
            />
          </div>
        )}

        {/* Active Click Tool Helper Banner */}
        {clickTool !== 'pan' && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-4 bg-slate-950/95 border border-amber-500/80 px-3.5 py-2 rounded-lg text-xs text-slate-200 flex items-center gap-3 shadow-lg"
          >
            {clickTool === 'punch_hole' && (
              <span>
                <strong className="text-rose-400">Punch Local Pocket:</strong> Click any
                enclosed gap or local shadow block ({hoveredColorHex || 'auto'}) to flood-erase
                that local shade across frames.
              </span>
            )}
            {clickTool === 'protect_spot' && (
              <span>
                <strong className="text-emerald-400">Protect Local Area:</strong> Click any
                inner character region to keep its local shade solid across frames.
              </span>
            )}
            {clickTool === 'add_bg_shade' && (
              <span>
                <strong className="text-sky-400">Add BG Shade / Shadow:</strong> Click any
                shadow or secondary background color on stage ({hoveredColorHex || '...'}) to
                remove it globally.
              </span>
            )}
            {clickTool === 'erase_particle' && (
              <span>
                <strong className="text-amber-400">Zap Loose Speck:</strong> Click any
                floating speck to strip it so it never shifts the character.
              </span>
            )}
            {clickTool === 'eyedropper' && (
              <span>
                <strong className="text-sky-400">Pick Primary BG Color:</strong> Click
                background on stage ({hoveredColorHex || settings.keyColor}).
              </span>
            )}
            <button
              type="button"
              onClick={() => setClickTool('pan')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-medium"
            >
              Done
            </button>
          </div>
        )}

        {/* Split Loupe Slider Overlay */}
        {displayMode === 'split_compare' && clickTool === 'pan' && currentStep >= 3 && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-4 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 flex items-center gap-3"
          >
            <span>Left: Original</span>
            <span className="text-slate-600">·</span>
            <span className="text-sky-400 font-semibold">Right: Cleaned</span>
            <input
              type="range"
              min={5}
              max={95}
              value={splitPosition}
              onChange={(e) => setSplitPosition(Number(e.target.value))}
              className="studio-slider w-24 ml-1"
            />
          </div>
        )}
      </div>
    </div>
  );
};
