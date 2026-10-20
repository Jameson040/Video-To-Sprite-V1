import React from 'react';
import {
  CheckCircle2,
  Download,
  FileImage,
  FileVideo,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { BatchAssetItem, ProcessingSettings } from '../types/sprite';

interface BatchQueuePanelProps {
  assets: BatchAssetItem[];
  activeAssetId: string;
  onSelectAsset: (id: string) => void;
  onRemoveAsset: (id: string) => void;
  onPickLocalFiles: () => void;
  onMountLocalFolder: () => void;
  onBatchProcessAll: () => void;
  onBatchExportAll: () => void;
  isBatchRunning: boolean;
  mountedFolderName: string | null;
  usingNativeFS: boolean;
  settings: ProcessingSettings;
  compactSidebar?: boolean;
}

export const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  assets,
  activeAssetId,
  onSelectAsset,
  onRemoveAsset,
  onPickLocalFiles,
  onMountLocalFolder,
  onBatchProcessAll,
  onBatchExportAll,
  isBatchRunning,
  mountedFolderName,
  usingNativeFS,
  settings,
  compactSidebar = false,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (compactSidebar) {
    return (
      <aside className="w-full lg:w-[270px] shrink-0 bg-[#111827] border-r border-slate-800 flex flex-col h-full">
        {/* Local File System Actions */}
        <div className="p-3.5 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200">Local Asset Queue</h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {assets.length} {assets.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onPickLocalFiles}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium bg-[#0B0F17] hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 transition-colors whitespace-nowrap"
              title="Open local videos or sprite sheets via Browser File System Access API"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Files</span>
            </button>

            <button
              type="button"
              onClick={onMountLocalFolder}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium bg-[#0B0F17] hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 transition-colors whitespace-nowrap"
              title="Mount a local directory for batch sprite processing & direct write-back"
            >
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>Mount Dir</span>
            </button>
          </div>

          {mountedFolderName && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono truncate pt-0.5">
              <HardDrive className="w-3 h-3 shrink-0" />
              <span className="truncate">
                Mounted: /{mountedFolderName} {usingNativeFS ? '(R/W)' : '(Local)'}
              </span>
            </div>
          )}
        </div>

        {/* Asset List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {assets.map((item) => {
            const isSelected = item.id === activeAssetId;
            const firstFrame = item.frames[0];
            const residual = firstFrame?.haloMetrics?.residualHaloScore;

            return (
              <div
                key={item.id}
                onClick={() => onSelectAsset(item.id)}
                className={`group flex items-start justify-between gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-500/80'
                    : 'bg-[#0B0F17] border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {item.type === 'video' || item.name.endsWith('.mp4') || item.name.endsWith('.webm') ? (
                      <FileVideo className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <FileImage className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium text-slate-100 truncate">
                      {item.name}
                    </span>
                  </div>

                  {/* Clean unboxed metadata with · separators */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-400">
                    <span>{item.frames.length}f</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {firstFrame
                        ? `${firstFrame.originalWidth}×${firstFrame.originalHeight}`
                        : '—'}
                    </span>
                    {residual !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            residual <= 8
                              ? 'text-emerald-400'
                              : residual <= 22
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          Halo {residual}%
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {assets.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveAsset(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                    title="Remove asset from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Batch Process Footer */}
        <div className="p-3 bg-[#0B0F17] border-t border-slate-800 space-y-2">
          <button
            type="button"
            disabled={isBatchRunning}
            onClick={onBatchProcessAll}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
          >
            {isBatchRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Batch...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Apply Settings to All ({assets.length})</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onBatchExportAll}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Batch Export All ({assets.length})</span>
          </button>
        </div>
      </aside>
    );
  }

  // Full-Width Batch Pipeline Manager View
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header & File System Access API Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Batch Asset De-Haloing & Local File System Pipeline
          </h1>
          <p className="text-sm text-slate-400">
            Process entire folders of character animations and item sheets locally using the Browser
            File System Access API with zero cloud uploads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onPickLocalFiles}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span>Select Local Files</span>
          </button>

          <button
            type="button"
            onClick={onMountLocalFolder}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4 text-sky-400" />
            <span>Mount Local Asset Directory</span>
          </button>

          <button
            type="button"
            disabled={isBatchRunning}
            onClick={onBatchProcessAll}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
          >
            {isBatchRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Batch Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Run Deterministic Batch ({assets.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Active Pipeline Configuration Summary Bar */}
      <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono tabular-nums">
          <span className="text-slate-100 font-sans font-semibold">Active Batch Recipe:</span>
          <span>Key {settings.keyColor}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>Color Unmix {settings.colorUnmixStrength}%</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>Inward Bleed {settings.innerColorBleedRadius}px</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>Alpha Choke {settings.alphaChoke}px</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>Edge Mode: {settings.edgeMode}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>Engine: {settings.engineFormat.toUpperCase()}</span>
        </div>

        <button
          type="button"
          onClick={onBatchExportAll}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>
            {mountedFolderName && usingNativeFS
              ? `Write All to /${mountedFolderName}`
              : 'Export All Processed Bundles (.ZIP)'}
          </span>
        </button>
      </div>

      {/* High-Density Batch Data Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0B0F17] text-xs font-medium text-slate-400">
              <th className="py-3 px-4">Asset Name</th>
              <th className="py-3 px-4">Detected Key</th>
              <th className="py-3 px-4 text-right">Frames</th>
              <th className="py-3 px-4 text-right">Source Size</th>
              <th className="py-3 px-4 text-right">Atlas Dimensions</th>
              <th className="py-3 px-4 text-right">Residual Halo</th>
              <th className="py-3 px-4 text-right">Edge Crispness</th>
              <th className="py-3 px-4 text-right">Status & Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs">
            {assets.map((asset) => {
              const firstFrame = asset.frames[0];
              const metrics = firstFrame?.haloMetrics;
              const sheet = asset.outputSheetCanvas;

              return (
                <tr
                  key={asset.id}
                  onClick={() => onSelectAsset(asset.id)}
                  className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      {asset.type === 'video' ? (
                        <FileVideo className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <FileImage className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-medium text-slate-100">{asset.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {formatBytes(asset.fileSize)} ·{' '}
                          {asset.fileHandle ? 'Native FileHandle' : 'Local Memory'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono tabular-nums">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: asset.detectedKeyColor || settings.keyColor }}
                        className="w-3.5 h-3.5 rounded border border-slate-600 inline-block"
                      />
                      <span className="text-slate-300">
                        {asset.detectedKeyColor || settings.keyColor}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {asset.frames.filter((f) => f.enabled).length} / {asset.frames.length}
                  </td>

                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {firstFrame
                      ? `${firstFrame.originalWidth}×${firstFrame.originalHeight}px`
                      : '—'}
                  </td>

                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {sheet ? `${sheet.width}×${sheet.height}px` : '—'}
                  </td>

                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {metrics ? (
                      <span
                        className={
                          metrics.residualHaloScore <= 8
                            ? 'text-emerald-400 font-semibold'
                            : metrics.residualHaloScore <= 22
                            ? 'text-amber-400 font-semibold'
                            : 'text-rose-400 font-semibold'
                        }
                      >
                        {metrics.residualHaloScore}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td className="py-3 px-4 text-right font-mono tabular-nums text-sky-400">
                    {metrics ? `${metrics.crispnessIndex}%` : '—'}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{asset.status === 'completed' ? 'Processed' : 'Ready'}</span>
                      </span>
                      {assets.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveAsset(asset.id);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400"
                          title="Remove from batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
