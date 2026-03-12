import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeLabStage, type ThreeLabStageContext } from '../hooks/useThreeLabStage';
import { createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type CameraPreset = 'bench' | 'slide' | 'microscope';
type HoverPart = 'pipette' | 'slide' | 'coverslip';

interface MitosisPrepThreeSceneProps {
  cameraPreset: CameraPreset;
  stainAdded: boolean;
  slideReady: boolean;
}

interface PrepSceneObjects {
  pipetteGroup: Group | null;
  droplet: Mesh | null;
  slideGroup: Group | null;
  slideGlass: Mesh | null;
  samplePatch: Mesh | null;
  coverSlip: Mesh | null;
  hoverRing: Mesh | null;
}

const partFacts: Record<HoverPart, { title: string; detail: string }> = {
  pipette: {
    title: '滴管与染色液',
    detail: '染色后细胞结构更容易区分，后续显微观察会更清楚。',
  },
  slide: {
    title: '载玻片与样本',
    detail: '根尖样本应平整铺展，才能更稳定地观察有丝分裂细胞。',
  },
  coverslip: {
    title: '盖玻片',
    detail: '盖玻片压片规范，能减少气泡并保持样本厚薄合适。',
  },
};

function applyCameraPreset(preset: CameraPreset, camera: PerspectiveCamera, controls: OrbitControls) {
  const target = new Vector3(0, 0.9, 0);
  const position = new Vector3(5.4, 3.2, 6.6);

  if (preset === 'slide') {
    target.set(0.2, 0.82, 0);
    position.set(3.2, 2.0, 4.2);
  }

  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
}

export function MitosisPrepThreeScene({ cameraPreset, stainAdded, slideReady }: MitosisPrepThreeSceneProps) {
  const stainAddedRef = useRef(stainAdded);
  const slideReadyRef = useRef(slideReady);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneObjectsRef = useRef<PrepSceneObjects>({
    pipetteGroup: null,
    droplet: null,
    slideGroup: null,
    slideGlass: null,
    samplePatch: null,
    coverSlip: null,
    hoverRing: null,
  });
  const hoveredPartRef = useRef<HoverPart | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const [hoveredPart, setHoveredPart] = useState<HoverPart | null>(null);

  stainAddedRef.current = stainAdded;
  slideReadyRef.current = slideReady;

  const overlayTitle = useMemo(() => {
    if (slideReady) return '装片已完成';
    if (stainAdded) return '已染色待盖片';
    return '制片准备中';
  }, [slideReady, stainAdded]);

  const mountRef = useThreeLabStage({
    cameraPosition: [5.4, 3.2, 6.6],
    target: [0, 0.9, 0],
    minDistance: 4,
    maxDistance: 10,
    background: 0x120f19,
    deps: [],
    onSetup: ({ scene, camera, controls, renderer }: ThreeLabStageContext) => {
      cameraRef.current = camera;
      controlsRef.current = controls;
      applyCameraPreset(cameraPreset, camera, controls);

      const ambient = new AmbientLight(0xf3e8ff, 1.45);
      scene.add(ambient);

      const keyLight = new DirectionalLight(0xffffff, 1.7);
      keyLight.position.set(5.4, 8.2, 5.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);

      const magentaFill = new PointLight(0xdd7dff, 1.05, 16, 2);
      magentaFill.position.set(-3.6, 3.2, -2.8);
      scene.add(magentaFill);

      const table = new Mesh(
        new BoxGeometry(8.8, 0.34, 5.6),
        createLabWoodMaterial({ color: 0x63422f, roughness: 0.76 }),
      );
      table.position.set(0, -0.24, 0);
      table.receiveShadow = true;
      scene.add(table);

      const tray = new Mesh(
        new BoxGeometry(3.8, 0.12, 2.2),
        createLabCoatedMetalMaterial({ color: 0x4a5160, roughness: 0.34, metalness: 0.32 }),
      );
      tray.position.set(0.2, 0.08, 0);
      tray.receiveShadow = true;
      scene.add(tray);

      const slideGroup = new Group();
      slideGroup.position.set(0.4, 0.12, 0.1);
      slideGroup.userData.hoverPart = 'slide';
      scene.add(slideGroup);

      const slideGlass = new Mesh(
        new BoxGeometry(2.2, 0.08, 0.82),
        createLabGlassMaterial({ color: 0xe4f2ff, opacity: 0.24, transmission: 0.94, thickness: 0.3, attenuationDistance: 1.2, attenuationColor: 0xe9f6ff }),
      );
      slideGlass.castShadow = true;
      slideGlass.receiveShadow = true;
      slideGlass.userData.hoverPart = 'slide';
      slideGroup.add(slideGlass);

      const samplePatch = new Mesh(
        new PlaneGeometry(1.16, 0.34),
        new MeshPhysicalMaterial({ color: 0xb84ca4, transparent: true, opacity: 0.42, transmission: 0.28, roughness: 0.16, metalness: 0, thickness: 0.06, side: DoubleSide }),
      );
      samplePatch.rotation.x = -Math.PI / 2;
      samplePatch.position.set(0, 0.052, 0);
      samplePatch.userData.hoverPart = 'slide';
      slideGroup.add(samplePatch);

      const coverSlip = new Mesh(
        new BoxGeometry(1.34, 0.035, 0.46),
        createLabGlassMaterial({ color: 0xf7fbff, opacity: 0.18, transmission: 0.96, thickness: 0.14, attenuationDistance: 0.9, attenuationColor: 0xf9fdff }),
      );
      coverSlip.position.set(0.12, 0.11, 0);
      coverSlip.rotation.y = -0.08;
      coverSlip.visible = false;
      coverSlip.userData.hoverPart = 'coverslip';
      const slideLabel = new Mesh(new BoxGeometry(0.28, 0.012, 0.3), createLabCeramicMaterial({ color: 0xfafcff, roughness: 0.52 }));
      slideLabel.position.set(-0.82, 0.048, 0);
      slideGroup.add(coverSlip, slideLabel);

      const pipetteGroup = new Group();
      pipetteGroup.position.set(-1.5, 0.28, -0.36);
      pipetteGroup.rotation.z = -0.42;
      pipetteGroup.userData.hoverPart = 'pipette';
      scene.add(pipetteGroup);

      const pipetteBody = new Mesh(
        new CylinderGeometry(0.1, 0.12, 1.52, 18),
        createLabGlassMaterial({ color: 0xe6f3ff, opacity: 0.22, transmission: 0.92, thickness: 0.22, attenuationDistance: 1.2, attenuationColor: 0xecf7ff }),
      );
      pipetteBody.rotation.z = Math.PI / 2;
      pipetteBody.castShadow = true;
      pipetteBody.userData.hoverPart = 'pipette';
      pipetteGroup.add(pipetteBody);

      const pipetteBulb = new Mesh(new SphereGeometry(0.18, 20, 20), createLabRubberMaterial({ color: 0x8b4b87, roughness: 0.86 }));
      pipetteBulb.position.set(-0.82, 0.02, 0);
      pipetteBulb.castShadow = true;
      pipetteBulb.userData.hoverPart = 'pipette';
      pipetteGroup.add(pipetteBulb);

      const pipetteCollar = new Mesh(new CylinderGeometry(0.08, 0.08, 0.12, 16), createLabCoatedMetalMaterial({ color: 0xc1c9d4, roughness: 0.28, metalness: 0.44 }));
      pipetteCollar.position.set(-0.58, 0, 0);
      pipetteCollar.rotation.z = Math.PI / 2;
      pipetteCollar.userData.hoverPart = 'pipette';
      pipetteGroup.add(pipetteCollar);

      const pipetteTip = new Mesh(
        new CylinderGeometry(0.03, 0.07, 0.56, 16),
        createLabGlassMaterial({ color: 0xf7fbff, opacity: 0.22, transmission: 0.96, thickness: 0.14, attenuationDistance: 0.8, attenuationColor: 0xf9fdff }),
      );
      pipetteTip.position.set(0.92, -0.02, 0);
      pipetteTip.rotation.z = Math.PI / 2;
      pipetteTip.userData.hoverPart = 'pipette';
      pipetteGroup.add(pipetteTip);

      const droplet = new Mesh(
        new SphereGeometry(0.08, 18, 18),
        createLabLiquidMaterial({ color: 0xca58c0, opacity: 0.12, transmission: 0.68, thickness: 0.18, attenuationDistance: 0.4, attenuationColor: 0xd86cd0 }),
      );
      droplet.position.set(1.18, -0.03, 0);
      pipetteGroup.add(droplet);

      const hoverRing = new Mesh(
        new TorusGeometry(0.72, 0.03, 12, 48),
        createLabCoatedMetalMaterial({ color: 0xeab5ff, emissive: 0xeab5ff, emissiveIntensity: 0.38, transparent: true, opacity: 0.8, roughness: 0.28, metalness: 0.24 }),
      );
      hoverRing.rotation.x = Math.PI / 2;
      hoverRing.visible = false;
      scene.add(hoverRing);

      sceneObjectsRef.current = {
        pipetteGroup,
        droplet,
        slideGroup,
        slideGlass,
        samplePatch,
        coverSlip,
        hoverRing,
      };

      interactiveObjectsRef.current = [pipetteGroup, slideGroup, coverSlip];

      const updatePointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(pointerRef.current, camera);
        const hits = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);
        const hit = hits.find((entry) => entry.object.userData.hoverPart || entry.object.parent?.userData.hoverPart);
        const hoverPart = (hit?.object.userData.hoverPart ?? hit?.object.parent?.userData.hoverPart ?? null) as HoverPart | null;
        hoveredPartRef.current = hoverPart;
        setHoveredPart(hoverPart);
        renderer.domElement.style.cursor = hoverPart ? 'pointer' : 'grab';
      };

      const handlePointerMove = (event: PointerEvent) => updatePointer(event);
      const handlePointerLeave = () => {
        hoveredPartRef.current = null;
        setHoveredPart(null);
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
      const t = time * 0.001;
      const hover = hoveredPartRef.current;

      if (objects.droplet) {
        const active = stainAddedRef.current;
        objects.droplet.visible = true;
        objects.droplet.position.y = active ? -0.16 + Math.sin(t * 3) * 0.04 : -0.03;
        const material = objects.droplet.material;
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.opacity = active ? 0.94 : 0.18;
          material.emissive = new Color(0xde73d3);
          material.emissiveIntensity = active ? 0.28 : 0.04;
        }
      }

      if (objects.samplePatch) {
        const material = objects.samplePatch.material;
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.opacity = stainAddedRef.current ? 0.82 : 0.34;
          material.emissive = new Color(0xb24ca0);
          material.emissiveIntensity = stainAddedRef.current ? 0.18 : 0.04;
        }
      }

      if (objects.coverSlip) {
        objects.coverSlip.visible = slideReadyRef.current;
        objects.coverSlip.position.y = slideReadyRef.current ? 0.135 + Math.sin(t * 2.2) * 0.004 : 0.11;
      }

      if (objects.hoverRing) {
        objects.hoverRing.visible = hover !== null;
        if (hover === 'pipette' && objects.pipetteGroup) {
          objects.hoverRing.position.set(objects.pipetteGroup.position.x + 0.18, 0.14, objects.pipetteGroup.position.z);
        }
        if (hover === 'slide' && objects.slideGroup) {
          objects.hoverRing.position.set(objects.slideGroup.position.x, 0.14, objects.slideGroup.position.z);
        }
        if (hover === 'coverslip' && objects.slideGroup) {
          objects.hoverRing.position.set(objects.slideGroup.position.x + 0.12, 0.14, objects.slideGroup.position.z);
        }
        objects.hoverRing.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
      }
    },
  });

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    applyCameraPreset(cameraPreset, cameraRef.current, controlsRef.current);
  }, [cameraPreset]);

  return (
    <div className="three-stage-shell mitosis-three-shell">
      <div className="three-stage-mount mitosis-three-mount" ref={mountRef} />
      <div className="three-stage-overlay mitosis-three-overlay">
        <div className="three-stage-chip-row">
          <span className="three-stage-chip">3D 制片台</span>
          <span className="three-stage-chip">可拖动视角</span>
          <span className="three-stage-chip strong">{overlayTitle}</span>
        </div>
        <div className="mitosis-three-hint">装片视角更适合看滴管、载玻片和盖玻片的相对位置。</div>
      </div>
      {hoveredPart ? (
        <div className="mitosis-three-hovercard">
          <strong>{partFacts[hoveredPart].title}</strong>
          <p>{partFacts[hoveredPart].detail}</p>
        </div>
      ) : null}
    </div>
  );
}
