export type KeyingMode =
  | 'v2_auto_kmeans' // V2 Autonomous 3-Cluster CIELAB/HSV Border Profiler + Sobel Trapped Space Punch
  | 'chroma_perceptual'
  | 'luma_key'
  | 'auto_corner'
  | 'off';

export type EdgePreservationMode = 'hd_antialiased' | 'subpixel_crisp' | 'pixel_art_hard';

export type PreviewBackdrop =
  | 'checker_dark'
  | 'checker_light'
  | 'neon_magenta'
  | 'void_black'
  | 'pure_white';

export type AnchorAlignment = 'bottom_center' | 'center' | 'preserve_original';

export type CenterStabilizationMode =
  | 'core_grounded' // Centers on main body Center-of-Mass (centerX) & locks lowest foot pixel (maxY) to unified baseline
  | 'global_locked' // Uses a single unified bounding box across all frames (0px shift for in-place animations)
  | 'per_frame_bounds'; // Tightly crops each frame individually (after loose particles are removed)

export type ParticleFilterMode =
  | 'smart_proximity' // Keeps main character + islands larger than minParticleArea within maxParticleDistance
  | 'main_body_only' // Keeps ONLY the single largest connected component (the character body)
  | 'min_size_only'; // Removes any island smaller than minParticleArea anywhere on canvas

export type SheetLayoutMode = 'grid' | 'horizontal_strip' | 'vertical_strip' | 'pot_packed';

export type EngineExportFormat = 'unity' | 'godot4' | 'phaser3' | 'gdevelop' | 'aseprite';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type CanvasClickTool =
  | 'pan'
  | 'eyedropper'
  | 'add_bg_shade'
  | 'pick_pocket_color'
  | 'punch_hole'
  | 'protect_spot'
  | 'erase_particle';

export type PocketConnectivityMode = '4_way' | '8_way';

export type TargetSpriteResolution = 0 | 128 | 256 | 512; // 0 = Native crop dimensions; 128/256/512 = Area-Averaging Supersampled uniform cell

export interface BgClusterCentroid {
  id: 'bright_bg' | 'midtone_bg' | 'shadow_bg';
  label: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number]; // CIELAB L*, a*, b*
  hsv: [number, number, number]; // HSV H (0..360), S (0..100), V (0..100)
  sigmaLab: number; // Standard deviation in CIELAB space
  sigmaHue: number; // Standard deviation in Hue degrees
  weightPct: number; // Percentage of 5% outer border pixels belonging to this cluster
}

export interface AutoCalibratedBgProfile {
  clusters: [BgClusterCentroid, BgClusterCentroid, BgClusterCentroid];
  overallSigmaLab: number;
  backgroundType: 'solid_chroma' | 'multi_cluster_shadow' | 'complex_scene';
  requiresNeuralRmbg: boolean;
  borderSampleCount: number;
}

export interface SecondaryKeyColor {
  id: string;
  hex: string;
  tolerance: number; // 5 to 60
}

export interface HoleSeedPoint {
  id: string;
  label?: string;
  relX: number; // 0..1 relative to source canvas width
  relY: number; // 0..1 relative to source canvas height
  mode: 'punch_hole' | 'protect_spot' | 'erase_particle';
  enabled?: boolean;
  sampledHex?: string;
  extraColors?: string[];
  useGlobalPocketPalette?: boolean;
  localTolerance?: number;
  maxRadiusPct?: number;
  frameScope?: 'all_frames' | 'single_frame';
  targetFrameIndex?: number;
}

export interface ProcessingSettings {
  // V2 Autonomous Zero-Touch Pipeline Controls
  autonomousV2Mode: boolean;
  autoTrimToLoop: boolean;
  v2SobelBoundaryStrength: number; // 10 to 100 (default 55): Sobel gradient barrier threshold for limb/weapon protection
  v2PocketSigmaMultiplier: number; // 1.0 to 3.5 (default 2.0): 2-sigma CIELAB/HSV threshold for trapped negative space seeds
  v2MaxPocketTextureVariance: number; // 4 to 45 (default 16): Max internal L* variance for a pocket to be verified as background
  v2BoundaryUnmixRadius: number; // 1 to 5 px (default 3 px): 3-pixel boundary ring for linear color unmixing & interior neighbor despill
  targetSpriteResolution: TargetSpriteResolution;

  // Stage 3: Multi-Color Background Keying & Layered Local Pocket Solver
  keyingMode: KeyingMode;
  keyColor: string;
  secondaryKeyColors: SecondaryKeyColor[];
  tolerance: number;
  softness: number;
  chromaWeight: number;
  protectInteriorColors: boolean;
  autoPunchTrappedHoles: boolean;
  maxProtectedDetailArea: number;
  holeColorStrictness: number;

  // Punch Local Pocket — Multi-Color Selection, Options & Layered Editing
  punchUsePrimaryBg: boolean;
  punchUseSampledColor: boolean;
  pocketTargetColors: SecondaryKeyColor[];
  localPunchTolerance: number;
  localPunchRadius: number;
  localPunchEdgeChoke: number;
  localPunchConnectivity: PocketConnectivityMode;
  showPocketMarkers: boolean;
  holeSeeds: HoleSeedPoint[];

  removeCornerWatermark: boolean;
  removeGroundShadow: boolean;

  // Stage 4: Loose Particle Cleaner & Anti-Shift Auto-Crop
  cleanLooseParticles: boolean;
  particleFilterMode: ParticleFilterMode;
  minParticleArea: number;
  maxParticleDistance: number;
  showParticleOverlay: boolean;
  autoCrop: boolean;
  normalizeDimensions: boolean;
  centerStabilization: CenterStabilizationMode;
  padding: number;
  anchorAlignment: AnchorAlignment;
  targetScale: number;

  // Stage 5: Halo Remover & High-Resolution Edge Preservation
  colorUnmixStrength: number;
  deSpillStrength: number;
  innerColorBleedRadius: number;
  alphaChoke: number;
  haloLuminanceClamp: number;
  edgeMode: EdgePreservationMode;
  edgeContrast: number;
  edgeSharpness: number;
  alphaFloor: number;
  outlineWidth: number;
  outlineColor: string;

  // Stage 2: Video Time-Window & Frame Extraction
  videoFps: number;
  maxExtractFrames: number;

  // Stage 6: Preview & Export
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
  sobelProtectedPixels?: number;
  centerOfMassX?: number;
  lowestFootY?: number;
}

export interface ExtractedFrame {
  id: string;
  index: number;
  label: string;
  timestampSec?: number;
  enabled: boolean;
  sourceCanvas: HTMLCanvasElement;
  sourceRgba?: Uint8ClampedArray;
  processedCanvas?: HTMLCanvasElement;
  heatmapCanvas?: HTMLCanvasElement;
  cropBox: BoundingBox;
  coreBodyBox?: BoundingBox;
  centerOfMassX?: number;
  lowestFootY?: number;
  removedParticleBoxes?: BoundingBox[];
  trappedPocketBoxes?: BoundingBox[];
  bgProfile?: AutoCalibratedBgProfile;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  haloMetrics?: HaloMetrics;
  loopSimilarityScore?: number;
  silhouetteIoUScore?: number;
  velocityDiffScore?: number;
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
  bgProfile?: AutoCalibratedBgProfile;
  outputSheetCanvas?: HTMLCanvasElement;
  outputNormalizedFrames?: { name: string; canvas: HTMLCanvasElement }[];
  outputCellWidth?: number;
  outputCellHeight?: number;
  outputMetadataJson?: string;
  processingTimeMs?: number;
  errorMessage?: string;
  loopStartFrame: number;
  loopEndFrame: number;
  bestLoopCandidate?: {
    startIdx: number;
    endIdx: number;
    similarity: number;
    silhouetteIoU?: number;
    velocityDiff?: number;
    loopCost?: number;
  };
}

export interface ProcessingPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  settings: Partial<ProcessingSettings>;
}
