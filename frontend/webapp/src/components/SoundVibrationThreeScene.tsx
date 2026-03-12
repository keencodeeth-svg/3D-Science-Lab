import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, RingGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeLabStage, type ThreeLabStageContext } from '../hooks/useThreeLabStage';
import { createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type CameraPreset = 'bench' | 'close' | 'compare';
type InstrumentId = 'band' | 'fork' | 'drum';

interface SoundVibrationThreeSceneProps {
  cameraPreset: CameraPreset;
  triggeredInstruments: InstrumentId[];
  viewSwitched: boolean;
}

interface SoundSceneObjects {
  bandGroup: Group | null;
  bandLines: Mesh[];
  bandAura: Mesh | null;
  forkGroup: Group | null;
  forkLeft: Mesh | null;
  forkRight: Mesh | null;
  forkAura: Mesh | null;
  drumGroup: Group | null;
  drumHead: Mesh | null;
  drumAura: Mesh | null;
  paperBits: Mesh[];
  hoverRing: Mesh | null;
}

const instrumentLabels: Record<InstrumentId, string> = {
  band: '皮筋盒',
  fork: '音叉',
  drum: '小鼓',
};

const instrumentFacts: Record<InstrumentId, string> = {
  band: '拨动皮筋时，张紧的皮筋会快速来回振动，并带动空气振动。',
  fork: '音叉两臂的往返振动更均匀，近景下更容易观察振幅变化。',
  drum: '鼓面振动会把纸屑弹起，是最直观的“振动证据”之一。',
};

function applyCameraPreset(preset: CameraPreset, camera: PerspectiveCamera, controls: OrbitControls) {
  const target = new Vector3(0, 1.2, 0);
  const position = new Vector3(0.4, 3.6, 7.6);

  if (preset === 'close') {
    target.set(0, 1.35, 0);
    position.set(0.2, 2.2, 4.4);
  }

  if (preset === 'compare') {
    target.set(0, 1.1, 0);
    position.set(0.1, 7.2, 0.4);
  }

  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
}

function setEmissive(group: Object3D | null, color: number, intensity: number) {
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

export function SoundVibrationThreeScene({ cameraPreset, triggeredInstruments, viewSwitched }: SoundVibrationThreeSceneProps) {
  const triggeredRef = useRef<InstrumentId[]>(triggeredInstruments);
  const sceneObjectsRef = useRef<SoundSceneObjects>({
    bandGroup: null,
    bandLines: [],
    bandAura: null,
    forkGroup: null,
    forkLeft: null,
    forkRight: null,
    forkAura: null,
    drumGroup: null,
    drumHead: null,
    drumAura: null,
    paperBits: [],
    hoverRing: null,
  });
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const hoveredInstrumentRef = useRef<InstrumentId | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const [hoveredInstrument, setHoveredInstrument] = useState<InstrumentId | null>(null);

  triggeredRef.current = triggeredInstruments;

  const overlayTitle = useMemo(() => {
    if (triggeredInstruments.length === 0) return '器材待触发';
    if (!viewSwitched) return `已触发 ${triggeredInstruments.length}/3`;
    return '近景观察已开启';
  }, [triggeredInstruments.length, viewSwitched]);

  const mountRef = useThreeLabStage({
    cameraPosition: [0.4, 3.6, 7.6],
    target: [0, 1.2, 0],
    minDistance: 4.4,
    maxDistance: 11,
    background: 0x11121d,
    deps: [],
    onSetup: ({ scene, camera, controls, renderer }: ThreeLabStageContext) => {
      cameraRef.current = camera;
      controlsRef.current = controls;
      applyCameraPreset(cameraPreset, camera, controls);

      const ambient = new AmbientLight(0xe6e6ff, 1.35);
      scene.add(ambient);

      const keyLight = new DirectionalLight(0xffffff, 1.7);
      keyLight.position.set(6.5, 8.2, 5.5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);

      const magentaFill = new PointLight(0xd177ff, 1, 18, 2);
      magentaFill.position.set(-5.4, 4.2, -3.2);
      scene.add(magentaFill);

      const cyanFill = new PointLight(0x74d9ff, 0.86, 16, 2.2);
      cyanFill.position.set(4.2, 2.8, 4.6);
      scene.add(cyanFill);

      const table = new Mesh(
        new BoxGeometry(11, 0.34, 6.2),
        createLabWoodMaterial({ color: 0x62422f, roughness: 0.76 }),
      );
      table.position.set(0, -0.24, 0);
      table.receiveShadow = true;
      scene.add(table);

      const benchInset = new Mesh(
        new BoxGeometry(10.2, 0.05, 5.5),
        createLabPlasticMaterial({ color: 0x171c2a, roughness: 0.42, clearcoat: 0.18 }),
      );
      benchInset.position.set(0, 0.02, 0);
      scene.add(benchInset);

      const backdrop = new Mesh(
        new PlaneGeometry(16, 9),
        createLabPlasticMaterial({ color: 0x181a28, roughness: 0.82, clearcoat: 0.04 }),
      );
      backdrop.position.set(0, 3.6, -4.1);
      scene.add(backdrop);

      const benchGlow = new Mesh(
        new CircleGeometry(4.2, 56),
        new MeshBasicMaterial({ color: 0x9159ff, transparent: true, opacity: 0.07 }),
      );
      benchGlow.rotation.x = -Math.PI / 2;
      benchGlow.position.y = -0.06;
      scene.add(benchGlow);

      const bandGroup = new Group();
      bandGroup.position.set(-2.3, 0.1, 0.3);
      bandGroup.userData.instrumentId = 'band';
      scene.add(bandGroup);

      const bandBody = new Mesh(
        new BoxGeometry(1.54, 0.8, 1.02),
        createLabWoodMaterial({ color: 0x725239, roughness: 0.72 }),
      );
      bandBody.position.y = 0.55;
      bandBody.castShadow = true;
      bandBody.receiveShadow = true;
      bandBody.userData.instrumentId = 'band';
      bandGroup.add(bandBody);

      const bandCavity = new Mesh(
        new BoxGeometry(1.08, 0.54, 0.62),
        createLabPlasticMaterial({ color: 0x1c1c24, roughness: 0.86, clearcoat: 0.04 }),
      );
      bandCavity.position.set(0, 0.56, 0);
      bandCavity.userData.instrumentId = 'band';
      bandGroup.add(bandCavity);

      const bandLines: Mesh[] = [];
      for (const x of [-0.24, 0, 0.24]) {
        const line = new Mesh(
          new CylinderGeometry(0.028, 0.028, 0.88, 16),
          createLabRubberMaterial({ color: 0xe8d48f, roughness: 0.68, metalness: 0 }),
        );
        line.rotation.z = Math.PI / 2;
        line.position.set(x, 0.94, 0);
        line.castShadow = true;
        line.userData.instrumentId = 'band';
        bandGroup.add(line);
        bandLines.push(line);
      }

      const bandAura = new Mesh(
        new RingGeometry(0.42, 0.56, 40),
        new MeshBasicMaterial({ color: 0xffcb71, transparent: true, opacity: 0.36, side: DoubleSide }),
      );
      bandAura.rotation.x = -Math.PI / 2;
      bandAura.position.set(0, 1.06, 0);
      bandAura.visible = false;
      bandGroup.add(bandAura);

      const forkGroup = new Group();
      forkGroup.position.set(0, 0.1, 0);
      forkGroup.userData.instrumentId = 'fork';
      scene.add(forkGroup);

      const forkHandle = new Mesh(
        new CylinderGeometry(0.09, 0.12, 1.08, 24),
        createLabMetalMaterial({ color: 0x7f889a, roughness: 0.18, metalness: 0.98 }),
      );
      forkHandle.position.set(0, 0.55, 0);
      forkHandle.castShadow = true;
      forkHandle.userData.instrumentId = 'fork';
      forkGroup.add(forkHandle);

      const forkBridge = new Mesh(
        new BoxGeometry(0.56, 0.12, 0.16),
        createLabMetalMaterial({ color: 0xcfd8e5, roughness: 0.16, metalness: 0.98 }),
      );
      forkBridge.position.set(0, 1.14, 0);
      forkBridge.castShadow = true;
      forkBridge.userData.instrumentId = 'fork';
      forkGroup.add(forkBridge);

      const forkLeft = new Mesh(
        new BoxGeometry(0.12, 0.92, 0.14),
        createLabMetalMaterial({ color: 0xdce5f0, roughness: 0.14, metalness: 0.99 }),
      );
      forkLeft.position.set(-0.22, 1.58, 0);
      forkLeft.castShadow = true;
      forkLeft.userData.instrumentId = 'fork';
      forkGroup.add(forkLeft);

      const forkRight = forkLeft.clone();
      forkRight.position.x = 0.22;
      forkRight.userData.instrumentId = 'fork';
      forkGroup.add(forkRight);

      const forkAura = new Mesh(
        new TorusGeometry(0.48, 0.028, 12, 60),
        new MeshBasicMaterial({ color: 0x74d9ff, transparent: true, opacity: 0.34 }),
      );
      forkAura.rotation.x = Math.PI / 2;
      forkAura.position.set(0, 1.36, 0);
      forkAura.visible = false;
      forkGroup.add(forkAura);

      const drumGroup = new Group();
      drumGroup.position.set(2.3, 0.08, -0.1);
      drumGroup.userData.instrumentId = 'drum';
      scene.add(drumGroup);

      const drumBody = new Mesh(
        new CylinderGeometry(0.7, 0.84, 1, 36),
        createLabWoodMaterial({ color: 0x8d4329, roughness: 0.66 }),
      );
      drumBody.position.y = 0.55;
      drumBody.castShadow = true;
      drumBody.receiveShadow = true;
      drumBody.userData.instrumentId = 'drum';
      drumGroup.add(drumBody);

      const drumHead = new Mesh(
        new CylinderGeometry(0.72, 0.72, 0.08, 36),
        createLabCeramicMaterial({ color: 0xf6eee1, roughness: 0.38 }),
      );
      drumHead.position.y = 1.06;
      drumHead.castShadow = true;
      drumHead.userData.instrumentId = 'drum';
      drumGroup.add(drumHead);

      const drumRing = new Mesh(
        new TorusGeometry(0.72, 0.032, 12, 50),
        createLabMetalMaterial({ color: 0xcfd8e5, roughness: 0.18, metalness: 0.94 }),
      );
      drumRing.rotation.x = Math.PI / 2;
      drumRing.position.y = 1.09;
      drumRing.userData.instrumentId = 'drum';
      drumGroup.add(drumRing);

      const drumAura = new Mesh(
        new RingGeometry(0.64, 0.92, 48),
        new MeshBasicMaterial({ color: 0xffbf62, transparent: true, opacity: 0.28, side: DoubleSide }),
      );
      drumAura.rotation.x = -Math.PI / 2;
      drumAura.position.y = 1.12;
      drumAura.visible = false;
      drumGroup.add(drumAura);

      const paperBits: Mesh[] = [];
      const paperMaterial = createLabCeramicMaterial({ color: 0xf7fafc, roughness: 0.58 });
      for (const [x, z] of [[-0.18, 0.08], [0.12, -0.06], [0.04, 0.18], [-0.08, -0.14]]) {
        const bit = new Mesh(new BoxGeometry(0.12, 0.022, 0.08), paperMaterial);
        bit.position.set(x, 1.22, z);
        bit.rotation.set(Math.random() * 0.4, Math.random() * 0.4, Math.random() * 0.2);
        bit.castShadow = true;
        bit.userData.instrumentId = 'drum';
        bit.userData.baseX = x;
        bit.userData.baseZ = z;
        drumGroup.add(bit);
        paperBits.push(bit);
      }

      const hoverRing = new Mesh(
        new TorusGeometry(0.82, 0.03, 14, 48),
        createLabCoatedMetalMaterial({ color: 0xbaf1ff, emissive: 0xbaf1ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.84, roughness: 0.24, metalness: 0.22 }),
      );
      hoverRing.rotation.x = Math.PI / 2;
      hoverRing.visible = false;
      scene.add(hoverRing);

      sceneObjectsRef.current = {
        bandGroup,
        bandLines,
        bandAura,
        forkGroup,
        forkLeft,
        forkRight,
        forkAura,
        drumGroup,
        drumHead,
        drumAura,
        paperBits,
        hoverRing,
      };

      interactiveObjectsRef.current = [bandGroup, forkGroup, drumGroup];

      const updatePointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(pointerRef.current, camera);
        const hits = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);
        const hit = hits.find((entry) => entry.object.userData.instrumentId || entry.object.parent?.userData.instrumentId);
        const instrumentId = (hit?.object.userData.instrumentId ?? hit?.object.parent?.userData.instrumentId ?? null) as InstrumentId | null;
        hoveredInstrumentRef.current = instrumentId;
        setHoveredInstrument(instrumentId);
        renderer.domElement.style.cursor = instrumentId ? 'pointer' : 'grab';
      };

      const handlePointerMove = (event: PointerEvent) => updatePointer(event);
      const handlePointerLeave = () => {
        hoveredInstrumentRef.current = null;
        setHoveredInstrument(null);
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
      const active = triggeredRef.current;
      const t = time * 0.001;
      const hovered = hoveredInstrumentRef.current;

      const bandActive = active.includes('band');
      const forkActive = active.includes('fork');
      const drumActive = active.includes('drum');

      objects.bandLines.forEach((line, index) => {
        const phase = t * 20 + index * 0.8;
        line.position.z = bandActive ? Math.sin(phase) * 0.06 : 0;
        line.rotation.y = bandActive ? Math.sin(phase * 0.7) * 0.1 : 0;
        line.scale.y = bandActive ? 1 + Math.abs(Math.sin(phase)) * 0.05 : 1;
        const material = line.material;
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.emissive = new Color(0xffd47f);
          material.emissiveIntensity = hovered === 'band' ? 0.38 : bandActive ? 0.18 : 0.04;
        }
      });

      if (objects.bandAura) {
        objects.bandAura.visible = bandActive || hovered === 'band';
        objects.bandAura.scale.setScalar(1 + Math.sin(t * 5) * (bandActive ? 0.12 : 0.04));
        const material = objects.bandAura.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = bandActive ? 0.36 : hovered === 'band' ? 0.22 : 0;
        }
      }
      setEmissive(objects.bandGroup, 0xffc86a, hovered === 'band' ? 0.28 : bandActive ? 0.1 : 0.02);

      if (objects.forkLeft && objects.forkRight) {
        const spread = forkActive ? Math.sin(t * 26) * 0.028 : 0;
        objects.forkLeft.position.x = -0.22 - spread;
        objects.forkRight.position.x = 0.22 + spread;
        if (objects.forkGroup) {
          objects.forkGroup.rotation.z = forkActive ? Math.sin(t * 13) * 0.012 : 0;
        }
      }
      if (objects.forkAura) {
        objects.forkAura.visible = forkActive || hovered === 'fork';
        objects.forkAura.scale.setScalar(1 + Math.sin(t * 4.4) * (forkActive ? 0.18 : 0.05));
        const material = objects.forkAura.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = forkActive ? 0.34 : hovered === 'fork' ? 0.22 : 0;
        }
      }
      setEmissive(objects.forkGroup, 0x84e2ff, hovered === 'fork' ? 0.32 : forkActive ? 0.12 : 0.03);

      if (objects.drumHead) {
        const pulse = drumActive ? Math.sin(t * 18) : 0;
        objects.drumHead.position.y = 1.06 + pulse * 0.03;
        objects.drumHead.scale.set(1 + Math.abs(pulse) * 0.03, 1, 1 + Math.abs(pulse) * 0.03);
      }
      objects.paperBits.forEach((bit, index) => {
        const baseX = typeof bit.userData.baseX === 'number' ? bit.userData.baseX : bit.position.x;
        const baseZ = typeof bit.userData.baseZ === 'number' ? bit.userData.baseZ : bit.position.z;
        const lift = drumActive ? Math.abs(Math.sin(t * 7 + index * 0.7)) * 0.34 : 0;
        const drift = drumActive ? Math.sin(t * 5 + index * 1.2) * 0.05 : 0;
        bit.position.set(baseX + drift, 1.22 + lift, baseZ + Math.cos(t * 4.8 + index) * (drumActive ? 0.04 : 0));
        bit.rotation.set(Math.sin(t * 6 + index) * 0.6, Math.cos(t * 5.5 + index) * 0.5, Math.sin(t * 4.2 + index) * 0.4);
      });
      if (objects.drumAura) {
        objects.drumAura.visible = drumActive || hovered === 'drum';
        objects.drumAura.scale.setScalar(1 + Math.sin(t * 3.6) * (drumActive ? 0.16 : 0.05));
        const material = objects.drumAura.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = drumActive ? 0.32 : hovered === 'drum' ? 0.18 : 0;
        }
      }
      setEmissive(objects.drumGroup, 0xffc868, hovered === 'drum' ? 0.24 : drumActive ? 0.08 : 0.02);

      if (objects.hoverRing) {
        objects.hoverRing.visible = hovered !== null;
        if (hovered === 'band' && objects.bandGroup) {
          objects.hoverRing.position.set(objects.bandGroup.position.x, 0.2, objects.bandGroup.position.z);
        }
        if (hovered === 'fork' && objects.forkGroup) {
          objects.hoverRing.position.set(objects.forkGroup.position.x, 0.2, objects.forkGroup.position.z);
        }
        if (hovered === 'drum' && objects.drumGroup) {
          objects.hoverRing.position.set(objects.drumGroup.position.x, 0.2, objects.drumGroup.position.z);
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
    <div className="three-stage-shell sound-three-shell">
      <div className="three-stage-mount sound-three-mount" ref={mountRef} />
      <div className="three-stage-overlay sound-three-overlay">
        <div className="three-stage-chip-row">
          <span className="three-stage-chip">3D 器材台</span>
          <span className="three-stage-chip">可拖动视角</span>
          <span className="three-stage-chip strong">{overlayTitle}</span>
        </div>
        <div className="sound-three-legend">
          <div className={triggeredInstruments.includes('band') ? 'legend-pill active' : 'legend-pill'}>皮筋盒</div>
          <div className={triggeredInstruments.includes('fork') ? 'legend-pill active float' : 'legend-pill float'}>音叉</div>
          <div className={triggeredInstruments.includes('drum') ? 'legend-pill active sink' : 'legend-pill sink'}>小鼓</div>
        </div>
        <div className="sound-three-hint">近景模式更适合看振幅变化；悬停器材可查看振动说明。</div>
      </div>
      {hoveredInstrument ? (
        <div className="sound-three-hovercard">
          <strong>{instrumentLabels[hoveredInstrument]}</strong>
          <p>{instrumentFacts[hoveredInstrument]}</p>
        </div>
      ) : null}
    </div>
  );
}
