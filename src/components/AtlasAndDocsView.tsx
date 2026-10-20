import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode, Layers } from 'lucide-react';
import { BatchAssetItem, EngineExportFormat, ProcessingSettings } from '../types/sprite';

interface AtlasAndDocsViewProps {
  activeAsset: BatchAssetItem;
  settings: ProcessingSettings;
  updateSettings: (partial: Partial<ProcessingSettings>) => void;
  onExportCurrentSheetPng: () => void;
  onExportCurrentBundleZip: () => void;
  mode: 'atlas' | 'guide';
}

export const AtlasAndDocsView: React.FC<AtlasAndDocsViewProps> = ({
  activeAsset,
  settings,
  updateSettings,
  onExportCurrentSheetPng,
  onExportCurrentBundleZip,
  mode,
}) => {
  const [copied, setCopied] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const dest = previewCanvasRef.current;
    const src = activeAsset.outputSheetCanvas;
    if (!dest || !src) return;
    dest.width = src.width;
    dest.height = src.height;
    const ctx = dest.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, dest.width, dest.height);
      ctx.drawImage(src, 0, 0);
    }
  }, [activeAsset.outputSheetCanvas, activeAsset]);

  const handleCopyJson = () => {
    if (!activeAsset.outputMetadataJson) return;
    navigator.clipboard.writeText(activeAsset.outputMetadataJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (mode === 'guide') {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <div className="border-b border-slate-800 pb-4 space-y-1">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Halo Removal & High-Resolution Edge Architecture
          </h1>
          <p className="text-sm text-slate-400">
            How SpriteSmithy Pro eliminates post-extraction chroma fringes while preserving crisp
            gaming asset silhouettes locally in your browser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
            <h2 className="text-base font-semibold text-white">
              01. Why Extracted Game Sprites Have Halos
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              When AI video generators or 3D renders anti-alias a character against a solid chroma
              background, boundary pixels are a linear combination of the true sprite color and the
              backdrop color:
            </p>
            <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 font-mono text-xs text-amber-400">
              C_observed = α · C_sprite + (1 - α) · C_backdrop
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Naive chroma keyers only compute opacity α and leave C_observed untouched, producing
              a visible neon green, magenta, or bright halo ring whenever the sprite moves over
              dark game stages.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
            <h2 className="text-base font-semibold text-white">
              02. Mathematical Foreground Color Unmixing
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              SpriteSmithy Pro inverts the compositing equation on every semi-transparent boundary
              pixel to recover the true unmixed foreground RGB before the background was blended:
            </p>
            <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 font-mono text-xs text-sky-400">
              C_sprite = clamp((C_observed - (1 - α) · C_backdrop) / α, 0, 255)
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Combined with YCbCr Chroma Spill Neutralization, metallic armor, semi-transparent
              capes, and weapon trails lose their green/magenta color cast immediately.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
            <h2 className="text-base font-semibold text-white">
              03. Morphological Inward Color Bleed
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Video compression (H.264/WebM 4:2:0 chroma subsampling) smears background color up to
              3–4 pixels inside the silhouette. Our Inward Color Bleed pass propagates confident
              interior opaque RGB values outward into boundary pixels while keeping the sub-pixel
              alpha channel untouched.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              This guarantees 100% halo-free edges without chewing into fine character details like
              antennas, hair strands, or sword blades.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
            <h2 className="text-base font-semibold text-white">
              04. Browser File System Access API Privacy
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              All frame decoding, connected-component island detection, pixel unmixing, and atlas
              packing execute 100% locally in your browser using TypedArrays and HTML5 Canvas.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              By mounting a local folder via the Browser File System Access API, you can batch
              update dozens of game assets and write exported sprite sheets and engine JSON files
              directly back to disk.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Packed Sprite Sheet & Game Engine Atlas Inspector
          </h1>
          <p className="text-sm text-slate-400">
            Normalized bounding boxes, pivot coordinates, and engine-ready JSON metadata for{' '}
            <span className="text-slate-200 font-medium">{activeAsset.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onExportCurrentSheetPng}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Download Sheet PNG</span>
          </button>

          <button
            type="button"
            onClick={onExportCurrentBundleZip}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>Export Full Engine Bundle (.ZIP)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left: Packed Sheet Canvas Preview */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs">
            <span className="font-semibold text-white">Packed Sprite Sheet Preview</span>
            {activeAsset.outputSheetCanvas && (
              <span className="font-mono tabular-nums text-slate-400">
                {activeAsset.outputSheetCanvas.width} × {activeAsset.outputSheetCanvas.height} px ·{' '}
                {activeAsset.frames.filter((f) => f.enabled).length} Frames
              </span>
            )}
          </div>

          <div className="flex-1 min-h-[360px] bg-checkerboard-dark rounded-lg border border-slate-800 p-4 flex items-center justify-center overflow-auto">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-[420px] object-contain shadow-lg"
            />
          </div>
        </div>

        {/* Right: Live Game Engine Metadata JSON */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-white">Engine Atlas Metadata</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={settings.engineFormat}
                onChange={(e) =>
                  updateSettings({ engineFormat: e.target.value as EngineExportFormat })
                }
                className="bg-[#0B0F17] border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
              >
                <option value="unity">Unity TextureImporter</option>
                <option value="godot4">Godot 4 SpriteFrames</option>
                <option value="phaser3">Phaser 3 JSON Atlas</option>
                <option value="gdevelop">GDevelop Object</option>
                <option value="aseprite">Aseprite JSON</option>
              </select>

              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded border border-slate-700 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <pre className="flex-1 max-h-[420px] overflow-auto p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs font-mono tabular-nums text-slate-300 leading-relaxed">
            {activeAsset.outputMetadataJson || '// Generating metadata...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
