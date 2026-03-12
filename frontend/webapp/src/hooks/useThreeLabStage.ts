import { useEffect, useRef } from 'react';
import { Color, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { attachLabRealism } from '../lib/threeRealism';

export interface ThreeLabStageContext {
  mountNode: HTMLDivElement;
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
}

interface UseThreeLabStageOptions {
  cameraPosition?: [number, number, number];
  target?: [number, number, number];
  background?: number;
  fov?: number;
  near?: number;
  far?: number;
  minDistance?: number;
  maxDistance?: number;
  enablePan?: boolean;
  deps?: readonly unknown[];
  onSetup?: (context: ThreeLabStageContext) => void | (() => void);
  onFrame?: (context: ThreeLabStageContext, time: number) => void;
}

export function useThreeLabStage({
  cameraPosition = [6.6, 4.8, 7.4],
  target = [0, 1.4, 0],
  background = 0x08111d,
  fov = 40,
  near = 0.1,
  far = 100,
  minDistance = 4.6,
  maxDistance = 12,
  enablePan = false,
  deps = [],
  onSetup,
  onFrame,
}: UseThreeLabStageOptions) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef(onSetup);
  const frameRef = useRef(onFrame);

  useEffect(() => {
    setupRef.current = onSetup;
    frameRef.current = onFrame;
  }, [onFrame, onSetup]);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    const scene = new Scene();
    scene.background = new Color(background);

    const camera = new PerspectiveCamera(fov, mountNode.clientWidth / mountNode.clientHeight, near, far);
    camera.position.set(...cameraPosition);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    mountNode.appendChild(renderer.domElement);

    const realism = attachLabRealism(renderer, scene, {
      exposure: 1.08,
      environmentIntensity: 0.9,
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = enablePan;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.target.set(...target);
    controls.update();

    const context: ThreeLabStageContext = {
      mountNode,
      scene,
      camera,
      renderer,
      controls,
    };

    const teardown = setupRef.current?.(context);

    const handleResize = () => {
      const width = mountNode.clientWidth;
      const height = mountNode.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrame: number | null = null;
    const animate = (time: number) => {
      animationFrame = window.requestAnimationFrame(animate);
      controls.update();
      frameRef.current?.(context, time);
      renderer.render(scene, camera);
    };

    animate(0);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (typeof teardown === 'function') teardown();
      realism.dispose();
      controls.dispose();
      renderer.dispose();
      scene.clear();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, deps);

  return mountRef;
}
