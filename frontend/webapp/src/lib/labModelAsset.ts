import { Color, Group, Material, Mesh, Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { requestJson } from './http';
import { createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabRubberMaterial, createLabWoodMaterial } from './threeRealism';

export type LabAssetMaterialRole = 'auto' | 'glass' | 'liquid' | 'metal' | 'coated-metal' | 'plastic' | 'rubber' | 'wood' | 'ceramic';
export type LabAssetStatus = 'placeholder' | 'ready' | 'disabled';

export interface LoadLabModelAssetOptions {
  url: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  materialRole?: LabAssetMaterialRole;
}

export interface LabAssetManifestItem {
  id: string;
  category: string;
  type: string;
  status: LabAssetStatus;
  url: string;
  materialRole?: LabAssetMaterialRole;
}

export interface LabAssetManifest {
  version: number;
  updatedAt: string;
  notes?: string;
  assets: LabAssetManifestItem[];
}

export interface LoadedLabModelAsset {
  gltf: GLTF;
  root: Group;
  dispose: () => void;
}

const loader = new GLTFLoader();
let manifestPromise: Promise<LabAssetManifest | null> | null = null;

function inferMaterialRole(name: string): LabAssetMaterialRole {
  const token = name.toLowerCase();
  if (token.includes('glass') || token.includes('lens') || token.includes('beaker') || token.includes('tube')) return 'glass';
  if (token.includes('liquid') || token.includes('water') || token.includes('solution') || token.includes('fluid')) return 'liquid';
  if (token.includes('rubber') || token.includes('gasket') || token.includes('grip')) return 'rubber';
  if (token.includes('wood')) return 'wood';
  if (token.includes('ceramic') || token.includes('porcelain')) return 'ceramic';
  if (token.includes('coat') || token.includes('paint')) return 'coated-metal';
  if (token.includes('metal') || token.includes('steel') || token.includes('iron') || token.includes('copper') || token.includes('silver')) return 'metal';
  if (token.includes('plastic') || token.includes('shell') || token.includes('body')) return 'plastic';
  return 'auto';
}

function buildMaterial(role: LabAssetMaterialRole, sourceMaterial: Material | Material[] | null) {
  const firstMaterial = Array.isArray(sourceMaterial) ? sourceMaterial[0] ?? null : sourceMaterial;
  const color = firstMaterial && 'color' in firstMaterial && firstMaterial.color instanceof Color ? firstMaterial.color.getHex() : undefined;

  switch (role) {
    case 'glass':
      return createLabGlassMaterial(color ? { color } : {});
    case 'liquid':
      return createLabLiquidMaterial(color ? { color, opacity: 0.52, transmission: 0.78, thickness: 0.68 } : { opacity: 0.52, transmission: 0.78, thickness: 0.68 });
    case 'metal':
      return createLabMetalMaterial(color ? { color } : {});
    case 'coated-metal':
      return createLabCoatedMetalMaterial(color ? { color } : {});
    case 'plastic':
      return createLabPlasticMaterial(color ? { color } : {});
    case 'rubber':
      return createLabRubberMaterial(color ? { color } : {});
    case 'wood':
      return createLabWoodMaterial(color ? { color } : {});
    case 'ceramic':
      return createLabCeramicMaterial(color ? { color } : {});
    default:
      return null;
  }
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }
  material.dispose();
}

export async function getLabAssetManifest(forceRefresh = false): Promise<LabAssetManifest | null> {
  if (!forceRefresh && manifestPromise) return manifestPromise;

  manifestPromise = requestJson<LabAssetManifest>('/lab-assets/manifest.json', {
    errorMessage: '无法加载实验资产清单',
    retries: 1,
    timeoutMs: 5000,
  })
    .catch(() => null);

  return manifestPromise;
}

export async function getLabAssetManifestEntry(id: string) {
  const manifest = await getLabAssetManifest();
  return manifest?.assets.find((asset) => asset.id === id) ?? null;
}

export function enhanceLabModelAsset(root: Object3D, materialRole: LabAssetMaterialRole = 'auto') {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const inferredRole = materialRole === 'auto'
      ? inferMaterialRole(`${mesh.name} ${Array.isArray(mesh.material) ? mesh.material.map((item) => item.name).join(' ') : mesh.material?.name ?? ''}`)
      : materialRole;

    const replacementMaterial = buildMaterial(inferredRole, mesh.material as Material | Material[] | null);
    if (!replacementMaterial) return;

    disposeMaterial(mesh.material as Material | Material[]);
    mesh.material = replacementMaterial;
  });

  return root;
}

export async function loadLabModelAsset(options: LoadLabModelAssetOptions): Promise<LoadedLabModelAsset> {
  const gltf = await loader.loadAsync(options.url);
  const root = gltf.scene.clone(true);

  if (typeof options.scale === 'number') {
    root.scale.setScalar(options.scale);
  } else if (options.scale) {
    root.scale.set(...options.scale);
  }

  if (options.position) {
    root.position.set(...options.position);
  }

  if (options.rotation) {
    root.rotation.set(...options.rotation);
  }

  enhanceLabModelAsset(root, options.materialRole ?? 'auto');

  return {
    gltf,
    root,
    dispose: () => {
      root.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        disposeMaterial(mesh.material as Material | Material[]);
      });
    },
  };
}

export async function loadLabModelAssetFromManifest(
  id: string,
  overrides: Omit<LoadLabModelAssetOptions, 'url' | 'materialRole'> = {},
) {
  const entry = await getLabAssetManifestEntry(id);
  if (!entry || entry.status !== 'ready') return null;

  return loadLabModelAsset({
    url: entry.url,
    materialRole: entry.materialRole ?? 'auto',
    ...overrides,
  });
}
