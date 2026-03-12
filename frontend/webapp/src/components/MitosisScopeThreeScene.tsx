import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PointLight, Raycaster, SRGBColorSpace, TorusGeometry, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useThreeLabStage, type ThreeLabStageContext } from '../hooks/useThreeLabStage';
import { createLabCoatedMetalMaterial, createLabGlassMaterial, createLabMetalMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type CameraPreset = 'bench' | 'slide' | 'microscope';
type HoverPart = 'objective' | 'focus' | 'stage';

interface MitosisScopeThreeSceneProps {
  cameraPreset: CameraPreset;
  slideReady: boolean;
  focused: boolean;
}

interface ScopeSceneObjects {
  microscopeGroup: Group | null;
  objective: Mesh | null;
  focusKnob: Mesh | null;
  stage: Mesh | null;
  slideMesh: Mesh | null;
  viewportPlane: Mesh | null;
  hoverRing: Mesh | null;
}

const partFacts: Record<HoverPart, { title: string; detail: string }> = {
  objective: {
    title: '物镜',
    detail: '物镜距离样本很近，只有前处理规范时才能获得稳定清晰的图像。',
  },
  focus: {
    title: '调焦旋钮',
    detail: '调焦时要先让样本进入大致清晰范围，再细调到边界锐利。',
  },
  stage: {
    title: '载物台与样本',
    detail: '装片固定稳定后，显微图像才能用于识别典型有丝分裂时期。',
  },
};

function applyCameraPreset(preset: CameraPreset, camera: PerspectiveCamera, controls: OrbitControls) {
  const target = new Vector3(0.4, 1.5, 0);
  const position = new Vector3(5.8, 3.8, 6.2);

  if (preset === 'microscope') {
    target.set(0.7, 1.8, 0);
    position.set(3.2, 2.4, 4.2);
  }

  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
}

function drawScopeTexture(canvas: HTMLCanvasElement, slideReady: boolean, focused: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  const background = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.12, size * 0.5, size * 0.5, size * 0.5);
  background.addColorStop(0, slideReady ? '#ffdff7' : '#d8bfd3');
  background.addColorStop(1, '#5b3658');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size * 0.5, size * 0.5);

  for (const [x, y, radius] of [[-120, -60, 32], [110, 76, 26], [-30, 110, 20]]) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(167, 79, 157, 0.28)';
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!slideReady) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (!focused) {
    ctx.fillStyle = 'rgba(132, 48, 118, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 88, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(14, -8, 84, 54, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = 'rgba(189, 97, 176, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 128, 92, -0.1, 0, Math.PI * 2);
  ctx.fill();

  const cells = [
    { x: -96, y: -58, r: 28, clear: false },
    { x: 84, y: 72, r: 22, clear: false },
    { x: -28, y: 102, r: 18, clear: false },
    { x: 18, y: -2, r: 54, clear: true },
  ];

  cells.forEach((cell) => {
    ctx.beginPath();
    ctx.fillStyle = cell.clear ? 'rgba(220, 144, 205, 0.52)' : 'rgba(186, 100, 172, 0.28)';
    ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2);
    ctx.fill();

    if (!cell.clear) return;

    ctx.strokeStyle = 'rgba(105, 30, 112, 0.92)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (const offset of [-18, -6, 6, 18]) {
      ctx.beginPath();
      ctx.moveTo(cell.x + offset - 10, cell.y - 22);
      ctx.lineTo(cell.x + offset + 10, cell.y + 20);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, cell.r + 12, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.restore();
}

export function MitosisScopeThreeScene({ cameraPreset, slideReady, focused }: MitosisScopeThreeSceneProps) {
  const slideReadyRef = useRef(slideReady);
  const focusedRef = useRef(focused);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const sceneObjectsRef = useRef<ScopeSceneObjects>({
    microscopeGroup: null,
    objective: null,
    focusKnob: null,
    stage: null,
    slideMesh: null,
    viewportPlane: null,
    hoverRing: null,
  });
  const hoveredPartRef = useRef<HoverPart | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const [hoveredPart, setHoveredPart] = useState<HoverPart | null>(null);

  slideReadyRef.current = slideReady;
  focusedRef.current = focused;

  const overlayTitle = useMemo(() => {
    if (!slideReady) return '待放置规范装片';
    if (focused) return '显微图像已清晰';
    return '待调焦';
  }, [slideReady, focused]);

  const mountRef = useThreeLabStage({
    cameraPosition: [5.8, 3.8, 6.2],
    target: [0.4, 1.5, 0],
    minDistance: 4.2,
    maxDistance: 10.5,
    background: 0x100f18,
    deps: [],
    onSetup: ({ scene, camera, controls, renderer }: ThreeLabStageContext) => {
      cameraRef.current = camera;
      controlsRef.current = controls;
      applyCameraPreset(cameraPreset, camera, controls);

      const ambient = new AmbientLight(0xece7ff, 1.35);
      scene.add(ambient);

      const keyLight = new DirectionalLight(0xffffff, 1.8);
      keyLight.position.set(6.4, 8.6, 5.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);

      const rimLight = new PointLight(0x8ad7ff, 0.96, 16, 2.1);
      rimLight.position.set(-4.4, 3.2, -3.2);
      scene.add(rimLight);

      const table = new Mesh(
        new BoxGeometry(8.8, 0.34, 5.6),
        createLabWoodMaterial({ color: 0x62422f, roughness: 0.76 }),
      );
      table.position.set(0, -0.24, 0);
      table.receiveShadow = true;
      scene.add(table);

      const microscopeGroup = new Group();
      microscopeGroup.position.set(0.2, 0.02, 0);
      scene.add(microscopeGroup);

      const metalMaterial = createLabMetalMaterial({ color: 0xd4dce7, roughness: 0.18, metalness: 0.96 });
      const darkMaterial = createLabCoatedMetalMaterial({ color: 0x313845, roughness: 0.34, metalness: 0.36 });
      const rubberMaterial = createLabRubberMaterial({ color: 0x222834, roughness: 0.84 });
      const glassMaterial = createLabGlassMaterial({ color: 0xe6f4ff, opacity: 0.2, transmission: 0.94, thickness: 0.14, attenuationDistance: 1.2, attenuationColor: 0xe9f6ff });

      const base = new Mesh(new BoxGeometry(2.4, 0.3, 1.8), darkMaterial);
      base.position.set(0, 0.16, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      microscopeGroup.add(base);

      const arm = new Mesh(new TorusGeometry(0.76, 0.14, 18, 42, Math.PI), darkMaterial);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(-0.3, 1.34, 0);
      arm.castShadow = true;
      microscopeGroup.add(arm);

      const tube = new Mesh(new CylinderGeometry(0.2, 0.26, 1.5, 22), metalMaterial);
      tube.position.set(0.6, 2.2, 0);
      tube.rotation.z = 0.34;
      tube.castShadow = true;
      microscopeGroup.add(tube);

      const eyepiece = new Mesh(new CylinderGeometry(0.18, 0.2, 0.24, 20), rubberMaterial);
      eyepiece.position.set(0.28, 2.76, 0);
      eyepiece.rotation.z = 0.34;
      eyepiece.castShadow = true;
      microscopeGroup.add(eyepiece);

      const objective = new Mesh(new CylinderGeometry(0.14, 0.2, 0.88, 20), darkMaterial);
      objective.position.set(1.02, 1.52, 0);
      objective.rotation.z = 0.34;
      objective.castShadow = true;
      objective.userData.hoverPart = 'objective';
      microscopeGroup.add(objective);

      const objectiveLens = new Mesh(new CylinderGeometry(0.1, 0.1, 0.03, 18), glassMaterial);
      objectiveLens.position.set(1.16, 1.1, 0);
      objectiveLens.rotation.z = 0.34;
      microscopeGroup.add(objectiveLens);

      const stage = new Mesh(new BoxGeometry(1.7, 0.12, 1.18), metalMaterial);
      stage.position.set(0.84, 1.02, 0);
      stage.castShadow = true;
      stage.receiveShadow = true;
      stage.userData.hoverPart = 'stage';
      microscopeGroup.add(stage);

      const stageClipLeft = new Mesh(new BoxGeometry(0.12, 0.05, 0.22), createLabMetalMaterial({ color: 0x9eabb7, roughness: 0.22 }));
      stageClipLeft.position.set(0.36, 1.09, -0.28);
      stageClipLeft.castShadow = true;
      microscopeGroup.add(stageClipLeft);
      const stageClipRight = stageClipLeft.clone();
      stageClipRight.position.z = 0.28;
      microscopeGroup.add(stageClipRight);

      const slideMesh = new Mesh(
        new BoxGeometry(1.22, 0.04, 0.44),
        glassMaterial,
      );
      slideMesh.position.set(0.88, 1.1, 0);
      slideMesh.visible = slideReady;
      microscopeGroup.add(slideMesh);

      const focusKnob = new Mesh(new CylinderGeometry(0.24, 0.24, 0.18, 24), rubberMaterial);
      focusKnob.position.set(-0.18, 1.36, 0.82);
      focusKnob.rotation.x = Math.PI / 2;
      focusKnob.castShadow = true;
      focusKnob.userData.hoverPart = 'focus';
      microscopeGroup.add(focusKnob);

      const lensRing = new Mesh(
        new TorusGeometry(0.92, 0.12, 18, 60),
        createLabCoatedMetalMaterial({ color: 0x313643, roughness: 0.42, metalness: 0.34 }),
      );
      lensRing.position.set(1.9, 1.9, 0);
      lensRing.rotation.y = Math.PI / 2;
      lensRing.castShadow = true;
      microscopeGroup.add(lensRing);

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      canvasRef.current = canvas;
      drawScopeTexture(canvas, slideReadyRef.current, focusedRef.current);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      textureRef.current = texture;

      const viewportPlane = new Mesh(
        new CircleGeometry(0.82, 48),
        new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.96 }),
      );
      viewportPlane.position.set(1.94, 1.9, 0);
      viewportPlane.rotation.y = Math.PI / 2;
      microscopeGroup.add(viewportPlane);

      const eyepieceGlass = new Mesh(new CircleGeometry(0.78, 48), glassMaterial);
      eyepieceGlass.position.set(1.98, 1.9, 0);
      eyepieceGlass.rotation.y = Math.PI / 2;
      microscopeGroup.add(eyepieceGlass);

      const hoverRing = new Mesh(
        new TorusGeometry(0.5, 0.028, 12, 44),
        createLabCoatedMetalMaterial({ color: 0xeeb4ff, emissive: 0xeeb4ff, emissiveIntensity: 0.36, transparent: true, opacity: 0.82, roughness: 0.24, metalness: 0.22 }),
      );
      hoverRing.rotation.x = Math.PI / 2;
      hoverRing.visible = false;
      scene.add(hoverRing);

      sceneObjectsRef.current = {
        microscopeGroup,
        objective,
        focusKnob,
        stage,
        slideMesh,
        viewportPlane,
        hoverRing,
      };

      interactiveObjectsRef.current = [objective, focusKnob, stage];

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

      if (objects.focusKnob) {
        objects.focusKnob.rotation.z = focusedRef.current ? Math.sin(t * 2.4) * 0.12 : Math.sin(t * 1.6) * 0.04;
      }

      if (objects.stage) {
        objects.stage.position.y = focusedRef.current ? 1.05 + Math.sin(t * 2.4) * 0.01 : 1.02;
      }

      if (objects.slideMesh) {
        objects.slideMesh.visible = slideReadyRef.current;
      }

      if (objects.objective) {
        objects.objective.position.y = focusedRef.current ? 1.46 : 1.52;
      }

      if (objects.viewportPlane) {
        const material = objects.viewportPlane.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = slideReadyRef.current ? (focusedRef.current ? 0.98 : 0.82) : 0.42;
        }
      }

      if (objects.hoverRing) {
        objects.hoverRing.visible = hover !== null;
        if (hover === 'objective' && objects.objective) {
          objects.hoverRing.position.set(1.02, 1.18, 0);
        }
        if (hover === 'focus' && objects.focusKnob) {
          objects.hoverRing.position.set(-0.18, 1.04, 0.82);
        }
        if (hover === 'stage' && objects.stage) {
          objects.hoverRing.position.set(0.84, 1.08, 0);
          objects.hoverRing.scale.setScalar(1.32 + Math.sin(t * 4) * 0.04);
          return;
        }
        objects.hoverRing.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
      }
    },
  });

  useEffect(() => {
    if (canvasRef.current && textureRef.current) {
      drawScopeTexture(canvasRef.current, slideReady, focused);
      textureRef.current.needsUpdate = true;
    }
  }, [focused, slideReady]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    applyCameraPreset(cameraPreset, cameraRef.current, controlsRef.current);
  }, [cameraPreset]);

  return (
    <div className="three-stage-shell scope-three-shell">
      <div className="three-stage-mount scope-three-mount" ref={mountRef} />
      <div className="three-stage-overlay scope-three-overlay">
        <div className="three-stage-chip-row">
          <span className="three-stage-chip">3D 显微镜</span>
          <span className="three-stage-chip">可拖动视角</span>
          <span className="three-stage-chip strong">{overlayTitle}</span>
        </div>
        <div className="scope-three-hint">显微模式更适合观察物镜、调焦旋钮和视野变化。</div>
      </div>
      {hoveredPart ? (
        <div className="scope-three-hovercard">
          <strong>{partFacts[hoveredPart].title}</strong>
          <p>{partFacts[hoveredPart].detail}</p>
        </div>
      ) : null}
    </div>
  );
}
