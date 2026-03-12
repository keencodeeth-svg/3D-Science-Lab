import { ACESFilmicToneMapping, CanvasTexture, ColorRepresentation, MeshPhysicalMaterial, MeshPhysicalMaterialParameters, NoColorSpace, PCFSoftShadowMap, PMREMGenerator, RepeatWrapping, Scene, ShadowMapType, SRGBColorSpace, Texture, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface LabRealismOptions {
  exposure?: number;
  environmentIntensity?: number;
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  sigma?: number;
  shadowType?: ShadowMapType;
  useEnvironmentBackground?: boolean;
}

export interface LabRealismHandle {
  texture: Texture;
  dispose: () => void;
}

type PhysicalOverrides = MeshPhysicalMaterialParameters & {
  color?: ColorRepresentation;
  attenuationColor?: ColorRepresentation;
};

type SurfaceTextureBundle = {
  map?: Texture;
  roughnessMap?: Texture;
  bumpMap?: Texture;
};

const textureCache = new Map<string, SurfaceTextureBundle>();

function pseudoNoise(x: number, y: number, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453123;
  return value - Math.floor(value);
}

function createCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size);
  return canvas;
}

function buildCanvasTexture(canvas: HTMLCanvasElement | null, repeatX: number, repeatY: number, colorTexture: boolean) {
  if (!canvas) return undefined;
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = colorTexture ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getWoodTextures() {
  const cacheKey = 'wood';
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const colorCanvas = createCanvas(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#5c3b25');
    gradient.addColorStop(0.45, '#8d603d');
    gradient.addColorStop(1, '#4e311f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let x = 0; x < size; x += 1) {
      const wave = Math.sin((x / size) * Math.PI * 18 + pseudoNoise(x, 1, 2) * 4.2);
      const alpha = 0.08 + wave * 0.04 + pseudoNoise(x, 3, 7) * 0.06;
      ctx.fillStyle = `rgba(58, 34, 20, ${Math.max(0.02, alpha)})`;
      ctx.fillRect(x, 0, 1, size);
    }

    for (let index = 0; index < 14; index += 1) {
      const cx = pseudoNoise(index, 4, 9) * size;
      const cy = pseudoNoise(index, 7, 11) * size;
      const radius = 8 + pseudoNoise(index, 12, 13) * 22;
      ctx.strokeStyle = `rgba(64, 37, 21, ${0.12 + pseudoNoise(index, 15, 17) * 0.1})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * 0.34, pseudoNoise(index, 19, 23) * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  const roughnessCanvas = createCanvas(256, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const stripe = 132 + Math.sin((x / size) * Math.PI * 20 + pseudoNoise(x, y, 29) * 3) * 30;
        const grain = stripe + pseudoNoise(x, y, 31) * 34;
        const value = Math.max(78, Math.min(214, Math.round(grain)));
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const bumpCanvas = createCanvas(256, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const groove = 126 + Math.sin((x / size) * Math.PI * 24 + pseudoNoise(x, y, 37) * 4.5) * 52;
        const value = Math.max(72, Math.min(220, Math.round(groove + pseudoNoise(x, y, 41) * 18)));
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const textures = {
    map: buildCanvasTexture(colorCanvas, 3.2, 1.2, true),
    roughnessMap: buildCanvasTexture(roughnessCanvas, 3.2, 1.2, false),
    bumpMap: buildCanvasTexture(bumpCanvas, 3.2, 1.2, false),
  } satisfies SurfaceTextureBundle;
  textureCache.set(cacheKey, textures);
  return textures;
}

function getBrushedMetalTextures() {
  const cacheKey = 'brushed-metal';
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const colorCanvas = createCanvas(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#cfd7e2');
    gradient.addColorStop(0.5, '#a9b6c6');
    gradient.addColorStop(1, '#dfe7ef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 1) {
      const alpha = 0.08 + pseudoNoise(1, y, 43) * 0.14;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(0, y, size, 1);
    }

    for (let x = 0; x < size; x += 28) {
      ctx.fillStyle = `rgba(86, 102, 122, ${0.06 + pseudoNoise(x, 9, 47) * 0.08})`;
      ctx.fillRect(x, 0, 1, size);
    }
  });

  const roughnessCanvas = createCanvas(256, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = 112 + pseudoNoise(x, y, 53) * 62 + Math.sin((y / size) * Math.PI * 36) * 10;
        const clamped = Math.max(68, Math.min(214, Math.round(value)));
        const offset = (y * size + x) * 4;
        image.data[offset] = clamped;
        image.data[offset + 1] = clamped;
        image.data[offset + 2] = clamped;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const bumpCanvas = createCanvas(256, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const line = 122 + Math.sin((y / size) * Math.PI * 64 + pseudoNoise(x, y, 59) * 2.6) * 34;
        const value = Math.max(90, Math.min(196, Math.round(line)));
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const textures = {
    map: buildCanvasTexture(colorCanvas, 1.8, 1.8, true),
    roughnessMap: buildCanvasTexture(roughnessCanvas, 1.8, 1.8, false),
    bumpMap: buildCanvasTexture(bumpCanvas, 1.8, 1.8, false),
  } satisfies SurfaceTextureBundle;
  textureCache.set(cacheKey, textures);
  return textures;
}

function getRubberTextures() {
  const cacheKey = 'rubber';
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const roughnessCanvas = createCanvas(192, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const noise = 150 + pseudoNoise(x, y, 61) * 42 + pseudoNoise(x * 2, y * 2, 67) * 18;
        const value = Math.max(108, Math.min(224, Math.round(noise)));
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const bumpCanvas = createCanvas(192, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const noise = 124 + pseudoNoise(x, y, 71) * 54;
        const value = Math.max(92, Math.min(196, Math.round(noise)));
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const textures = {
    roughnessMap: buildCanvasTexture(roughnessCanvas, 2.2, 2.2, false),
    bumpMap: buildCanvasTexture(bumpCanvas, 2.2, 2.2, false),
  } satisfies SurfaceTextureBundle;
  textureCache.set(cacheKey, textures);
  return textures;
}

function getCeramicTextures() {
  const cacheKey = 'ceramic';
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const colorCanvas = createCanvas(192, (ctx, size) => {
    ctx.fillStyle = '#edf1f7';
    ctx.fillRect(0, 0, size, size);

    for (let index = 0; index < 420; index += 1) {
      const x = pseudoNoise(index, 4, 73) * size;
      const y = pseudoNoise(index, 9, 79) * size;
      const radius = 0.6 + pseudoNoise(index, 13, 83) * 1.8;
      ctx.fillStyle = `rgba(188, 197, 210, ${0.08 + pseudoNoise(index, 17, 89) * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const roughnessCanvas = createCanvas(192, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = 132 + pseudoNoise(x, y, 97) * 24;
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const bumpCanvas = createCanvas(192, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = 128 + pseudoNoise(x, y, 101) * 14;
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  const textures = {
    map: buildCanvasTexture(colorCanvas, 2, 2, true),
    roughnessMap: buildCanvasTexture(roughnessCanvas, 2, 2, false),
    bumpMap: buildCanvasTexture(bumpCanvas, 2, 2, false),
  } satisfies SurfaceTextureBundle;
  textureCache.set(cacheKey, textures);
  return textures;
}

export function configureLabRenderer(renderer: WebGLRenderer, options: LabRealismOptions = {}) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = options.shadowType ?? PCFSoftShadowMap;
  return renderer;
}

export function attachLabRealism(renderer: WebGLRenderer, scene: Scene, options: LabRealismOptions = {}): LabRealismHandle {
  configureLabRenderer(renderer, options);

  const pmrem = new PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(environmentScene, options.sigma ?? 0.04);
  const texture = environmentTarget.texture;

  scene.environment = texture;
  scene.environmentIntensity = options.environmentIntensity ?? 0.88;

  if (options.useEnvironmentBackground) {
    scene.background = texture;
    scene.backgroundBlurriness = options.backgroundBlurriness ?? 0.62;
    scene.backgroundIntensity = options.backgroundIntensity ?? 0.3;
  }

  return {
    texture,
    dispose: () => {
      if (scene.environment === texture) {
        scene.environment = null;
      }
      if (scene.background === texture) {
        scene.background = null;
      }
      environmentTarget.dispose();
      environmentScene.dispose();
      pmrem.dispose();
    },
  };
}

export function createLabGlassMaterial(overrides: PhysicalOverrides = {}) {
  return new MeshPhysicalMaterial({
    color: 0xd8eeff,
    transparent: true,
    opacity: 0.24,
    transmission: 0.96,
    thickness: 0.55,
    ior: 1.47,
    roughness: 0.02,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    attenuationDistance: 2.6,
    attenuationColor: 0xcfefff,
    envMapIntensity: 1.08,
    ...overrides,
  });
}

export function createLabLiquidMaterial(overrides: PhysicalOverrides = {}) {
  return new MeshPhysicalMaterial({
    color: 0x63b4ff,
    transparent: true,
    opacity: 0.72,
    transmission: 0.78,
    thickness: 1.2,
    ior: 1.333,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 0.42,
    clearcoatRoughness: 0.08,
    attenuationDistance: 1.8,
    attenuationColor: 0x7ec8ff,
    envMapIntensity: 0.8,
    ...overrides,
  });
}

export function createLabLiquidSurfaceMaterial(overrides: PhysicalOverrides = {}) {
  return createLabLiquidMaterial({
    opacity: 0.56,
    transmission: 0.9,
    thickness: 0.22,
    roughness: 0.04,
    clearcoat: 0.92,
    clearcoatRoughness: 0.04,
    ...overrides,
  });
}

export function createLabPlasticMaterial(overrides: PhysicalOverrides = {}) {
  const rubber = getRubberTextures();
  return new MeshPhysicalMaterial({
    color: 0x7c90aa,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.52,
    clearcoatRoughness: 0.16,
    sheen: 0.08,
    roughnessMap: rubber.roughnessMap,
    bumpMap: rubber.bumpMap,
    bumpScale: 0.01,
    envMapIntensity: 0.88,
    ...overrides,
  });
}

export function createLabMetalMaterial(overrides: PhysicalOverrides = {}) {
  const brushed = getBrushedMetalTextures();
  return new MeshPhysicalMaterial({
    color: 0xcfd8e5,
    roughness: 0.22,
    metalness: 0.98,
    clearcoat: 0.18,
    clearcoatRoughness: 0.16,
    map: brushed.map,
    roughnessMap: brushed.roughnessMap,
    bumpMap: brushed.bumpMap,
    bumpScale: 0.02,
    envMapIntensity: 1.24,
    ...overrides,
  });
}

export function createLabCoatedMetalMaterial(overrides: PhysicalOverrides = {}) {
  const brushed = getBrushedMetalTextures();
  return new MeshPhysicalMaterial({
    color: 0x587089,
    roughness: 0.34,
    metalness: 0.46,
    clearcoat: 0.48,
    clearcoatRoughness: 0.18,
    map: brushed.map,
    roughnessMap: brushed.roughnessMap,
    bumpMap: brushed.bumpMap,
    bumpScale: 0.012,
    envMapIntensity: 1.06,
    ...overrides,
  });
}

export function createLabWoodMaterial(overrides: PhysicalOverrides = {}) {
  const wood = getWoodTextures();
  return new MeshPhysicalMaterial({
    color: 0x7b5232,
    roughness: 0.82,
    metalness: 0.02,
    clearcoat: 0.18,
    clearcoatRoughness: 0.72,
    map: wood.map,
    roughnessMap: wood.roughnessMap,
    bumpMap: wood.bumpMap,
    bumpScale: 0.045,
    envMapIntensity: 0.46,
    ...overrides,
  });
}

export function createLabCeramicMaterial(overrides: PhysicalOverrides = {}) {
  const ceramic = getCeramicTextures();
  return new MeshPhysicalMaterial({
    color: 0xe7edf6,
    roughness: 0.54,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    map: ceramic.map,
    roughnessMap: ceramic.roughnessMap,
    bumpMap: ceramic.bumpMap,
    bumpScale: 0.012,
    envMapIntensity: 0.62,
    ...overrides,
  });
}

export function createLabRubberMaterial(overrides: PhysicalOverrides = {}) {
  const rubber = getRubberTextures();
  return new MeshPhysicalMaterial({
    color: 0x2a313d,
    roughness: 0.82,
    metalness: 0.02,
    clearcoat: 0.08,
    clearcoatRoughness: 0.42,
    roughnessMap: rubber.roughnessMap,
    bumpMap: rubber.bumpMap,
    bumpScale: 0.02,
    envMapIntensity: 0.28,
    ...overrides,
  });
}
