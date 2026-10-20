import JSZip from 'jszip';

export interface LocalFileResult {
  file: File;
  handle?: FileSystemFileHandle;
}

export interface DirectoryMountResult {
  directoryName: string;
  directoryHandle?: FileSystemDirectoryHandle;
  files: LocalFileResult[];
  usingNativeFS: boolean;
}

const SUPPORTED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.png', '.webp', '.jpg', '.jpeg', '.gif'];

function isSupportedAsset(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Opens local image or video files using the Browser File System Access API
 * (`window.showOpenFilePicker`) when available and permitted by context,
 * automatically falling back to a seamless `<input type="file">` picker in cross-origin iframes.
 */
export async function pickLocalAssetFiles(): Promise<{
  files: LocalFileResult[];
  usingNativeFS: boolean;
}> {
  if ('showOpenFilePicker' in window) {
    try {
      const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Game Assets (Videos & Sprite Images)',
            accept: {
              'video/*': ['.mp4', '.webm', '.mov'],
              'image/*': ['.png', '.webp', '.jpg', '.jpeg', '.gif'],
            },
          },
        ],
      });
      const results: LocalFileResult[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        if (isSupportedAsset(file.name)) {
          results.push({ file, handle });
        }
      }
      return { files: results, usingNativeFS: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { files: [], usingNativeFS: true };
      }
      // SecurityError in sandboxed iframe: fallback to standard input
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/mp4,video/webm,video/quicktime,image/png,image/webp,image/jpeg,image/gif';
    input.onchange = () => {
      const list = Array.from(input.files || []);
      resolve({
        files: list.filter((f) => isSupportedAsset(f.name)).map((file) => ({ file })),
        usingNativeFS: false,
      });
    };
    input.oncancel = () => resolve({ files: [], usingNativeFS: false });
    input.click();
  });
}

/**
 * Mounts a local directory of game assets using `window.showDirectoryPicker`
 * for batch processing and direct local write-back, with fallback to `webkitdirectory`.
 */
export async function mountLocalAssetDirectory(): Promise<DirectoryMountResult | null> {
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      const files: LocalFileResult[] = [];
      for await (const entry of (dirHandle as any).values()) {
        if (entry.kind === 'file' && isSupportedAsset(entry.name)) {
          const file = await entry.getFile();
          files.push({ file, handle: entry });
        }
      }
      return {
        directoryName: dirHandle.name,
        directoryHandle: dirHandle,
        files,
        usingNativeFS: true,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      // Fallback below if blocked by iframe policy
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as any).webkitdirectory = true;
    input.onchange = () => {
      const list = Array.from(input.files || []).filter((f) => isSupportedAsset(f.name));
      if (list.length === 0) {
        resolve(null);
        return;
      }
      const firstPath = (list[0] as any).webkitRelativePath || '';
      const folderName = firstPath.split('/')[0] || 'Local_Asset_Batch';
      resolve({
        directoryName: folderName,
        files: list.map((file) => ({ file })),
        usingNativeFS: false,
      });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG blob from canvas'));
    }, 'image/png');
  });
}

/**
 * Saves a single PNG file using `window.showSaveFilePicker` when supported,
 * or triggers a clean browser download.
 */
export async function saveSinglePngWithFSAPI(
  canvas: HTMLCanvasElement,
  suggestedName: string
): Promise<{ savedViaNativeFS: boolean; fileName: string }> {
  const blob = await canvasToBlob(canvas);

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'PNG Sprite Sheet',
            accept: { 'image/png': ['.png'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { savedViaNativeFS: true, fileName: handle.name || suggestedName };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw err;
      }
      // Fall through to standard download
    }
  }

  triggerBlobDownload(blob, suggestedName);
  return { savedViaNativeFS: false, fileName: suggestedName };
}

/**
 * Exports a complete bundle (Sprite Sheet PNG + Individual Frame PNGs + Engine Metadata JSON)
 * either directly into a mounted FileSystemDirectoryHandle OR as a clean .zip bundle.
 */
export async function exportSpriteBundle(options: {
  baseName: string;
  sheetCanvas: HTMLCanvasElement;
  frameCanvases: { name: string; canvas: HTMLCanvasElement }[];
  metadataJson: string;
  metadataExtension: string;
  directoryHandle?: FileSystemDirectoryHandle;
  preferDirectFolderWrite?: boolean;
}): Promise<{ mode: 'directory_fs' | 'zip_download'; fileCount: number }> {
  const {
    baseName,
    sheetCanvas,
    frameCanvases,
    metadataJson,
    metadataExtension,
    directoryHandle,
    preferDirectFolderWrite,
  } = options;

  const cleanBase = baseName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Direct write via File System Access API Directory Handle if mounted & requested
  if (directoryHandle && preferDirectFolderWrite) {
    try {
      const subDir = await directoryHandle.getDirectoryHandle(`${cleanBase}_export`, {
        create: true,
      });

      // Write Sprite Sheet
      const sheetBlob = await canvasToBlob(sheetCanvas);
      const sheetFileHandle = await subDir.getFileHandle(`${cleanBase}_sheet.png`, { create: true });
      const sheetWritable = await (sheetFileHandle as any).createWritable();
      await sheetWritable.write(sheetBlob);
      await sheetWritable.close();

      // Write Metadata
      const metaFileHandle = await subDir.getFileHandle(
        `${cleanBase}_atlas.${metadataExtension}`,
        { create: true }
      );
      const metaWritable = await (metaFileHandle as any).createWritable();
      await metaWritable.write(new Blob([metadataJson], { type: 'application/json' }));
      await metaWritable.close();

      // Write Frames subfolder
      const framesDir = await subDir.getDirectoryHandle('frames', { create: true });
      for (const f of frameCanvases) {
        const fBlob = await canvasToBlob(f.canvas);
        const fHandle = await framesDir.getFileHandle(`${f.name}.png`, { create: true });
        const fWritable = await (fHandle as any).createWritable();
        await fWritable.write(fBlob);
        await fWritable.close();
      }

      return { mode: 'directory_fs', fileCount: frameCanvases.length + 2 };
    } catch {
      // Fallback to ZIP if directory permission was revoked
    }
  }

  // 2. Package everything into a deterministic ZIP archive
  const zip = new JSZip();
  const sheetBlob = await canvasToBlob(sheetCanvas);
  zip.file(`${cleanBase}_sheet.png`, sheetBlob);
  zip.file(`${cleanBase}_atlas.${metadataExtension}`, metadataJson);

  const framesFolder = zip.folder('frames');
  if (framesFolder) {
    for (const f of frameCanvases) {
      const fBlob = await canvasToBlob(f.canvas);
      framesFolder.file(`${f.name}.png`, fBlob);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(zipBlob, `${cleanBase}_spritesmithy_bundle.zip`);
  return { mode: 'zip_download', fileCount: frameCanvases.length + 2 };
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
