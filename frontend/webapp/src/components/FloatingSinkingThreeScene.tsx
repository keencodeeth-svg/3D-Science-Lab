import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CircleGeometry, Color, DirectionalLight, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeLabStage, type ThreeLabStageContext } from '../hooks/useThreeLabStage';
import { createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type CameraPreset = 'basin' | 'side' | 'compare';
type SampleId = 'wood' | 'metal' | 'plastic';

interface FloatingSinkingThreeSceneProps {
  cameraPreset: CameraPreset;
  placedSamples: SampleId[];
}

interface FloatingSceneObjects {
  wood: Mesh | null;
  plastic: Mesh | null;
  keyGroup: Group | null;
  waterBody: Mesh | null;
  waterSurface: Mesh | null;
  hoverRing: Mesh | null;
}

const sampleLabels: Record<SampleId, string> = {
  wood: '木块',
  metal: '金属钥匙',
  plastic: '塑料球',
};

const sampleFacts: Record<SampleId, string> = {
  wood: '木材平均密度较低，容易漂浮在液面附近。',
  metal: '金属密度高，会快速下沉并停留在水槽底部。',
  plastic: '中空塑料球受浮力作用，通常稳定漂浮。',
};

function setGroupEmissive(group: Object3D | null, color: number, intensity: number) {
  if (!group) return;
  group.traverse((child) => {
    const mesh = child as Mesh;
    const material = mesh.material;
    if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
      material.emissive = new Color(color);
      material.emissiveIntensity = intensity;
    }
  });
}

function createWoodMesh() {
  const mesh = new Mesh(
    new BoxGeometry(0.95, 0.22, 0.44),
    createLabWoodMaterial({ color: 0x9f6a3a, roughness: 0.86, clearcoat: 0.12, clearcoatRoughness: 0.78 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.sampleId = 'wood';
  return mesh;
}

function createPlasticMesh() {
  const mesh = new Mesh(
    new SphereGeometry(0.28, 32, 24),
    createLabPlasticMaterial({ color: 0xff7f66, roughness: 0.18, clearcoat: 0.68, clearcoatRoughness: 0.1 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.sampleId = 'plastic';
  return mesh;
}

function createKeyGroup() {
  const group = new Group();

  const metalMaterial = createLabMetalMaterial({ color: 0xcfd8e5, roughness: 0.18, clearcoat: 0.24 });
  const ring = new Mesh(new TorusGeometry(0.18, 0.045, 18, 42), metalMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.32;
  ring.castShadow = true;
  ring.userData.sampleId = 'metal';

  const shaft = new Mesh(new BoxGeometry(0.12, 0.52, 0.08), metalMaterial);
  shaft.position.y = -0.04;
  shaft.castShadow = true;
  shaft.userData.sampleId = 'metal';

  const toothA = new Mesh(new BoxGeometry(0.08, 0.08, 0.08), metalMaterial);
  toothA.position.set(-0.06, -0.28, 0);
  toothA.castShadow = true;
  toothA.userData.sampleId = 'metal';

  const toothB = new Mesh(new BoxGeometry(0.08, 0.14, 0.08), metalMaterial);
  toothB.position.set(0.02, -0.31, 0);
  toothB.castShadow = true;
  toothB.userData.sampleId = 'metal';

  group.add(ring, shaft, toothA, toothB);
  group.userData.sampleId = 'metal';
  return group;
}

function applyCameraPreset(preset: CameraPreset, camera: PerspectiveCamera, controls: OrbitControls) {
  const target = new Vector3(0, 1.12, 0);
  const position = new Vector3(5.8, 4.4, 7.1);

  if (preset === 'side') {
    target.set(0, 1.0, 0);
    position.set(7.4, 2.55, 0.8);
  }

  if (preset === 'compare') {
    target.set(0, 0.92, 0);
    position.set(0.2, 7.6, 0.2);
  }

  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
}

export function FloatingSinkingThreeScene({ cameraPreset, placedSamples }: FloatingSinkingThreeSceneProps) {
  const placedSamplesRef = useRef<SampleId[]>(placedSamples);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneObjectsRef = useRef<FloatingSceneObjects>({
    wood: null,
    plastic: null,
    keyGroup: null,
    waterBody: null,
    waterSurface: null,
    hoverRing: null,
  });
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const surfaceBaseRef = useRef<Float32Array | null>(null);
  const hoveredSampleRef = useRef<SampleId | null>(null);
  const [hoveredSample, setHoveredSample] = useState<SampleId | null>(null);

  placedSamplesRef.current = placedSamples;

  const readyCount = placedSamples.length;
  const overlayTitle = useMemo(() => {
    if (readyCount === 0) return '器材待入水';
    if (readyCount < 3) return `已入水 ${readyCount}/3`;
    return '三种样本已完成对比';
  }, [readyCount]);

  const mountRef = useThreeLabStage({
    cameraPosition: [5.8, 4.4, 7.1],
    target: [0, 1.12, 0],
    minDistance: 5,
    maxDistance: 11,
    background: 0x08131d,
    deps: [],
    onSetup: ({ scene, camera, controls, renderer }: ThreeLabStageContext) => {
      cameraRef.current = camera;
      controlsRef.current = controls;
      applyCameraPreset(cameraPreset, camera, controls);

      const ambient = new AmbientLight(0xe7f2ff, 1.5);
      scene.add(ambient);

      const keyLight = new DirectionalLight(0xffffff, 1.85);
      keyLight.position.set(5.2, 8.4, 6.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 20;
      scene.add(keyLight);

      const rimLight = new PointLight(0x78caff, 1.1, 18, 2.2);
      rimLight.position.set(-4.8, 4.2, -3.4);
      scene.add(rimLight);

      const table = new Mesh(
        new BoxGeometry(10.8, 0.34, 6.4),
        createLabWoodMaterial({ color: 0x4a3329, roughness: 0.9, clearcoat: 0.08 }),
      );
      table.position.set(0, -0.28, 0);
      table.receiveShadow = true;
      scene.add(table);

      const backsplash = new Mesh(
        new PlaneGeometry(15, 9),
        createLabCoatedMetalMaterial({ color: 0x12202f, roughness: 0.92, metalness: 0.18, clearcoat: 0.24 }),
      );
      backsplash.position.set(0, 3.5, -4.2);
      scene.add(backsplash);

      const floorGlow = new Mesh(
        new CircleGeometry(3.8, 48),
        new MeshBasicMaterial({ color: 0x73c9ff, transparent: true, opacity: 0.08 }),
      );
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.y = -0.1;
      scene.add(floorGlow);

      const basinGroup = new Group();
      scene.add(basinGroup);

      const glassMaterial = createLabGlassMaterial({ color: 0xd8eeff, opacity: 0.18, thickness: 0.82, attenuationDistance: 3.1, attenuationColor: 0xe3f6ff });
      const baseMaterial = createLabCeramicMaterial({ color: 0xbecada, roughness: 0.4, clearcoat: 0.12 });
      const waterMaterial = createLabLiquidMaterial({ color: 0x4e9bff, opacity: 0.64, transmission: 0.82, thickness: 1.4, attenuationDistance: 2.4, attenuationColor: 0x66a9ff });
      const waterSurfaceMaterial = createLabLiquidMaterial({ color: 0x91dbff, opacity: 0.46, transmission: 0.88, roughness: 0.04, thickness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.04, side: DoubleSide });

      const leftWall = new Mesh(new BoxGeometry(0.08, 2.08, 2.56), glassMaterial);
      leftWall.position.set(-1.92, 1, 0);
      const rightWall = leftWall.clone();
      rightWall.position.x = 1.92;
      const backWall = new Mesh(new BoxGeometry(3.84, 2.08, 0.08), glassMaterial);
      backWall.position.set(0, 1, -1.28);
      const frontWall = new Mesh(new BoxGeometry(3.84, 2.08, 0.06), glassMaterial);
      frontWall.position.set(0, 1, 1.28);
      const base = new Mesh(new BoxGeometry(3.96, 0.14, 2.68), baseMaterial);
      base.position.set(0, 0, 0);
      base.receiveShadow = true;

      const waterBody = new Mesh(new BoxGeometry(3.5, 1.56, 2.2), waterMaterial);
      waterBody.position.set(0, 0.84, 0);
      waterBody.receiveShadow = true;

      const waterSurface = new Mesh(new PlaneGeometry(3.32, 2.04, 26, 16), waterSurfaceMaterial);
      waterSurface.rotation.x = -Math.PI / 2;
      waterSurface.position.set(0, 1.62, 0);
      waterSurface.receiveShadow = true;
      surfaceBaseRef.current = Float32Array.from(waterSurface.geometry.attributes.position.array as ArrayLike<number>);

      basinGroup.add(base, leftWall, rightWall, backWall, frontWall, waterBody, waterSurface);

      const wood = createWoodMesh();
      const plastic = createPlasticMesh();
      const keyGroup = createKeyGroup();
      basinGroup.add(wood, plastic, keyGroup);

      const hoverRing = new Mesh(
        new TorusGeometry(0.42, 0.025, 12, 40),
        createLabPlasticMaterial({ color: 0x8fe4ff, emissive: 0x8fe4ff, emissiveIntensity: 0.36, transparent: true, opacity: 0.88, roughness: 0.14, clearcoat: 0.72, clearcoatRoughness: 0.08 }),
      );
      hoverRing.rotation.x = Math.PI / 2;
      hoverRing.visible = false;
      scene.add(hoverRing);

      sceneObjectsRef.current = {
        wood,
        plastic,
        keyGroup,
        waterBody,
        waterSurface,
        hoverRing,
      };

      interactiveObjectsRef.current = [wood, plastic, keyGroup];

      const updatePointerTarget = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(pointerRef.current, camera);
        const hits = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);
        const hit = hits.find((entry) => entry.object.userData.sampleId || entry.object.parent?.userData.sampleId);
        const sampleId = (hit?.object.userData.sampleId ?? hit?.object.parent?.userData.sampleId ?? null) as SampleId | null;
        hoveredSampleRef.current = sampleId;
        setHoveredSample(sampleId);
        renderer.domElement.style.cursor = sampleId ? 'pointer' : 'grab';
      };

      const handlePointerMove = (event: PointerEvent) => updatePointerTarget(event);
      const handlePointerLeave = () => {
        hoveredSampleRef.current = null;
        setHoveredSample(null);
        renderer.domElement.style.cursor = 'grab';
      };

      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.style.cursor = 'grab';

      return () => {
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
        interactiveObjectsRef.current = [];
      };
    },
    onFrame: (_context, time) => {
      const objects = sceneObjectsRef.current;
      const placed = placedSamplesRef.current;
      const t = time * 0.001;
      const hoverId = hoveredSampleRef.current;
      const floatOffset = Math.sin(t * 1.9) * 0.04;
      const plasticOffset = Math.cos(t * 1.6) * 0.05;
      const waterPulse = Math.sin(t * 1.4) * 0.02;

      if (objects.waterBody) {
        objects.waterBody.position.y = 0.84 + waterPulse * 0.18;
      }

      if (objects.waterSurface && surfaceBaseRef.current) {
        const geometry = objects.waterSurface.geometry;
        const positions = geometry.attributes.position.array as Float32Array;
        const base = surfaceBaseRef.current;
        for (let index = 0; index < positions.length; index += 3) {
          const x = base[index];
          const y = base[index + 1];
          positions[index + 2] = Math.sin(t * 1.6 + x * 1.5) * 0.05 + Math.cos(t * 1.2 + y * 1.8) * 0.035;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
      }

      if (objects.wood) {
        const active = placed.includes('wood');
        objects.wood.visible = true;
        objects.wood.position.set(active ? -0.88 : -2.55, active ? 1.68 + floatOffset : 0.24, active ? 0.18 : 0.86);
        objects.wood.rotation.set(0.04, t * 0.18, active ? -0.12 : 0.06);
        const material = objects.wood.material;
        if (material instanceof MeshStandardMaterial) {
          material.opacity = active ? 1 : 0.92;
          material.transparent = !active;
          material.emissiveIntensity = hoverId === 'wood' ? 0.42 : 0.04;
        }
      }

      if (objects.plastic) {
        const active = placed.includes('plastic');
        objects.plastic.visible = true;
        objects.plastic.position.set(active ? 1.02 : 2.38, active ? 1.63 + plasticOffset : 0.28, active ? -0.34 : -0.86);
        objects.plastic.rotation.y = t * 0.7;
        const material = objects.plastic.material;
        if (material instanceof MeshStandardMaterial) {
          material.opacity = active ? 1 : 0.92;
          material.transparent = !active;
          material.emissiveIntensity = hoverId === 'plastic' ? 0.38 : 0.08;
          material.emissive = new Color(0xff9f8a);
        }
      }

      if (objects.keyGroup) {
        const active = placed.includes('metal');
        objects.keyGroup.visible = true;
        objects.keyGroup.position.set(active ? 0.04 : 2.9, active ? 0.34 + Math.sin(t * 1.8) * 0.015 : 0.24, active ? 0.04 : 0.68);
        objects.keyGroup.rotation.set(active ? Math.PI / 2 : 0.22, 0, active ? 0.38 : -0.24);
        setGroupEmissive(objects.keyGroup, 0xb5dfff, hoverId === 'metal' ? 0.54 : 0.08);
      }

      if (objects.hoverRing) {
        objects.hoverRing.visible = hoverId !== null;
        if (hoverId === 'wood' && objects.wood) {
          objects.hoverRing.position.set(objects.wood.position.x, 1.58, objects.wood.position.z);
          objects.hoverRing.scale.setScalar(1.08 + Math.sin(t * 3) * 0.06);
        }
        if (hoverId === 'plastic' && objects.plastic) {
          objects.hoverRing.position.set(objects.plastic.position.x, 1.58, objects.plastic.position.z);
          objects.hoverRing.scale.setScalar(0.96 + Math.sin(t * 3) * 0.05);
        }
        if (hoverId === 'metal' && objects.keyGroup) {
          objects.hoverRing.position.set(objects.keyGroup.position.x, 0.26, objects.keyGroup.position.z);
          objects.hoverRing.scale.setScalar(0.92 + Math.sin(t * 3) * 0.04);
        }
      }
    },
  });

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    applyCameraPreset(cameraPreset, cameraRef.current, controlsRef.current);
  }, [cameraPreset]);

  return (
    <div className="three-stage-shell floating-three-shell">
      <div className="three-stage-mount floating-three-mount" ref={mountRef} />
      <div className="three-stage-overlay floating-three-overlay">
        <div className="three-stage-chip-row">
          <span className="three-stage-chip">3D 水槽</span>
          <span className="three-stage-chip">可拖动视角</span>
          <span className="three-stage-chip strong">{overlayTitle}</span>
        </div>
        <div className="floating-three-legend">
          <div className={placedSamples.includes('wood') ? 'legend-pill active' : 'legend-pill'}>木块</div>
          <div className={placedSamples.includes('metal') ? 'legend-pill active sink' : 'legend-pill sink'}>金属钥匙</div>
          <div className={placedSamples.includes('plastic') ? 'legend-pill active float' : 'legend-pill float'}>塑料球</div>
        </div>
        <div className="floating-three-hint">拖动模型可旋转，悬停样本可查看当前材料特征。</div>
      </div>
      {hoveredSample ? (
        <div className="floating-three-hovercard">
          <strong>{sampleLabels[hoveredSample]}</strong>
          <p>{sampleFacts[hoveredSample]}</p>
        </div>
      ) : null}
    </div>
  );
}
