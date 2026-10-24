import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Film,
  Grid,
  Layers,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Scissors,
  SlidersHorizontal,
  Sparkles,
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
  TargetSpriteResolution,
  WizardStep,
} from '../types/sprite';
import { USER_ARSENAL_VIDEOS } from '../utils/demoAssets';
import { rgbToHex } from '../utils/imageProcessor';
import { SIX_STAGES } from './HaloControlSidebar';

export type ViewportDisplayMode =
  | 'processed'
  | 'split_compare'
  | 'halo_heatmap'
  | 'live_export_player'
  | 'packed_sheet';

interface CanvasViewportProps {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  assets: BatchAssetItem[];
  activeAsset: BatchAssetItem | null;
  onSelectAssetById: (id: string) => void;
  winStartSec: number;
  setWinStartSec: (v: number) => void;
  winEndSec: number;
  setWinEndSec: (v: number) => void;
  winFps: number;
  setWinFps: (v: number) => void;
  isExtractingFrames: boolean;
  extractionProgress: { current: number; total: number } | null;
  workerProgress?: { completed: number; total: number } | null;
  onExtractFramesNow: () => void;
  onRunV2ZeroTouchNow: () => void;
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
  setWinStartSec,
  winEndSec,
  setWinEndSec,
  winFps,
  setWinFps,
  isExtractingFrames,
  extractionProgress,
  workerProgress,
  onExtractFramesNow,
  onRunV2ZeroTouchNow,
  activeFrameIndex,
  setActiveFrameIndex,
  isPlaying,
  setIsPlaying,
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

  // Live Export Sprite Player States (Stage 6 — Full-Stage & Zoomable)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showOnionSkin, setShowOnionSkin] = useState<boolean>(false);
  const [showPlayerGroundLine, setShowPlayerGroundLine] = useState<boolean>(true);
  const [playerScaleMode, setPlayerScaleMode] = useState<'fit' | number>('fit');
  const [playerPan, setPlayerPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPlayerPan, setIsDraggingPlayerPan] = useState<boolean>(false);
  const [playerDragStart, setPlayerDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [showMiniSheetDrawer, setShowMiniSheetDrawer] = useState<boolean>(false);
  const playerStageRef = useRef<HTMLDivElement | null>(null);
  const [playerStageHeight, setPlayerStageHeight] = useState<number>(560);

  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const livePlayerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniSheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loopVideoRef = useRef<HTMLVideoElement | null>(null);

  const frames = activeAsset?.frames || [];
  const safeFrameIdx = Math.min(Math.max(0, activeFrameIndex), Math.max(0, frames.length - 1));
  const currentFrame: ExtractedFrame | undefined = frames[safeFrameIdx];

  const stageMeta = SIX_STAGES.find((s) => s.step === currentStep) || SIX_STAGES[0];

  // Active indices inside the selected loop range
  const activeIndices: number[] = [];
  frames.forEach((f, idx) => {
    const start = activeAsset?.loopStartFrame ?? 0;
    const end = activeAsset?.loopEndFrame ?? frames.length - 1;
    if (f.enabled && idx >= start && idx <= end) {
      activeIndices.push(idx);
    }
  });
  const effectiveActiveIndices =
    activeIndices.length > 0 ? activeIndices : frames.map((_, i) => i);
  const currentNormOrdinal = Math.max(
    0,
    effectiveActiveIndices.indexOf(safeFrameIdx)
  );

  // Fit canvas to viewport
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

  // Measure Live Player Stage so 'fit' mode fills the entire available viewport area
  useEffect(() => {
    const el = playerStageRef.current;
    if (!el) return;
    const updateSize = () => {
      const minDim = Math.min(el.clientWidth, el.clientHeight);
      if (minDim > 120) {
        setPlayerStageHeight(Math.max(320, minDim - 24));
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [displayMode, currentStep, showMiniSheetDrawer]);

  // When entering Stage 6 (Preview & Export), default to the Live Animated Sprite Player!
  useEffect(() => {
    setShowViewMenu(false);
    if (currentStep === 6) {
      setDisplayMode('live_export_player');
      setIsPlaying(true);
      setPlayerScaleMode('fit');
      setPlayerPan({ x: 0, y: 0 });
    } else if (
      displayMode === 'live_export_player' ||
      displayMode === 'packed_sheet'
    ) {
      setDisplayMode('processed');
      setZoom(1.2);
      setPan({ x: 0, y: 0 });
    }
  }, [currentStep]);

  // Keep native <video> in Stage 2 looping smoothly inside [winStartSec, winEndSec]
  useEffect(() => {
    const vid = loopVideoRef.current;
    if (!vid || currentStep !== 2) return;
    if (vid.currentTime < winStartSec || vid.currentTime > winEndSec) {
      vid.currentTime = winStartSec;
    }
  }, [winStartSec, winEndSec, currentStep]);

  // Animation loop for extracted frames (Stages 3–6, including Live Export Player!)
  useEffect(() => {
    if (
      !isPlaying ||
      frames.length <= 1 ||
      currentStep <= 2 ||
      displayMode === 'packed_sheet'
    ) {
      return;
    }

    const effectiveFps = Math.max(1, settings.videoFps * playbackSpeed);
    const intervalMs = Math.max(20, Math.round(1000 / effectiveFps));
    const timer = window.setInterval(() => {
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
      setActiveFrameIndex(next);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    frames,
    safeFrameIdx,
    settings.videoFps,
    playbackSpeed,
    activeAsset?.loopStartFrame,
    activeAsset?.loopEndFrame,
    currentStep,
    displayMode,
    setActiveFrameIndex,
  ]);

  // Render Live Export Player Canvas & Mini Sprite Sheet Inspector (when displayMode === 'live_export_player')
  useEffect(() => {
    if (displayMode !== 'live_export_player' || !activeAsset) return;

    const normList = activeAsset.outputNormalizedFrames || [];
    const playerCanvas = livePlayerCanvasRef.current;
    if (playerCanvas) {
      const ctx = playerCanvas.getContext('2d');
      if (ctx) {
        const currNorm =
          normList[currentNormOrdinal]?.canvas ||
          currentFrame?.processedCanvas ||
          currentFrame?.sourceCanvas;

        if (currNorm) {
          const cw = currNorm.width;
          const ch = currNorm.height;
          playerCanvas.width = cw;
          playerCanvas.height = ch;
          ctx.clearRect(0, 0, cw, ch);

          if (settings.edgeMode === 'pixel_art_hard') {
            ctx.imageSmoothingEnabled = false;
          } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }

          // Optional Onion Skin (previous frame ghost at 22% opacity to verify zero jitter)
          if (showOnionSkin && normList.length > 1) {
            const prevOrd =
              (currentNormOrdinal - 1 + normList.length) % normList.length;
            const prevCanvas = normList[prevOrd]?.canvas;
            if (prevCanvas) {
              ctx.save();
              ctx.globalAlpha = 0.22;
              ctx.drawImage(prevCanvas, 0, 0);
              ctx.restore();
            }
          }

          // Draw current normalized, foot-locked sprite frame
          ctx.drawImage(currNorm, 0, 0);

          // Optional Ground Baseline & Center-of-Mass Crosshair overlay
          if (showPlayerGroundLine) {
            const padY = Math.max(2, Math.round(settings.padding));
            const groundY = ch - padY;
            const centerX = Math.round(cw / 2);

            ctx.save();
            // Vertical Center-of-Mass axis
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, ch);
            ctx.stroke();

            // Horizontal Foot Baseline row
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.78)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(8, groundY);
            ctx.lineTo(cw - 8, groundY);
            ctx.stroke();

            // Baseline anchor tick
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(centerX, groundY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // Render interactive Packed Sprite Sheet preview with active frame highlight
    const miniSheet = miniSheetCanvasRef.current;
    const sheetSrc = activeAsset.outputSheetCanvas;
    if (miniSheet && sheetSrc) {
      miniSheet.width = sheetSrc.width;
      miniSheet.height = sheetSrc.height;
      const sCtx = miniSheet.getContext('2d');
      if (sCtx) {
        sCtx.clearRect(0, 0, miniSheet.width, miniSheet.height);
        sCtx.drawImage(sheetSrc, 0, 0);

        const count = Math.max(1, normList.length);
        const cellW = activeAsset.outputCellWidth || normList[0]?.canvas.width || 256;
        const cellH = activeAsset.outputCellHeight || normList[0]?.canvas.height || 256;
        const spacing = settings.sheetSpacing;

        let cols = settings.sheetColumns;
        if (settings.sheetLayout === 'horizontal_strip') cols = count;
        else if (settings.sheetLayout === 'vertical_strip') cols = 1;
        else if (settings.sheetLayout === 'pot_packed')
          cols = Math.ceil(Math.sqrt(count));
        cols = Math.max(1, Math.min(count, cols));

        const col = currentNormOrdinal % cols;
        const row = Math.floor(currentNormOrdinal / cols);
        const hx = col * (cellW + spacing);
        const hy = row * (cellH + spacing);

        sCtx.save();
        sCtx.strokeStyle = '#10B981';
        sCtx.lineWidth = Math.max(3, Math.round(sheetSrc.width / 260));
        sCtx.strokeRect(hx + 1, hy + 1, cellW - 2, cellH - 2);
        sCtx.restore();
      }
    }
  }, [
    displayMode,
    activeAsset,
    currentNormOrdinal,
    currentFrame,
    showOnionSkin,
    showPlayerGroundLine,
    settings.edgeMode,
    settings.padding,
    settings.sheetColumns,
    settings.sheetLayout,
    settings.sheetSpacing,
  ]);

  // Render main stage canvas for Stages 3–5 (and when 'processed' / 'split_compare' / 'packed_sheet' is active)
  useEffect(() => {
    if (displayMode === 'live_export_player') return;
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

    // Draw numbered Pocket Layer pins if user placed any and showPocketMarkers is enabled
    if (
      settings.showPocketMarkers !== false &&
      settings.holeSeeds.length > 0 &&
      displayMode !== 'packed_sheet'
    ) {
      let layerNumber = 0;
      for (const seed of settings.holeSeeds) {
        if (seed.mode === 'punch_hole' || seed.mode === 'protect_spot') {
          layerNumber++;
        }
        if (seed.enabled === false) continue;
        if (
          seed.frameScope === 'single_frame' &&
          seed.targetFrameIndex !== undefined &&
          seed.targetFrameIndex !== safeFrameIdx
        ) {
          continue;
        }
        const px = seed.relX * canvas.width;
        const py = seed.relY * canvas.height;
        const rPin = Math.max(5, 7 / zoom);
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, rPin, 0, Math.PI * 2);
        ctx.fillStyle =
          seed.mode === 'protect_spot'
            ? '#10B981'
            : seed.mode === 'erase_particle'
            ? '#F59E0B'
            : '#EF4444';
        ctx.fill();
        ctx.lineWidth = Math.max(1, 1.4 / zoom);
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        if (seed.mode === 'punch_hole' || seed.mode === 'protect_spot') {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.max(8, Math.round(9 / zoom))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(layerNumber), px, py);
        }
        ctx.restore();
      }
    }

    // Optional Crop, Center-of-Mass (centerX), Foot Baseline (maxY) & Trapped Pocket Guides
    if (showCropGuides && displayMode !== 'packed_sheet') {
      const box = currentFrame.cropBox;
      const core = currentFrame.coreBodyBox || box;

      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = Math.max(1, 1.2 / zoom);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);

      const trappedBoxes = currentFrame.trappedPocketBoxes || [];
      if (trappedBoxes.length > 0) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
        ctx.lineWidth = Math.max(1, 1.3 / zoom);
        for (const tBox of trappedBoxes) {
          ctx.fillRect(tBox.x, tBox.y, tBox.width, tBox.height);
          ctx.strokeRect(tBox.x, tBox.y, tBox.width, tBox.height);
        }
      }

      const anchorX =
        settings.centerStabilization === 'core_grounded'
          ? currentFrame.centerOfMassX ?? core.x + core.width / 2
          : box.x + box.width / 2;
      const anchorY =
        settings.anchorAlignment === 'bottom_center'
          ? settings.centerStabilization === 'core_grounded'
            ? currentFrame.lowestFootY ?? core.y + core.height
            : box.y + box.height
          : settings.centerStabilization === 'core_grounded'
          ? core.y + core.height / 2
          : box.y + box.height / 2;

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = Math.max(1, 1.2 / zoom);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(anchorX, box.y);
      ctx.lineTo(anchorX, box.y + box.height);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.beginPath();
      ctx.moveTo(box.x - 10, anchorY);
      ctx.lineTo(box.x + box.width + 10, anchorY);
      ctx.stroke();
      ctx.setLineDash([]);

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
    settings.showPocketMarkers,
    settings.holeSeeds,
    safeFrameIdx,
    activeAsset?.outputSheetCanvas,
  ]);

  const handleCanvasPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (displayMode === 'live_export_player') return;
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

    if (clickTool === 'pick_pocket_color') {
      const pickedHex = sampleHexAt(relX, relY);
      if (pickedHex) {
        const existing = settings.pocketTargetColors || [];
        if (!existing.some((c) => c.hex === pickedHex)) {
          updateSettings({
            pocketTargetColors: [
              ...existing,
              {
                id: `pcol-${Date.now()}`,
                hex: pickedHex,
                tolerance: settings.localPunchTolerance ?? 24,
              },
            ],
          });
        }
        setClickTool('punch_hole');
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
    if (displayMode === 'live_export_player') return;
    if (
      (clickTool === 'eyedropper' ||
        clickTool === 'add_bg_shade' ||
        clickTool === 'pick_pocket_color' ||
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

  const handleMiniSheetClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeAsset || !miniSheetCanvasRef.current) return;
    const normList = activeAsset.outputNormalizedFrames || [];
    if (normList.length === 0) return;

    const rect = miniSheetCanvasRef.current.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ry = (e.clientY - rect.top) / Math.max(1, rect.height);

    const sheetW = miniSheetCanvasRef.current.width;
    const sheetH = miniSheetCanvasRef.current.height;
    const px = rx * sheetW;
    const py = ry * sheetH;

    const count = normList.length;
    const cellW = activeAsset.outputCellWidth || normList[0]?.canvas.width || 256;
    const cellH = activeAsset.outputCellHeight || normList[0]?.canvas.height || 256;
    const spacing = settings.sheetSpacing;

    let cols = settings.sheetColumns;
    if (settings.sheetLayout === 'horizontal_strip') cols = count;
    else if (settings.sheetLayout === 'vertical_strip') cols = 1;
    else if (settings.sheetLayout === 'pot_packed') cols = Math.ceil(Math.sqrt(count));
    cols = Math.max(1, Math.min(count, cols));

    const col = Math.floor(px / Math.max(1, cellW + spacing));
    const row = Math.floor(py / Math.max(1, cellH + spacing));
    const clickedOrd = row * cols + col;

    if (clickedOrd >= 0 && clickedOrd < effectiveActiveIndices.length) {
      setActiveFrameIndex(effectiveActiveIndices[clickedOrd]);
    }
  };

  const stepActiveFrame = (delta: number) => {
    if (effectiveActiveIndices.length === 0) return;
    setIsPlaying(false);
    const nextOrd =
      (currentNormOrdinal + delta + effectiveActiveIndices.length) %
      effectiveActiveIndices.length;
    setActiveFrameIndex(effectiveActiveIndices[nextOrd]);
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
      {/* Ultra-Slim Stage Header Bar */}
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
          {workerProgress && (
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/40 text-[11px] font-mono text-sky-300 flex items-center gap-1.5 shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
              <span>
                Worker Pool: {workerProgress.completed}/{workerProgress.total} frames
              </span>
            </span>
          )}
        </div>

        {/* Right Controls: Shown when extracted frames exist */}
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
                <span>Frame</span>
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
                  setDisplayMode('live_export_player');
                  setIsPlaying(true);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'live_export_player'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-emerald-300 hover:text-white'
                }`}
                title="Inspect the final normalized, foot-locked sprite playing live before export"
              >
                <Play className="w-3 h-3" />
                <span>Live Sprite Player</span>
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
                <span>Full Sheet</span>
              </button>
            </div>

            {/* Consolidated View Options Dropdown */}
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

            {/* Compact Zoom Controls (for Frame/Sheet canvas) */}
            {displayMode !== 'live_export_player' && (
              <div className="flex items-center bg-[#070A10] rounded-lg border border-slate-800 px-1 py-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) => Math.max(0.15, Number((z - 0.25).toFixed(2))))
                  }
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
                  onClick={() =>
                    setZoom((z) => Math.min(8, Number((z + 0.25).toFixed(2))))
                  }
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
            )}
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
        style={
          currentStep >= 3 &&
          frames.length > 0 &&
          displayMode !== 'live_export_player'
            ? bd.style
            : undefined
        }
        className={`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${
          currentStep >= 3 &&
          frames.length > 0 &&
          displayMode !== 'live_export_player'
            ? bd.className
            : 'bg-[#0B0F19]'
        } ${
          displayMode === 'live_export_player'
            ? 'cursor-default'
            : clickTool !== 'pan'
            ? 'cursor-crosshair'
            : isDraggingSplit
            ? 'cursor-ew-resize'
            : isDraggingPan
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
      >
        {/* STAGE 1: CLEAN STARTUP UPLOAD WINDOW */}
        {currentStep === 1 && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl mx-6 flex flex-col items-center text-center"
          >
            <h2 className="text-2xl font-bold text-white">Upload Your Video</h2>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Drop any 720p/1080p character video — set your initial parameters, inspect the live animated sprite, and export
            </p>

            <div className="mb-4 px-3.5 py-2 rounded-xl bg-emerald-950/35 border border-emerald-500/30 flex flex-wrap items-center justify-center gap-2 text-[11px] text-emerald-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>1. 5% Border K-Means (CIELAB/HSV)</span>
              <span className="text-slate-600">·</span>
              <span>2. Sobel 2σ Trapped Space Punch</span>
              <span className="text-slate-600">·</span>
              <span>3. 3px Linear Color Unmix</span>
              <span className="text-slate-600">·</span>
              <span>4. Foot-Locked Live Sprite Player</span>
            </div>

            <div
              onClick={onPickLocalFiles}
              className="w-full py-12 px-8 rounded-2xl bg-[#0D131F]/80 hover:bg-[#111827] border-2 border-dashed border-slate-800 hover:border-[#3B82F6] transition-all cursor-pointer flex flex-col items-center justify-center group"
            >
              <div className="w-16 h-16 rounded-full bg-[#3B82F6]/15 flex items-center justify-center text-[#3B82F6] group-hover:scale-105 transition-transform mb-4">
                <Upload className="w-7 h-7" />
              </div>
              <div className="text-lg font-bold text-white">Drop your video here</div>
              <div className="text-xs text-slate-400 mt-1 mb-4">
                or click to browse local video file
              </div>
              <div className="text-[11px] text-slate-500">
                Supports 720p/1080p MP4, WebM, MOV · Area-Averaging Supersampled · 100% Local
              </div>
            </div>

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

        {/* STAGE 2: NATIVE VIDEO LOOP PREVIEW + INITIAL PARAMETER CONTROL PANEL */}
        {currentStep === 2 && activeAsset?.sourceUrl && !isExtractingFrames && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-3xl mx-6 flex flex-col items-center gap-3.5"
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
                className="max-h-[38vh] w-auto object-contain"
              />
              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-slate-950/90 border border-slate-800 text-xs font-mono text-sky-400 flex items-center gap-2">
                <span>
                  Window: {winStartSec.toFixed(2)}s → {winEndSec.toFixed(2)}s (
                  {(winEndSec - winStartSec).toFixed(2)}s)
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-amber-400 font-semibold">
                  {estimatedFrames} frames @ {winFps} FPS
                </span>
              </div>

              {activeAsset.bgProfile && (
                <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-slate-950/90 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Auto BG:</span>
                  {activeAsset.bgProfile.clusters.map((c) => (
                    <span
                      key={c.id}
                      style={{ backgroundColor: c.hex }}
                      title={`${c.label}: ${c.hex} (σ=${c.sigmaLab.toFixed(1)})`}
                      className="w-3 h-3 rounded-sm border border-slate-400 inline-block"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* INITIAL PARAMETER CONTROL DECK */}
            <div className="w-full p-4 rounded-2xl bg-[#0D131F] border border-slate-800 shadow-xl space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Initial Parameters & Action Setup</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                      {estimatedFrames} Frames Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Set your action window, frame rate, floor shadow removal & cell size before generating your sprite
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWinStartSec(0);
                    setWinEndSec(Number((activeAsset.videoDurationSec || 4.0).toFixed(2)));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-sky-300"
                >
                  Use Full Video (0.0s – {(activeAsset.videoDurationSec || 4.0).toFixed(2)}s)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* 1. Capture FPS */}
                <div className="bg-[#070A10] p-2.5 rounded-xl border border-slate-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Frame Rate (FPS)</span>
                    <span className="font-mono text-amber-400 font-bold">
                      {winFps} FPS ({estimatedFrames}f)
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[6, 8, 10, 12, 24].map((fpsVal) => (
                      <button
                        key={fpsVal}
                        type="button"
                        onClick={() => {
                          setWinFps(fpsVal);
                          updateSettings({ videoFps: fpsVal });
                        }}
                        className={`py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                          winFps === fpsVal
                            ? 'bg-[#3B82F6] text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fpsVal}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Frame Sequence Mode */}
                <div className="bg-[#070A10] p-2.5 rounded-xl border border-slate-800/90 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Sequence Mode
                  </div>
                  <select
                    value={settings.autoTrimToLoop ? 'auto_loop' : 'full_action'}
                    onChange={(e) =>
                      updateSettings({
                        autoTrimToLoop: e.target.value === 'auto_loop',
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-medium"
                  >
                    <option value="full_action">
                      Keep Full Window ({estimatedFrames} Frames)
                    </option>
                    <option value="auto_loop">
                      Auto-Trim Seamless Loop (IoU)
                    </option>
                  </select>
                </div>

                {/* 3. Target Sprite Cell Size */}
                <div className="bg-[#070A10] p-2.5 rounded-xl border border-slate-800/90 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Sprite Cell Resolution
                  </div>
                  <select
                    value={settings.targetSpriteResolution ?? 256}
                    onChange={(e) =>
                      updateSettings({
                        targetSpriteResolution: Number(
                          e.target.value
                        ) as TargetSpriteResolution,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-emerald-300 font-semibold"
                  >
                    <option value={128}>128×128 Supersampled</option>
                    <option value={256}>256×256 Supersampled</option>
                    <option value={512}>512×512 Supersampled</option>
                    <option value={0}>Native Crop Size</option>
                  </select>
                </div>

                {/* 4. Sprite Sheet Grid Columns */}
                <div className="bg-[#070A10] p-2.5 rounded-xl border border-slate-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Sheet Columns</span>
                    <span className="font-mono text-sky-400 font-bold">
                      {settings.sheetColumns} cols
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[4, 5, 6, 8, 10].map((colVal) => (
                      <button
                        key={colVal}
                        type="button"
                        onClick={() => updateSettings({ sheetColumns: colVal })}
                        className={`py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                          settings.sheetColumns === colVal
                            ? 'bg-[#3B82F6] text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        {colVal}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.removeGroundShadow}
                      onChange={(e) =>
                        updateSettings({ removeGroundShadow: e.target.checked })
                      }
                      className="accent-emerald-500 w-3.5 h-3.5 rounded"
                    />
                    <span className="text-slate-200 font-medium">
                      Remove Ground Floor Shadow Oval
                    </span>
                  </label>

                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070A10] border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.autoPunchTrappedHoles}
                      onChange={(e) =>
                        updateSettings({ autoPunchTrappedHoles: e.target.checked })
                      }
                      className="accent-emerald-500 w-3.5 h-3.5 rounded"
                    />
                    <span className="text-slate-200 font-medium">
                      Sobel 2σ Trapped Space Punch
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={isExtractingFrames}
                    onClick={onExtractFramesNow}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5 text-sky-400" />
                    <span>Extract & Tweak Step-by-Step</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExtractingFrames}
                    onClick={onRunV2ZeroTouchNow}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      Generate & Play Sprite ({estimatedFrames} Frames)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EXTRACTION PROGRESS OVERLAY */}
        {isExtractingFrames && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-6 p-7 rounded-2xl bg-[#0D131F] border border-slate-800 shadow-2xl text-center space-y-4"
          >
            <Loader2 className="w-9 h-9 text-[#3B82F6] animate-spin mx-auto" />
            <div className="text-base font-bold text-white">
              Extracting & Processing High-Res Frames...
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
          </div>
        )}

        {/* LIVE ANIMATED FINAL SPRITE PLAYER & SHEET INSPECTOR (Stage 6 Default & Anytime via 'Live Sprite Player' tab) */}
        {currentStep >= 3 &&
          frames.length > 0 &&
          !isExtractingFrames &&
          displayMode === 'live_export_player' && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full h-full p-2.5 flex gap-3 items-stretch overflow-hidden"
            >
              {/* FULL-STAGE LIVE ANIMATED SPRITE PLAYER (Takes 100% of stage by default!) */}
              <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-[#0D131F] border border-slate-800 shadow-2xl overflow-hidden min-h-0">
                {/* Player Header Bar with Magnification Controls & Backdrop Switcher */}
                <div className="px-4 py-2 bg-[#070A10] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white">
                      Live Animated Sprite Player
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300">
                      {activeAsset?.outputCellWidth || 256}×
                      {activeAsset?.outputCellHeight || 256} px Cell ·{' '}
                      {effectiveActiveIndices.length} Frames
                    </span>
                  </div>

                  {/* Detail Magnification Controls (Fit Stage, 1x, 2x, 3x, 4x + Wheel Zoom) */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerScaleMode('fit');
                          setPlayerPan({ x: 0, y: 0 });
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          playerScaleMode === 'fit'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Fill the entire viewport height so you can clearly see character details"
                      >
                        Fit Stage
                      </button>
                      {[1, 2, 3, 4].map((scaleVal) => (
                        <button
                          key={scaleVal}
                          type="button"
                          onClick={() => {
                            setPlayerScaleMode(scaleVal);
                            setPlayerPan({ x: 0, y: 0 });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
                            playerScaleMode === scaleVal
                              ? 'bg-[#3B82F6] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title={`Magnify sprite ${scaleVal}x (${
                            (activeAsset?.outputCellWidth || 256) * scaleVal
                          }px)`}
                        >
                          {scaleVal}x
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const baseW = activeAsset?.outputCellWidth || 256;
                          const currScale =
                            playerScaleMode === 'fit'
                              ? playerStageHeight / baseW
                              : playerScaleMode;
                          setPlayerScaleMode(
                            Number(Math.min(8, currScale + 0.5).toFixed(2))
                          );
                        }}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Zoom In (+0.5x)"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const baseW = activeAsset?.outputCellWidth || 256;
                          const currScale =
                            playerScaleMode === 'fit'
                              ? playerStageHeight / baseW
                              : playerScaleMode;
                          setPlayerScaleMode(
                            Number(Math.max(0.5, currScale - 0.5).toFixed(2))
                          );
                        }}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Zoom Out (-0.5x)"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Instant Backdrop Switcher */}
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'checker_dark', label: 'Checker' },
                          { id: 'pure_white', label: 'White' },
                          { id: 'void_black', label: 'Black' },
                          { id: 'neon_magenta', label: 'Magenta' },
                        ] as { id: PreviewBackdrop; label: string }[]
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBackdrop(b.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                            backdrop === b.id
                              ? 'bg-[#3B82F6] text-white'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>

                    {/* Optional Collapsible Sheet Atlas Drawer Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowMiniSheetDrawer(!showMiniSheetDrawer)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                        showMiniSheetDrawer
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                      }`}
                      title="Toggle side-by-side Packed Sprite Sheet Atlas drawer"
                    >
                      <Grid className="w-3 h-3" />
                      <span>{showMiniSheetDrawer ? 'Hide Sheet' : 'Sheet Drawer'}</span>
                    </button>
                  </div>
                </div>

                {/* Large Zoomable & Pannable Live Animated Sprite Stage */}
                <div
                  ref={playerStageRef}
                  style={bd.style}
                  onWheel={(e) => {
                    e.preventDefault();
                    const baseW = activeAsset?.outputCellWidth || 256;
                    const currScale =
                      playerScaleMode === 'fit'
                        ? playerStageHeight / baseW
                        : playerScaleMode;
                    const delta = e.deltaY < 0 ? 0.35 : -0.35;
                    const nextScale = Number(
                      Math.max(0.5, Math.min(8.0, currScale + delta)).toFixed(2)
                    );
                    setPlayerScaleMode(nextScale);
                  }}
                  onMouseDown={(e) => {
                    setIsDraggingPlayerPan(true);
                    setPlayerDragStart({
                      x: e.clientX - playerPan.x,
                      y: e.clientY - playerPan.y,
                    });
                  }}
                  onMouseMove={(e) => {
                    if (!isDraggingPlayerPan) return;
                    setPlayerPan({
                      x: e.clientX - playerDragStart.x,
                      y: e.clientY - playerDragStart.y,
                    });
                  }}
                  onMouseUp={() => setIsDraggingPlayerPan(false)}
                  onMouseLeave={() => setIsDraggingPlayerPan(false)}
                  className={`flex-1 min-h-0 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing ${bd.className}`}
                >
                  {(() => {
                    const cellW = activeAsset?.outputCellWidth || 256;
                    const cellH = activeAsset?.outputCellHeight || 256;
                    const aspect = cellW / Math.max(1, cellH);
                    const displayH =
                      playerScaleMode === 'fit'
                        ? playerStageHeight
                        : Math.round(cellH * playerScaleMode);
                    const displayW = Math.round(displayH * aspect);
                    const effectiveMult = Number((displayH / Math.max(1, cellH)).toFixed(1));

                    return (
                      <>
                        <div
                          style={{
                            transform: `translate3d(${playerPan.x}px, ${playerPan.y}px, 0)`,
                          }}
                          className="relative flex items-center justify-center"
                        >
                          <canvas
                            ref={livePlayerCanvasRef}
                            style={{
                              width: `${displayW}px`,
                              height: `${displayH}px`,
                              imageRendering:
                                settings.edgeMode === 'pixel_art_hard' ||
                                effectiveMult >= 2.2
                                  ? 'pixelated'
                                  : 'auto',
                            }}
                            className="block drop-shadow-2xl border border-slate-700/50 rounded-xl"
                          />
                        </div>

                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/85 border border-slate-800 text-[11px] font-mono text-slate-200 pointer-events-none">
                          Frame #{safeFrameIdx + 1} ({currentNormOrdinal + 1} of{' '}
                          {effectiveActiveIndices.length})
                          {currentFrame?.timestampSec !== undefined
                            ? ` · ${currentFrame.timestampSec.toFixed(2)}s`
                            : ''}{' '}
                          · <span className="text-emerald-400">{effectiveMult}x View</span>
                        </div>

                        <div className="absolute bottom-2.5 right-3 px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-400 pointer-events-none">
                          Scroll wheel to zoom (up to 8x) · Drag to pan
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Interactive Playback Scrubber, Speed & Visual Verification Controls */}
                <div className="px-4 py-2.5 bg-[#070A10] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepActiveFrame(-1)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white"
                      title="Previous Frame"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                        isPlaying
                          ? 'bg-[#3B82F6] text-white'
                          : 'bg-emerald-500 text-slate-950'
                      }`}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Play</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => stepActiveFrame(1)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white"
                      title="Next Frame"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Playback Speed Pills */}
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    {[
                      { mult: 0.25, label: '0.25x' },
                      { mult: 0.5, label: '0.5x' },
                      { mult: 1.0, label: '1x' },
                      { mult: 1.5, label: '1.5x' },
                    ].map((sp) => (
                      <button
                        key={sp.mult}
                        type="button"
                        onClick={() => setPlaybackSpeed(sp.mult)}
                        className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                          playbackSpeed === sp.mult
                            ? 'bg-[#3B82F6] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title={`Playback speed ${sp.label} (${Math.round(
                          settings.videoFps * sp.mult
                        )} FPS)`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>

                  {/* Foot-Lock Baseline & Onion Skin Toggles */}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowOnionSkin(!showOnionSkin)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        showOnionSkin
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Overlay previous frame at 22% opacity to verify zero jitter"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Onion Skin</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPlayerGroundLine(!showPlayerGroundLine)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        showPlayerGroundLine
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Show locked ground baseline (maxY) and Center-of-Mass (centerX) axis"
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>Foot Line</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* COLLAPSIBLE PACKED SPRITE SHEET DRAWER (Only shown when 'Sheet Drawer' is toggled on) */}
              {showMiniSheetDrawer && (
                <div className="w-80 xl:w-96 shrink-0 flex flex-col rounded-2xl bg-[#0D131F] border border-slate-800 shadow-2xl overflow-hidden min-h-0">
                  <div className="px-3.5 py-2 bg-[#070A10] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                    <div>
                      <div className="text-xs font-bold text-white">
                        Packed Sprite Sheet Atlas
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {activeAsset?.outputSheetCanvas
                          ? `${activeAsset.outputSheetCanvas.width}×${activeAsset.outputSheetCanvas.height} px · Click cell`
                          : 'Ready to export'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMode('packed_sheet');
                        window.setTimeout(fitCanvasToViewport, 20);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-sky-400 font-medium flex items-center gap-1"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Full Sheet</span>
                    </button>
                  </div>

                  <div
                    style={bd.style}
                    className={`flex-1 min-h-0 flex items-center justify-center p-2.5 overflow-auto ${bd.className}`}
                  >
                    <canvas
                      ref={miniSheetCanvasRef}
                      onClick={handleMiniSheetClick}
                      className="max-w-full max-h-full w-auto h-auto object-contain cursor-pointer border border-slate-700/40 rounded shadow-lg"
                      title="Click any sprite cell on the sheet to jump to that frame in the Live Sprite Player"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

        {/* STAGES 3–6: INTERACTIVE FRAME / SPLIT / FULL-SHEET CANVAS */}
        {currentStep >= 3 &&
          frames.length > 0 &&
          !isExtractingFrames &&
          displayMode !== 'live_export_player' && (
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
                  imageRendering:
                    settings.edgeMode === 'pixel_art_hard' ? 'pixelated' : 'auto',
                }}
                className="block max-w-none"
              />
            </div>
          )}

        {/* Active Click Tool Helper Banner */}
        {clickTool !== 'pan' && displayMode !== 'live_export_player' && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-4 bg-slate-950/95 border border-amber-500/80 px-3.5 py-2 rounded-lg text-xs text-slate-200 flex items-center gap-3 shadow-lg"
          >
            {hoveredColorHex && (
              <span
                style={{ backgroundColor: hoveredColorHex }}
                className="w-4 h-4 rounded border border-white/60 shrink-0"
              />
            )}
            {clickTool === 'punch_hole' && (
              <span>
                <strong className="text-rose-400">Punch Local Pocket (Layered):</strong>{' '}
                Click any enclosed gap ({hoveredColorHex || 'auto'}) to create a Pocket
                Layer.
              </span>
            )}
            {clickTool === 'pick_pocket_color' && (
              <span>
                <strong className="text-rose-400">Pick Pocket Target Color:</strong> Click
                a 2nd or 3rd shade inside a trapped pocket ({hoveredColorHex || '...'}) to
                add it to Punch Local Pocket&apos;s palette.
              </span>
            )}
            {clickTool === 'protect_spot' && (
              <span>
                <strong className="text-emerald-400">Protect Local Area:</strong> Click
                any inner character region to keep its shade 100% solid.
              </span>
            )}
            {clickTool === 'add_bg_shade' && (
              <span>
                <strong className="text-sky-400">Add BG Shade / Shadow:</strong> Click any
                shadow or secondary background color on stage ({hoveredColorHex || '...'}).
              </span>
            )}
            {clickTool === 'erase_particle' && (
              <span>
                <strong className="text-amber-400">Zap Loose Speck:</strong> Click any
                floating speck to strip it across frames.
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
