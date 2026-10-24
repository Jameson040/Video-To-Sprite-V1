import { AutoCalibratedBgProfile, ProcessingSettings } from '../types/sprite';
import { processSpriteFrameBuffer } from './imageProcessor';

export interface SpriteWorkerRequest {
  taskId: number;
  srcData: Uint8ClampedArray;
  width: number;
  height: number;
  settings: ProcessingSettings;
  frameIndex: number;
  precomputedBgProfile?: AutoCalibratedBgProfile;
}

export interface SpriteWorkerResponse {
  taskId: number;
  outBuffer: ArrayBuffer;
  heatBuffer: ArrayBuffer;
  width: number;
  height: number;
  cropBox: ReturnType<typeof processSpriteFrameBuffer>['cropBox'];
  coreBodyBox: ReturnType<typeof processSpriteFrameBuffer>['coreBodyBox'];
  centerOfMassX: number;
  lowestFootY: number;
  removedParticleBoxes: ReturnType<typeof processSpriteFrameBuffer>['removedParticleBoxes'];
  trappedPocketBoxes: ReturnType<typeof processSpriteFrameBuffer>['trappedPocketBoxes'];
  bgProfile: AutoCalibratedBgProfile;
  metrics: ReturnType<typeof processSpriteFrameBuffer>['metrics'];
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<SpriteWorkerRequest>) => {
  const {
    taskId,
    srcData,
    width,
    height,
    settings,
    frameIndex,
    precomputedBgProfile,
  } = e.data;

  try {
    const res = processSpriteFrameBuffer(
      srcData,
      width,
      height,
      settings,
      frameIndex,
      precomputedBgProfile
    );

    const response: SpriteWorkerResponse = {
      taskId,
      outBuffer: res.outData.buffer as ArrayBuffer,
      heatBuffer: res.heatData.buffer as ArrayBuffer,
      width: res.width,
      height: res.height,
      cropBox: res.cropBox,
      coreBodyBox: res.coreBodyBox,
      centerOfMassX: res.centerOfMassX,
      lowestFootY: res.lowestFootY,
      removedParticleBoxes: res.removedParticleBoxes,
      trappedPocketBoxes: res.trappedPocketBoxes,
      bgProfile: res.bgProfile,
      metrics: res.metrics,
    };

    ctx.postMessage(response, [response.outBuffer, response.heatBuffer]);
  } catch (err: any) {
    ctx.postMessage({
      taskId,
      error: err?.message || 'Worker frame processing error',
    });
  }
};
