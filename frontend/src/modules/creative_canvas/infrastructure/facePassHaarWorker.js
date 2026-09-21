// Copyright (c) 2026 AI anime
/**
 * 人脸直过的 Haar 兜底与最终绘制 —— 原生 classic worker 源文件。
 *
 * 为什么是 .js 而不是 .ts：
 * opencv.js 是 UMD 构建，只有在能识别 `importScripts` 的 classic worker 里才会把
 * factory 挂到全局。而 Vite 在 dev 下始终把 `?worker` 产出为 module worker
 * （`worker.format` 只影响 build），module worker 不支持 importScripts；
 * CSP 的 script-src 又不含 blob:，无法用 blob/eval 绕行。
 * 因此这里用原生 classic worker 源文件，由 `?url` 引入后 `new Worker(url)` 创建。
 *
 * 几何计算与 domain/facePassGeometry.ts 保持一致（文件末尾导出以便测试比对），
 * 检测与绘制流程与上游 seedance2-real-people/lib/detect-eyes.js 逐项对齐。
 */

const RUNTIME_DEPENDENCY_ROOT = '/api/v1/runtime-dependencies/matte';
const OPENCV_JS_URL = RUNTIME_DEPENDENCY_ROOT + '/opencv/opencv.js';
const OPENCV_WASM_URL = RUNTIME_DEPENDENCY_ROOT + '/opencv/opencv_js.wasm';
const CASCADE_ROOT = RUNTIME_DEPENDENCY_ROOT + '/models/haar';
const CASCADE_FILES = {
  frontal: 'haarcascade_frontalface_default.xml',
  profile: 'haarcascade_profileface.xml',
  eye: 'haarcascade_eye.xml',
};
const OUTPUT_MIME_TYPE = 'image/webp';
const WEBP_QUALITY = 0.8;
const FACE_PASS_MAX_EDGE = 1600;
const FACE_OVER_EYE = 3.2;
const EYE_SIDE_FROM_IOD = 0.55;
const EYE_SIDE_FROM_FACE_RATIO = 0.18;
const MIN_EYE_SIDE = 10;
const MIN_SIZE_LEVEL = 1;
const MAX_SIZE_LEVEL = 10;
const DEFAULT_SIZE_LEVEL = 5;

const RUNTIME_GUIDANCE =
  '人脸直过运行环境未安装或不完整，请前往“设置 > 环境依赖”安装后重试。';

/* ---------- 几何：与 domain/facePassGeometry.ts 一致 ---------- */

function clampFacePassSizeLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SIZE_LEVEL;
  }
  return Math.min(MAX_SIZE_LEVEL, Math.max(MIN_SIZE_LEVEL, Math.round(numeric)));
}

function eyeRectFromLandmark(point, faceBox, otherPoint) {
  const side = otherPoint
    ? Math.max(
        MIN_EYE_SIDE,
        Math.round(
          Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) *
            EYE_SIDE_FROM_IOD,
        ),
      )
    : Math.max(
        MIN_EYE_SIDE,
        Math.round(
          Math.max(faceBox.width, faceBox.height) * EYE_SIDE_FROM_FACE_RATIO,
        ),
      );
  return {
    x: Math.round(point.x - side / 2),
    y: Math.round(point.y - side / 2),
    width: side,
    height: side,
  };
}

function resolveSquareSide(eyeWidth, eyeHeight, sizeLevel, faceWidth, faceHeight) {
  const eyeBase = Math.max(1, Math.max(eyeWidth, eyeHeight) * 1.1);
  const faceBase =
    faceWidth > 0 && faceHeight > 0
      ? Math.max(eyeBase, Math.max(faceWidth, faceHeight) * 0.9)
      : eyeBase * FACE_OVER_EYE;
  const level = clampFacePassSizeLevel(sizeLevel);
  const ratio = (level - 2) / (MAX_SIZE_LEVEL - 2);
  return Math.max(1, Math.round(eyeBase + (faceBase - eyeBase) * ratio));
}

function clampSquare(centerX, centerY, side, imageWidth, imageHeight) {
  let left = Math.round(centerX - side / 2);
  let top = Math.round(centerY - side / 2);
  left = Math.max(0, Math.min(left, imageWidth - side));
  top = Math.max(0, Math.min(top, imageHeight - side));
  const size = Math.min(side, imageWidth - left, imageHeight - top);
  return { x: left, y: top, size: Math.max(1, size) };
}

function resolveBorderThickness(imageWidth, imageHeight) {
  const shortEdge = Math.min(imageWidth, imageHeight);
  return Math.max(2, Math.min(4, Math.round(shortEdge / 400)));
}

function fitWithinMaxEdge(width, height) {
  const longest = Math.max(width, height);
  if (longest <= FACE_PASS_MAX_EDGE) {
    return { width: width, height: height };
  }
  const ratio = FACE_PASS_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** 返回一张脸要遮挡的方块（上游 singleEye 默认只遮右眼）。 */
function buildMaskSquares(face, sizeLevel, imageWidth, imageHeight, singleEye) {
  const landmarks = face.landmarks || [];
  const rightEyePoint = landmarks[0];
  const leftEyePoint = landmarks[1];
  if (!rightEyePoint || !leftEyePoint) {
    return [];
  }
  const rightEye = eyeRectFromLandmark(rightEyePoint, face.box, leftEyePoint);
  const leftEye = eyeRectFromLandmark(leftEyePoint, face.box, rightEyePoint);
  const picks = singleEye ? [rightEye] : [rightEye, leftEye];
  return picks.map(function (eyeRect) {
    return clampSquare(
      eyeRect.x + eyeRect.width / 2,
      eyeRect.y + eyeRect.height / 2,
      resolveSquareSide(
        eyeRect.width,
        eyeRect.height,
        sizeLevel,
        face.box.width,
        face.box.height,
      ),
      imageWidth,
      imageHeight,
    );
  });
}

/* ---------- OpenCV 加载 ---------- */

let cvPromise = null;

function loadCv() {
  if (!cvPromise) {
    cvPromise = (function () {
      try {
        // UMD 会自动执行一次 factory 并把返回值挂到 self.cv；
        // 再用 wasmBinary 显式初始化一次（与上游 Node 用法一致，可同步拿到 API）。
        importScripts(OPENCV_JS_URL);
        const factory = self.cv;
        if (typeof factory !== 'function') {
          throw new Error('opencv.js 未能挂载 factory');
        }
        return fetch(OPENCV_WASM_URL)
          .then(function (response) {
            if (!response.ok) {
              throw new Error('opencv wasm 读取失败：' + response.status);
            }
            return response.arrayBuffer();
          })
          .then(function (wasmBinary) {
            const cv = factory({ wasmBinary: wasmBinary });
            if (typeof cv.Mat !== 'function') {
              throw new Error('OpenCV 运行时初始化失败');
            }
            const names = Object.keys(CASCADE_FILES).map(function (key) {
              return CASCADE_FILES[key];
            });
            return Promise.all(
              names.map(function (filename) {
                return fetch(CASCADE_ROOT + '/' + filename).then(function (res) {
                  if (!res.ok) {
                    throw new Error('级联文件读取失败：' + filename);
                  }
                  return res.arrayBuffer().then(function (buffer) {
                    cv.FS_createDataFile(
                      '/',
                      filename,
                      new Uint8Array(buffer),
                      true,
                      false,
                    );
                    return filename;
                  });
                });
              }),
            ).then(function () {
              return cv;
            });
          });
      } catch (error) {
        const detail = error && error.message ? error.message : String(error);
        return Promise.reject(new Error(RUNTIME_GUIDANCE + detail));
      }
    })();
    cvPromise.catch(function () {
      cvPromise = null;
    });
  }
  return cvPromise;
}

/* ---------- Haar 检测（上游 detect-eyes.js 的对应实现） ---------- */

function rectIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) {
    return 0;
  }
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function centerInside(inner, outer) {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x &&
    cx <= outer.x + outer.width &&
    cy >= outer.y &&
    cy <= outer.y + outer.height
  );
}

function facesShouldMerge(a, b, iouThreshold) {
  return rectIoU(a, b) >= iouThreshold || centerInside(a, b) || centerInside(b, a);
}

function preferFace(a, b) {
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  if (areaA !== areaB) {
    return areaA >= areaB ? a : b;
  }
  return a.source === 'frontal' ? a : b;
}

function mergeFaceRects(list, iouThreshold) {
  const threshold = iouThreshold === undefined ? 0.2 : iouThreshold;
  const kept = [];
  for (const rect of list) {
    let merged = false;
    for (let index = 0; index < kept.length; index += 1) {
      if (facesShouldMerge(rect, kept[index], threshold)) {
        kept[index] = preferFace(kept[index], rect);
        merged = true;
        break;
      }
    }
    if (!merged) {
      kept.push(rect);
    }
  }
  return kept;
}

function preferLargerRect(a, b) {
  return a.width * a.height >= b.width * b.height ? a : b;
}

function mergeEyeRects(list, iouThreshold, maxKeep) {
  const threshold = iouThreshold === undefined ? 0.25 : iouThreshold;
  const keep = maxKeep === undefined ? 2 : maxKeep;
  const kept = [];
  for (const rect of list) {
    let merged = false;
    for (let index = 0; index < kept.length; index += 1) {
      const existing = kept[index];
      if (
        rectIoU(rect, existing) >= threshold ||
        centerInside(rect, existing) ||
        centerInside(existing, rect)
      ) {
        kept[index] = preferLargerRect(existing, rect);
        merged = true;
        break;
      }
    }
    if (!merged) {
      kept.push(rect);
    }
  }
  kept.sort(function (a, b) {
    return b.width * b.height - a.width * a.height;
  });
  return kept.slice(0, keep);
}

function equalizedGray(cv, gray) {
  const equalized = new cv.Mat();
  cv.equalizeHist(gray, equalized);
  return equalized;
}

function detectAllFaces(cv, frontalCascade, profileCascade, gray) {
  const list = [];
  const frontal = new cv.RectVector();
  const profile = new cv.RectVector();
  const profileFlip = new cv.RectVector();
  const flipped = new cv.Mat();
  const equalized = equalizedGray(cv, gray);
  try {
    frontalCascade.detectMultiScale(equalized, frontal, 1.1, 2, 0, new cv.Size(30, 30));
    for (let index = 0; index < frontal.size(); index += 1) {
      const rect = frontal.get(index);
      list.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        source: 'frontal',
      });
    }

    profileCascade.detectMultiScale(equalized, profile, 1.1, 3, 0, new cv.Size(30, 30));
    for (let index = 0; index < profile.size(); index += 1) {
      const rect = profile.get(index);
      list.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        source: 'profile',
      });
    }

    // OpenCV 侧脸级联主要认朝左轮廓，翻转后再检朝右。
    cv.flip(equalized, flipped, 1);
    profileCascade.detectMultiScale(flipped, profileFlip, 1.1, 3, 0, new cv.Size(30, 30));
    for (let index = 0; index < profileFlip.size(); index += 1) {
      const rect = profileFlip.get(index);
      list.push({
        x: gray.cols - rect.x - rect.width,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        source: 'profile',
      });
    }

    return mergeFaceRects(list);
  } finally {
    frontal.delete();
    profile.delete();
    profileFlip.delete();
    flipped.delete();
    equalized.delete();
  }
}

function estimateEyeFromFace(faceRect) {
  const width = Math.max(1, Math.round(faceRect.width * 0.35));
  const height = Math.max(1, Math.round(faceRect.height * 0.22));
  return {
    x: Math.round(faceRect.x + faceRect.width * 0.36 - width / 2),
    y: Math.round(faceRect.y + faceRect.height * 0.36 - height / 2),
    width: width,
    height: height,
  };
}

function estimateEyesNoFace(imageWidth, imageHeight) {
  const halfWidth = Math.round(imageWidth / 2);
  const eyeHeight = Math.round(imageHeight * 0.25);
  const eyeWidth = Math.round(halfWidth * 0.35);
  const y = Math.round(imageHeight * 0.2);
  return [
    {
      x: Math.round(halfWidth * 0.5 - eyeWidth / 2),
      y: y,
      width: eyeWidth,
      height: eyeHeight,
    },
    {
      x: Math.round(halfWidth + halfWidth * 0.5 - eyeWidth / 2),
      y: y,
      width: eyeWidth,
      height: eyeHeight,
    },
  ];
}

/** 上游 maskEye：白底 + 黑边（描边以边界为中心线，与 cv.rectangle 一致）。 */
function maskEye(cv, image, rect, size, faceRect) {
  const side = resolveSquareSide(
    rect.width,
    rect.height,
    size,
    faceRect ? faceRect.width : 0,
    faceRect ? faceRect.height : 0,
  );
  const square = clampSquare(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    side,
    image.cols,
    image.rows,
  );
  const point1 = new cv.Point(square.x, square.y);
  const point2 = new cv.Point(square.x + square.size, square.y + square.size);
  const thickness = resolveBorderThickness(image.cols, image.rows);
  cv.rectangle(image, point1, point2, new cv.Scalar(255, 255, 255, 255), -1);
  cv.rectangle(image, point1, point2, new cv.Scalar(0, 0, 0, 255), thickness);
}

function paintFaceOverlay(cv, image, faceRect) {
  const width = faceRect.width;
  const height = faceRect.height;
  if (width <= 0 || height <= 0) {
    return;
  }
  const overlay = new cv.Mat(
    height,
    width,
    cv.CV_8UC4,
    new cv.Scalar(220, 120, 50, 80),
  );
  try {
    const roi = image.roi(new cv.Rect(faceRect.x, faceRect.y, width, height));
    cv.addWeighted(overlay, 0.45, roi, 0.55, 0, roi);
    roi.delete();
  } finally {
    overlay.delete();
  }
}

function detectEyesInFaces(cv, eyeCascade, faceRects, gray, image, size, singleEye) {
  let count = 0;
  for (const faceRect of faceRects) {
    const bandHeight = Math.max(1, Math.round(faceRect.height * 0.55));
    const roiGray = gray.roi(
      new cv.Rect(faceRect.x, faceRect.y, faceRect.width, bandHeight),
    );
    const roiEqualized = equalizedGray(cv, roiGray);
    const eyes = new cv.RectVector();
    const rawEyes = [];
    try {
      eyeCascade.detectMultiScale(roiEqualized, eyes, 1.1, 3, 0, new cv.Size(10, 10));
      if (eyes.size() > 0) {
        for (let index = 0; index < eyes.size(); index += 1) {
          const rect = eyes.get(index);
          rawEyes.push({
            x: faceRect.x + rect.x,
            y: faceRect.y + rect.y,
            width: rect.width,
            height: rect.height,
          });
        }
      } else {
        const relaxed = new cv.RectVector();
        eyeCascade.detectMultiScale(roiEqualized, relaxed, 1.1, 1, 0, new cv.Size(5, 5));
        for (let index = 0; index < relaxed.size(); index += 1) {
          const rect = relaxed.get(index);
          rawEyes.push({
            x: faceRect.x + rect.x,
            y: faceRect.y + rect.y,
            width: rect.width,
            height: rect.height,
          });
        }
        relaxed.delete();
      }

      const merged = mergeEyeRects(rawEyes, 0.25, singleEye ? 1 : 2);
      if (merged.length === 0) {
        maskEye(cv, image, estimateEyeFromFace(faceRect), size, faceRect);
        count += 1;
      } else {
        for (const rect of merged) {
          maskEye(cv, image, rect, size, faceRect);
          count += 1;
        }
      }
    } finally {
      roiGray.delete();
      roiEqualized.delete();
      eyes.delete();
    }
  }
  return count;
}

function detectEyesOnImage(cv, eyeCascade, gray, image, size) {
  let count = 0;
  const equalized = equalizedGray(cv, gray);
  try {
    const eyes = new cv.RectVector();
    eyeCascade.detectMultiScale(equalized, eyes, 1.1, 3, 0, new cv.Size(20, 20));
    if (eyes.size() > 0) {
      for (let index = 0; index < eyes.size(); index += 1) {
        maskEye(cv, image, eyes.get(index), size, null);
        count += 1;
      }
      eyes.delete();
      return count;
    }
    eyes.delete();

    const relaxed = new cv.RectVector();
    eyeCascade.detectMultiScale(equalized, relaxed, 1.05, 1, 0, new cv.Size(5, 5));
    const relaxedRects = [];
    for (let index = 0; index < relaxed.size(); index += 1) {
      relaxedRects.push(relaxed.get(index));
    }
    relaxed.delete();

    if (relaxedRects.length > 0) {
      relaxedRects.sort(function (a, b) {
        return b.width * b.height - a.width * a.height;
      });
      for (const rect of relaxedRects.slice(0, 2)) {
        maskEye(cv, image, rect, size, null);
        count += 1;
      }
      return count;
    }

    for (const rect of estimateEyesNoFace(gray.cols, gray.rows)) {
      maskEye(cv, image, rect, size, null);
      count += 1;
    }
    return count;
  } finally {
    equalized.delete();
  }
}

/* ---------- 主流程 ---------- */

function drawSquares(cv, image, squares) {
  for (const square of squares) {
    const point1 = new cv.Point(square.x, square.y);
    const point2 = new cv.Point(square.x + square.size, square.y + square.size);
    const thickness = resolveBorderThickness(image.cols, image.rows);
    cv.rectangle(image, point1, point2, new cv.Scalar(255, 255, 255, 255), -1);
    cv.rectangle(image, point1, point2, new cv.Scalar(0, 0, 0, 255), thickness);
  }
}

async function compose(request) {
  const cv = await loadCv();
  const bitmap = await createImageBitmap(request.blob, {
    imageOrientation: 'from-image',
    // 上游用 sharp 解码且不做色彩管理，这里同样禁用，避免灰度值偏移。
    colorSpaceConversion: 'none',
  });
  try {
    const target = fitWithinMaxEdge(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法初始化画布');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const imageData = context.getImageData(0, 0, target.width, target.height);
    const image = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    try {
      cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);

      const frontalCascade = new cv.CascadeClassifier();
      const profileCascade = new cv.CascadeClassifier();
      const eyeCascade = new cv.CascadeClassifier();
      if (!frontalCascade.load('/' + CASCADE_FILES.frontal)) {
        throw new Error('人脸模型加载失败');
      }
      if (!profileCascade.load('/' + CASCADE_FILES.profile)) {
        throw new Error('侧脸模型加载失败');
      }
      if (!eyeCascade.load('/' + CASCADE_FILES.eye)) {
        throw new Error('眼睛模型加载失败');
      }

      const options = request.options;
      const singleEye = options.singleEye !== false;
      const size = options.size;
      let eyeCount = 0;

      if (options.detector === 'onnx') {
        // 第 1 轮：YuNet 五点关键点逐脸遮挡。
        for (const face of request.yunetFaces) {
          const squares = buildMaskSquares(
            face,
            size,
            image.cols,
            image.rows,
            singleEye,
          );
          drawSquares(cv, image, squares);
          eyeCount += squares.length;
        }

        // 第 2 轮：Haar 人脸兜底（双保险），只处理 YuNet 未覆盖的脸。
        const haarFaces = detectAllFaces(cv, frontalCascade, profileCascade, gray);
        // 注意：上游把「中心点」对象直接当作 inner 传给 centerInside，而 centerInside
        // 内部会再取一次 inner.width / 2；中心点没有 width，相加得到 NaN，比较恒为
        // false，于是 **Haar 检出的脸一律不会被过滤**。这是上游的既有行为，
        // 这里如实复刻（曾按「修正」写法传入 0 宽高，结果与上游不一致）。
        const extraFaces = haarFaces.filter(function (candidate) {
          const center = {
            x: candidate.x + candidate.width / 2,
            y: candidate.y + candidate.height / 2,
          };
          return !request.yunetFaces.some(function (face) {
            return centerInside(center, {
              x: face.box.x,
              y: face.box.y,
              width: face.box.width,
              height: face.box.height,
            });
          });
        });

        if (extraFaces.length > 0) {
          for (const face of extraFaces) {
            paintFaceOverlay(cv, image, face);
          }
          eyeCount += detectEyesInFaces(
            cv,
            eyeCascade,
            extraFaces,
            gray,
            image,
            size,
            singleEye,
          );
        }
      } else if (!options.noFace) {
        const faces = detectAllFaces(cv, frontalCascade, profileCascade, gray);
        if (faces.length > 0) {
          eyeCount += detectEyesInFaces(
            cv,
            eyeCascade,
            faces,
            gray,
            image,
            size,
            singleEye,
          );
        } else {
          eyeCount += detectEyesOnImage(cv, eyeCascade, gray, image, size);
        }
      } else {
        eyeCount += detectEyesOnImage(cv, eyeCascade, gray, image, size);
      }

      context.putImageData(
        new ImageData(new Uint8ClampedArray(image.data), image.cols, image.rows),
        0,
        0,
      );
      const blob = await canvas.convertToBlob({
        type: OUTPUT_MIME_TYPE,
        quality: WEBP_QUALITY,
      });
      return {
        blob: blob,
        faceCount: options.detector === 'onnx' ? request.yunetFaces.length : 0,
        eyeCount: eyeCount,
      };
    } finally {
      image.delete();
      gray.delete();
    }
  } finally {
    bitmap.close();
  }
}

/* ---------- Worker 入口 ---------- */

async function handleMessage(event) {
  const request = event.data;
  if (!request || request.type !== 'compose') {
    return;
  }
  try {
    const result = await compose(request);
    self.postMessage({
      type: 'result',
      id: request.id,
      blob: result.blob,
      faceCount: result.faceCount,
      eyeCount: result.eyeCount,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      message: error && error.message ? error.message : String(error),
    });
  }
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = handleMessage;
}

// 供 facePassHaarWorker.test.ts 用 require 载入并与 domain/facePassGeometry.ts
// 逐函数比对；classic worker 里没有 module，此分支不会执行。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clampFacePassSizeLevel: clampFacePassSizeLevel,
    eyeRectFromLandmark: eyeRectFromLandmark,
    resolveSquareSide: resolveSquareSide,
    clampSquare: clampSquare,
    resolveBorderThickness: resolveBorderThickness,
    fitWithinMaxEdge: fitWithinMaxEdge,
    buildMaskSquares: buildMaskSquares,
  };
}
