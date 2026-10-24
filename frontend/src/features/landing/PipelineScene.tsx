import { useEffect, useMemo, useRef } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import {
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  OrthographicCamera,
  Vector3,
} from "three";

function FitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(size.width / 9.5, 100);
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, size.width, invalidate]);
  return null;
}

export interface PipelineSceneProps {
  selected: number;
  onSelect: (index: number) => void;
  animated: boolean;
}

const positions: [number, number, number][] = [
  [-3.1, 0, 0.3],
  [-1.55, 0.5, -0.5],
  [0, 0, 0],
  [1.55, 0.5, -0.5],
  [3.1, 0, 0.3],
];

function Packet({
  curve,
  offset,
  animated,
}: {
  curve: CatmullRomCurve3;
  offset: number;
  animated: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (mesh.current && animated)
      mesh.current.position.copy(
        curve.getPoint((clock.elapsedTime * 0.23 + offset) % 1),
      );
  });
  return (
    <mesh ref={mesh} position={curve.getPoint(offset)}>
      <sphereGeometry args={[0.065, 10, 10]} />
      <meshBasicMaterial color="#c9ffab" />
    </mesh>
  );
}

function Sculpture({ selected, onSelect, animated }: PipelineSceneProps) {
  const group = useRef<Group>(null);
  const curves = useMemo(
    () =>
      positions.slice(0, -1).map((start, i) => {
        const end = positions[i + 1];
        return new CatmullRomCurve3([
          new Vector3(...start),
          new Vector3((start[0] + end[0]) / 2, -0.35, 0.65),
          new Vector3(...end),
        ]);
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (group.current && animated)
      group.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.07;
  });
  return (
    <group ref={group}>
      {curves.map((curve, i) => (
        <group key={i}>
          <mesh>
            <tubeGeometry args={[curve, 36, 0.025, 6, false]} />
            <meshStandardMaterial
              color={i < 2 ? "#a5d184" : "#48523f"}
              metalness={0.65}
              roughness={0.28}
              emissive={i < 2 ? "#80c24b" : "#000000"}
              emissiveIntensity={0.22}
            />
          </mesh>
          {i < 2 && (
            <Packet curve={curve} offset={i * 0.4} animated={animated} />
          )}
        </group>
      ))}
      {positions.map((position, i) => {
        const color = i === 2 ? "#f29182" : i < 2 ? "#b9ef8c" : "#76846c";
        const select = (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(i);
        };
        return (
          <group key={i} position={position}>
            <RoundedBox
              args={[0.8, 0.8, 0.8]}
              radius={0.12}
              smoothness={4}
              rotation={[0, Math.PI / 4, 0]}
              onClick={select}
              onPointerOver={(event) => {
                event.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            >
              <meshStandardMaterial
                color={new Color(i === 2 ? "#673b35" : "#263423")}
                metalness={0.6}
                roughness={0.24}
                emissive={color}
                emissiveIntensity={selected === i ? 0.18 : 0.035}
              />
            </RoundedBox>
            <mesh position={[0, 0.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.26, 40]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry
                args={[
                  selected === i ? 0.72 : 0.6,
                  selected === i ? 0.018 : 0.008,
                  8,
                  64,
                ]}
              />
              <meshBasicMaterial
                color={selected === i ? "#e2ffd0" : color}
                transparent
                opacity={selected === i ? 0.9 : 0.28}
              />
            </mesh>
            <mesh position={[0, -0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.48, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0.07} />
            </mesh>
            {i === 2 && (
              <pointLight color="#fa8e72" intensity={2} distance={3} />
            )}
          </group>
        );
      })}
      <gridHelper
        onAfterRender={(renderer) => {
          if (!renderer.domElement.dataset.sceneReady)
            renderer.domElement.dataset.sceneReady = "true";
        }}
        args={[14, 28, "#34412c", "#20291b"]}
        position={[0, -0.8, 0]}
      />
    </group>
  );
}

export default function PipelineScene(props: PipelineSceneProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [3, 5, 10], zoom: 80 }}
      dpr={[1, 1.5]}
      frameloop={props.animated ? "always" : "demand"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <FitCamera />
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 7, 5]} intensity={3} color="#e6f3d7" />
      <pointLight position={[-5, 3, -2]} intensity={20} color="#b9ef8c" />
      <Sculpture {...props} />
      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        autoRotate={props.animated}
        autoRotateSpeed={0.3}
        minPolarAngle={0.45}
        maxPolarAngle={1.5}
        minAzimuthAngle={-0.65}
        maxAzimuthAngle={1.05}
        target={[0, -0.1, 0]}
      />
    </Canvas>
  );
}
