export type KeyingMode = 'chroma_perceptual' | 'luma_key' | 'auto_corner' | 'off';

export type EdgePreservationMode = 'hd_antialiased' | 'subpixel_crisp' | 'pixel_art_hard';

export type PreviewBackdrop =
  | 'checker_dark'
  | 'checker_light'
  | 'neon_magenta'
  | 'void_black'
  | 'pure_white'
  | 'forest_dungeon';

export type AnchorAlignment = 'bottom_center' | 'center' | 'preserve_original';

export type CenterStabilizationMode =
  | 'core_grounded' // Centers on main body core & grounds feet so stray flames/weapons don't shift character
  | 'global_locked' // Uses a single unified bounding box across all frames (0px shift for in-place animations)
  | 'per_frame_bounds'; // Tightly crops each frame individually (after loose particles are removed)

export type ParticleFilterMode =
  | 'smart_proximity' // Keeps main character + islands larger than minParticleArea within maxParticleDistance
  | 'main_body_only' // Keeps ONLY the single largest connected component (the character body)
  | 'min_size_only'; // Removes any island smaller than minParticleArea anywhere on canvas

export type SheetLayoutMode = 'grid' | 'horizontal_strip' | 'vertical_strip' | 'pot_packed';

export type EngineExportFormat = 'unity' | 'godot4' | 'phaser3' | 'gdevelop' | 'aseprite';

export type ExtractionSourceMode = 'frames' | 'sprite_islands' | 'grid_slice';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CanvasClickTool =
  | 'pan'
  | 'eyedropper'
  | 'add_bg_shade'
  | 'punch_hole'
  | 'protect_spot'
  | 'erase_particle';

export interface SecondaryKeyColor {
  id: string;
  hex: string;
  tolerance: number; // 5 to 60
}

export interface HoleSeedPoint {
  id: string;
  relX: number; // 0..1 relative to source canvas width
  relY: number; // 0..1 relative to source canvas height
  mode: 'punch_hole' | 'protect_spot' | 'erase_particle';
  sampledHex?: string; // Color sampled at the click location for localised flood-fill
  localTolerance?: number; // Local flood-fill tolerance (default 22)
}

export interface ProcessingSettings {
  // Stage 4: Multi-Color Background Keying & Localised Pocket Solver
  keyingMode: KeyingMode;
  keyColor: string;
  secondaryKeyColors: SecondaryKeyColor[]; // Additional BG shades / cast shadows to remove conditionally
  tolerance: number; // 0 to 100
  softness: number; // 0 to 100
  chromaWeight: number; // 0 to 100
  protectInteriorColors: boolean;
  autoPunchTrappedHoles: boolean;
  maxProtectedDetailArea: number; // Min enclosed gap size (px²)
  holeColorStrictness: number; // Inner shade tolerance (10 to 100%)
  localPunchTolerance: number; // Localised flood-fill tolerance for Click-to-Punch Pocket (5 to 60%)
  holeSeeds: HoleSeedPoint[];
  removeCornerWatermark: boolean;
  removeGroundShadow: boolean;

  // Stage 5: Loose Particle Cleaner & Anti-Shift Auto-Crop
  cleanLooseParticles: boolean;
  particleFilterMode: ParticleFilterMode;
  minParticleArea: number; // 1 to 600 px²: islands smaller than this are erased as stray specks
  maxParticleDistance: number; // 2 to 120 px: islands farther than this from main character are erased
  showParticleOverlay: boolean; // Highlights detected loose particles in red on canvas for verification
  autoCrop: boolean;
  normalizeDimensions: boolean;
  centerStabilization: CenterStabilizationMode;
  padding: number; // 0 to 32 px
  anchorAlignment: AnchorAlignment;
  targetScale: number; // 0.25 to 1.5

  // Stage 6: Halo Remover & High-Resolution Edge Preservation
  colorUnmixStrength: number; // 0 to 100
  deSpillStrength: number; // 0 to 100
  innerColorBleedRadius: number; // 0 to 8 px
  alphaChoke: number; // -3.0 to +4.0 px
  haloLuminanceClamp: number; // 0 to 100
  edgeMode: EdgePreservationMode;
  edgeContrast: number; // 0 to 100
  edgeSharpness: number; // 0 to 100
  alphaFloor: number; // 0 to 128
  outlineWidth: number; // 0 to 4 px
  outlineColor: string;

  // Stage 2 & 3: Video Time-Window & Frame Extraction
  extractionMode: ExtractionSourceMode;
  videoFps: number; // 4 to 60 FPS
  maxExtractFrames: number; // Up to 120 frames
  islandMinArea: number;
  gridCols: number;
  gridRows: number;

  // Stage 7: Sprite Sheet & Export
  sheetLayout: SheetLayoutMode;
  sheetColumns: number;
  sheetSpacing: number;
  powerOfTwo: boolean;
  engineFormat: EngineExportFormat;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HaloMetrics {
  edgePixelCount: number;
  residualHaloScore: number;
  crispnessIndex: number;
  transparentRatio: number;
  trappedHolesPunched: number;
  looseParticlesRemoved: number;
}

export interface ExtractedFrame {
  id: string;
  index: number;
  label: string;
  timestampSec?: number;
  enabled: boolean;
  sourceCanvas: HTMLCanvasElement;
  processedCanvas?: HTMLCanvasElement;
  heatmapCanvas?: HTMLCanvasElement;
  cropBox: BoundingBox;
  coreBodyBox?: BoundingBox;
  removedParticleBoxes?: BoundingBox[];
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  haloMetrics?: HaloMetrics;
  loopSimilarityScore?: number;
}

export interface VideoSubClipPreset {
  label: string;
  startSec: number;
  endSec: number;
  fps: number;
}

export interface ArsenalVideoPreset {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  url: string;
  defaultStartSec?: number;
  defaultEndSec?: number;
  defaultFps?: number;
  subClips?: VideoSubClipPreset[];
  recommendedSettings: Partial<ProcessingSettings>;
}

export interface BatchAssetItem {
  id: string;
  name: string;
  type: 'video' | 'image_sheet' | 'single_sprite' | 'demo';
  sourceUrl?: string;
  fileSize: number;
  status: 'ready' | 'processing' | 'completed' | 'error';
  progress: number;
  file?: File;
  fileHandle?: FileSystemFileHandle;
  videoDurationSec?: number;
  extractStartSec: number;
  extractEndSec: number;
  extractedAtFps: number;
  frames: ExtractedFrame[];
  detectedKeyColor?: string;
  outputSheetCanvas?: HTMLCanvasElement;
  outputMetadataJson?: string;
  processingTimeMs?: number;
  errorMessage?: string;
  loopStartFrame: number;
  loopEndFrame: number;
  bestLoopCandidate?: {
    startIdx: number;
    endIdx: number;
    similarity: number;
  };
}

export interface ProcessingPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  settings: Partial<ProcessingSettings>;
}
