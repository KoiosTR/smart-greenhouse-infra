import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * Prosedürel Venlo sera sahnesi. Scene graph (isimler koddan erişim için sabittir):
 *
 * Greenhouse_Root
 * ├── Structure (Mesh_Columns, Mesh_Trusses, Mesh_RoofGutters, Mesh_Foundation, Glass_Panels)
 * ├── Vegetation (Mesh_Hydroponic_Gutters, Mesh_Crops_Foliage)
 * ├── Actuators (GrowLights, RoofVents, Heating, VentilationFans, Irrigation, Fogging)
 * └── SensorNodes (Sensor_Node_Center / East / West / North)
 *
 * Birim: metre. Orijin sera tabanının merkezi, Y yukarı.
 * Çatı menfezleri: pivot ana makas sırtında (hinge). rotation.z < 0 sol menfezi, > 0 sağ menfezi açar.
 * Fan kanatları: pivot fan merkezinde, rotation.z ile döner.
 */

const H = 3.5; // saçak (eave) yüksekliği
const R = 0.9; // çatı yükselmesi
const BAY = 3.2;
const BAY_X = [-BAY, 0, BAY];
const GUTTER_X = [-4.8, -1.6, 1.6, 4.8];
const FRAMES = [-6, -4, -2, 0, 2, 4, 6];
const ROWS = BAY_X.flatMap((c) => [c - 0.7, c + 0.7]);
const SLOPE = Math.atan2(R, BAY / 2);
const SLOPE_LEN = Math.hypot(R, BAY / 2);
const VENT_OPEN = 0.75; // rad
const FAN_SPEED = 14; // rad/s
const FAN_POS = [[-BAY, 2.8, -3], [0, 2.8, -3], [0, 2.8, 3], [BAY, 2.8, 3]];
const NOZZLE_Z = Array.from({ length: 11 }, (_, i) => -5.5 + i * 1.1);
const NOZZLES = BAY_X.flatMap((x) => NOZZLE_Z.map((z) => [x, 3.88, z]));
const MIST_PER_NOZZLE = 10;
const LIGHT_Z = [-4.2, -1.4, 1.4, 4.2];

const box = (sx, sy, sz, x, y, z, rz = 0) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
};
const pipeZ = (r, len, x, y, z, seg = 8) =>
  new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function buildGeometries() {
  const columns = [];
  GUTTER_X.forEach((x) => FRAMES.forEach((z) => columns.push(box(0.12, H, 0.12, x, H / 2, z))));

  const trusses = [];
  BAY_X.forEach((c) => {
    FRAMES.forEach((z) => {
      trusses.push(box(SLOPE_LEN, 0.07, 0.07, c - BAY / 4, H + R / 2, z, SLOPE));
      trusses.push(box(SLOPE_LEN, 0.07, 0.07, c + BAY / 4, H + R / 2, z, -SLOPE));
      trusses.push(box(BAY, 0.06, 0.06, c, H - 0.15, z));
      trusses.push(box(0.05, R + 0.15, 0.05, c, H + (R - 0.15) / 2, z));
    });
    trusses.push(box(0.08, 0.08, 12.2, c, H + R, 0));
    trusses.push(box(0.05, 0.05, 12.2, c - BAY / 4, H + R / 2 - 0.05, 0));
    trusses.push(box(0.05, 0.05, 12.2, c + BAY / 4, H + R / 2 - 0.05, 0));
  });

  const roofGutters = GUTTER_X.map((x) => box(0.26, 0.14, 12.3, x, H - 0.02, 0));

  const foundation = [
    box(9.9, 0.12, 12.3, 0, -0.06, 0),
    box(9.9, 0.3, 0.12, 0, 0.15, -6.1),
    box(9.9, 0.3, 0.12, 0, 0.15, 6.1),
    box(0.12, 0.3, 12.3, -4.9, 0.15, 0),
    box(0.12, 0.3, 12.3, 4.9, 0.15, 0),
  ];
  const weedBarrier = box(9.6, 0.01, 11.9, 0, 0.006, 0);
  const drain = box(0.4, 0.02, 12, 0, 0.012, 0);

  const glassWalls = [
    box(0.02, H, 12, -4.8, H / 2, 0),
    box(0.02, H, 12, 4.8, H / 2, 0),
    box(9.6, H, 0.02, 0, H / 2, -6),
    box(9.6, H, 0.02, 0, H / 2, 6),
  ];
  const gable = new THREE.Shape([new THREE.Vector2(-BAY / 2, 0), new THREE.Vector2(BAY / 2, 0), new THREE.Vector2(0, R)]);
  BAY_X.forEach((c) => [-6, 6].forEach((z) =>
    glassWalls.push(new THREE.ShapeGeometry(gable).translate(c, H, z))));

  const glassRoof = [];
  BAY_X.forEach((c) => {
    const segs = c === 0 ? [[-4, 4], [4, 4]] : [[0, 12]]; // orta bay'de [-2,2] menfez için boş
    segs.forEach(([zc, len]) => {
      glassRoof.push(box(SLOPE_LEN, 0.012, len, c - BAY / 4, H + R / 2 + 0.05, zc, SLOPE));
      glassRoof.push(box(SLOPE_LEN, 0.012, len, c + BAY / 4, H + R / 2 + 0.05, zc, -SLOPE));
    });
  });

  const gutters = [];
  ROWS.forEach((x) => {
    gutters.push(box(0.22, 0.1, 11.4, x, 0.85, 0));
    [-5, -3, -1, 1, 3, 5].forEach((z) => gutters.push(box(0.04, 0.8, 0.04, x, 0.4, z)));
  });

  const lightHousing = [];
  const lightLed = [];
  ROWS.forEach((x) => LIGHT_Z.forEach((z) => {
    lightHousing.push(box(0.2, 0.07, 2.0, x, 3.0, z));
    lightHousing.push(box(0.012, 0.3, 0.012, x, 3.19, z - 0.85));
    lightHousing.push(box(0.012, 0.3, 0.012, x, 3.19, z + 0.85));
    lightLed.push(box(0.15, 0.015, 1.9, x, 2.96, z));
  }));

  const heatPipes = [];
  ROWS.forEach((x) => [-0.35, 0.35].forEach((dx) => heatPipes.push(pipeZ(0.028, 11.6, x + dx, 0.22, 0, 10))));

  const drip = [];
  ROWS.forEach((x) => {
    drip.push(pipeZ(0.008, 11.2, x, 0.99, 0, 6));
    for (let z = -5.4; z <= 5.4; z += 0.55) drip.push(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5).translate(x + 0.03, 0.95, z));
  });

  const nozzles = [];
  BAY_X.forEach((x) => nozzles.push(pipeZ(0.012, 12, x, 3.95, 0, 5)));
  NOZZLES.forEach(([x, y, z]) => nozzles.push(new THREE.ConeGeometry(0.025, 0.07, 6).rotateX(Math.PI).translate(x, y, z)));

  const fanHousing = FAN_POS.map(() => mergeGeometries([
    new THREE.TorusGeometry(0.32, 0.03, 8, 28),
    box(0.03, 0.56, 0.03, 0, 0.6, 0),
    box(0.64, 0.02, 0.02, 0, 0, 0.03),
    box(0.02, 0.64, 0.02, 0, 0, 0.03),
  ]));
  const fanBlades = FAN_POS.map(() => {
    const parts = [new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12).rotateX(Math.PI / 2)];
    for (let k = 0; k < 4; k++) {
      parts.push(new THREE.BoxGeometry(0.26, 0.075, 0.008).rotateX(0.45).translate(0.17, 0, 0).rotateZ((k * Math.PI) / 2));
    }
    return mergeGeometries(parts);
  });

  const m = mergeGeometries;
  return {
    columns: m(columns), trusses: m(trusses), roofGutters: m(roofGutters), foundation: m(foundation),
    weedBarrier, drain, glassWalls: m(glassWalls), glassRoof: m(glassRoof), gutters: m(gutters),
    lightHousing: m(lightHousing), lightLed: m(lightLed), heatPipes: m(heatPipes), drip: m(drip),
    nozzles: m(nozzles), fanHousing, fanBlades,
    ventGlass: box(SLOPE_LEN, 0.012, 4, 0, 0, 0),
    ventFrame: m([
      box(SLOPE_LEN, 0.04, 0.05, 0, 0, -2), box(SLOPE_LEN, 0.04, 0.05, 0, 0, 2),
      box(0.05, 0.04, 4, -SLOPE_LEN / 2, 0, 0), box(0.05, 0.04, 4, SLOPE_LEN / 2, 0, 0),
    ]),
  };
}

function buildFoliage() {
  const rand = rng(42);
  const plants = ROWS.flatMap((x) => {
    const out = [];
    for (let z = -5.4; z <= 5.41; z += 0.55) out.push([x + (rand() - 0.5) * 0.04, z]);
    return out;
  });
  const LEAVES = 8;
  const FRUITS = 3;

  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.017, 1.4, 5).translate(0, 0.7, 0),
    new THREE.MeshStandardMaterial({ color: '#4d7c0f', roughness: 0.8 }), plants.length);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4).scale(0.2, 0.025, 0.11).translate(0.14, 0, 0),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65, side: THREE.DoubleSide }), plants.length * LEAVES);
  const fruits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), plants.length * FRUITS);

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let li = 0;
  let fi = 0;
  plants.forEach(([x, z], pi) => {
    const s = 0.85 + rand() * 0.25;
    d.rotation.set(0, 0, 0);
    d.position.set(x, 0.9, z);
    d.scale.set(1, s, 1);
    d.updateMatrix();
    stems.setMatrixAt(pi, d.matrix);

    d.rotation.order = 'YZX';
    for (let i = 0; i < LEAVES; i++) {
      const a = rand() * Math.PI * 2;
      const y = 1.0 + (i / LEAVES) * 1.25 * s + rand() * 0.1;
      d.position.set(x + Math.cos(a) * 0.015, y, z + Math.sin(a) * 0.015);
      d.rotation.set(0, -a, -0.25 + rand() * 0.2);
      const sc = 0.8 + rand() * 0.6;
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      leaves.setMatrixAt(li, d.matrix);
      leaves.setColorAt(li++, col.setHSL(0.27 + rand() * 0.05, 0.55, 0.2 + rand() * 0.12));
    }
    d.rotation.order = 'XYZ';
    for (let i = 0; i < FRUITS; i++) {
      const a = rand() * Math.PI * 2;
      d.position.set(x + Math.cos(a) * 0.08, 1.15 + rand() * 0.5, z + Math.sin(a) * 0.08);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.8 + rand() * 0.4);
      d.updateMatrix();
      fruits.setMatrixAt(fi, d.matrix);
      fruits.setColorAt(fi++, col.setHSL(0.0 + rand() * 0.04, 0.8, 0.4 + rand() * 0.08));
    }
  });
  return { stems, leaves, fruits };
}

function buildMist() {
  const n = NOZZLES.length * MIST_PER_NOZZLE;
  const rand = rng(7);
  const vel = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) vel[i] = (rand() - 0.5) * 0.7;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const material = new THREE.PointsMaterial({
    color: '#e0f2fe', size: 0.07, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, vel };
}

function buildMaterials() {
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  return {
    steel: std('#aab4be', 0.85, 0.35),
    paint: std('#f8fafc', 0.1, 0.45),
    alu: std('#d6dbe0', 0.9, 0.3),
    concrete: std('#cfd4d9', 0, 0.9),
    barrier: std('#f1f5f9', 0, 0.95),
    drain: std('#64748b', 0.5, 0.5),
    plastic: std('#ffffff', 0, 0.5),
    housing: std('#334155', 0.6, 0.4),
    brass: std('#d4a017', 0.9, 0.3),
    fan: std('#1f2937', 0.5, 0.5),
    blade: std('#e2e8f0', 0.2, 0.4, { side: THREE.DoubleSide }),
    node: std('#f1f5f9', 0.2, 0.5),
    nodeLed: std('#0b3d1f', 0, 0.4, { emissive: '#22c55e', emissiveIntensity: 1 }),
    led: std('#f8fafc', 0, 0.3, { emissive: '#ff6ad5', emissiveIntensity: 0.05 }),
    pipes: std('#475569', 0.6, 0.4, { emissive: '#ff5a14', emissiveIntensity: 0 }),
    drip: std('#1e3a5f', 0.2, 0.5, { emissive: '#38bdf8', emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#bfe6f2', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.2,
      depthWrite: false, envMapIntensity: 1.3, side: THREE.DoubleSide,
    }),
  };
}

const SENSORS = [
  ['Sensor_Node_Center', [0, 2.0, 0]],
  ['Sensor_Node_East', [4.2, 2.0, 0]],
  ['Sensor_Node_West', [-4.2, 2.0, 0]],
  ['Sensor_Node_North', [0, 2.0, -5.2]],
];

/**
 * state: { growLight, heating, irrigation, fogging, fans, vent } (boolean)
 * children, Greenhouse_Root içine eklenir (örn. <Html> pinleri) ve model ile birlikte döner.
 */
export default function GreenhouseScene({ state = {}, rotate = false, children }) {
  const G = useMemo(buildGeometries, []);
  const M = useMemo(buildMaterials, []);
  const foliage = useMemo(buildFoliage, []);
  const mist = useMemo(buildMist, []);

  const root = useRef();
  const ventL = useRef();
  const ventR = useRef();
  const blades = useRef([]);
  const lightRefs = useRef([]);
  const anim = useRef({ vent: 0, fan: 0, light: 0, heat: 0, irr: 0, fog: 0 });

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const a = anim.current;
    const k = 1 - Math.exp(-dt * 3);
    const to = (key, on) => { a[key] += ((on ? 1 : 0) - a[key]) * k; };
    to('vent', state.vent); to('fan', state.fans); to('light', state.growLight);
    to('heat', state.heating); to('irr', state.irrigation); to('fog', state.fogging);

    if (rotate && root.current) root.current.rotation.y += dt * 0.3;
    if (ventL.current) ventL.current.rotation.z = -a.vent * VENT_OPEN;
    if (ventR.current) ventR.current.rotation.z = a.vent * VENT_OPEN;
    blades.current.forEach((b) => { if (b) b.rotation.z -= dt * FAN_SPEED * a.fan; });

    M.led.emissiveIntensity = 0.05 + a.light * 3;
    M.pipes.emissiveIntensity = a.heat * 1.8;
    M.drip.emissiveIntensity = a.irr * 1.6;
    M.nodeLed.emissiveIntensity = 1 + 0.8 * Math.sin(clock.elapsedTime * 3);

    const [pink, orange, blue] = lightRefs.current;
    if (pink) pink.forEach((l) => { l.intensity = a.light * 30; });
    if (orange) orange.forEach((l) => { l.intensity = a.heat * 8; });
    if (blue) blue.forEach((l) => { l.intensity = a.irr * 6; });

    mist.points.material.opacity = a.fog * 0.55;
    if (a.fog > 0.01) {
      const pos = mist.points.geometry.attributes.position;
      const t0 = clock.elapsedTime * 0.6;
      NOZZLES.forEach(([x, y, z], n) => {
        for (let p = 0; p < MIST_PER_NOZZLE; p++) {
          const i = n * MIST_PER_NOZZLE + p;
          const t = ((t0 + p / MIST_PER_NOZZLE + n * 0.137) % 1) * 1.8;
          pos.setXYZ(i, x + mist.vel[i * 2] * t, y - 0.6 * t - 0.45 * t * t, z + mist.vel[i * 2 + 1] * t);
        }
      });
      pos.needsUpdate = true;
    }
  });

  const lightSet = (idx, color, y, positions, distance) => (
    <group>
      {positions.map((x) => (
        <pointLight
          key={x} color={color} intensity={0} distance={distance} decay={2} position={[x, y, 0]}
          ref={(l) => { (lightRefs.current[idx] ||= [])[positions.indexOf(x)] = l; }}
        />
      ))}
    </group>
  );

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 14, 8]} intensity={1.5} />
      <directionalLight position={[-9, 6, -7]} intensity={0.4} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-12, 4, 0]} rotation-y={Math.PI / 2} scale={[24, 8, 1]} />
        <Lightformer form="rect" intensity={1} position={[12, 4, 6]} rotation-y={-Math.PI / 2} scale={[24, 8, 1]} />
      </Environment>

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.13, 0]}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color="#d5dde6" roughness={1} />
      </mesh>

      <group name="Greenhouse_Root" ref={root} position={[0, 0, 0]}>
        <group name="Structure">
          <mesh name="Mesh_Columns" geometry={G.columns} material={M.steel} />
          <mesh name="Mesh_Trusses" geometry={G.trusses} material={M.paint} />
          <mesh name="Mesh_RoofGutters" geometry={G.roofGutters} material={M.alu} />
          <mesh name="Mesh_Foundation" geometry={G.foundation} material={M.concrete} />
          <mesh name="Mesh_WeedBarrier" geometry={G.weedBarrier} material={M.barrier} />
          <mesh name="Mesh_DrainChannel" geometry={G.drain} material={M.drain} />
          <group name="Glass_Panels">
            <mesh name="Glass_Walls" geometry={G.glassWalls} material={M.glass} renderOrder={2} />
            <mesh name="Glass_Roof" geometry={G.glassRoof} material={M.glass} renderOrder={2} />
          </group>
        </group>

        <group name="Vegetation">
          <mesh name="Mesh_Hydroponic_Gutters" geometry={G.gutters} material={M.plastic} />
          <group name="Mesh_Crops_Foliage">
            <primitive object={foliage.stems} />
            <primitive object={foliage.leaves} />
            <primitive object={foliage.fruits} />
          </group>
        </group>

        <group name="Actuators">
          <group name="GrowLights">
            <mesh name="Housing" geometry={G.lightHousing} material={M.housing} />
            <mesh name="Actuator_GrowLight_EmissiveLED" geometry={G.lightLed} material={M.led} />
            {lightSet(0, '#f472b6', 2.7, BAY_X, 9)}
          </group>

          <group name="RoofVents">
            {[['Left', -1, ventL], ['Right', 1, ventR]].map(([side, s, ref]) => (
              <group key={side} name={`Actuator_RoofVent_${side}_01`} ref={ref} position={[0, H + R, 0]}>
                <group position={[s * BAY / 4, -R / 2 + 0.07, 0]} rotation-z={-s * SLOPE}>
                  <mesh geometry={G.ventGlass} material={M.glass} renderOrder={2} />
                  <mesh geometry={G.ventFrame} material={M.alu} />
                </group>
              </group>
            ))}
          </group>

          <group name="Heating">
            <mesh name="Actuator_Heating_Pipes" geometry={G.heatPipes} material={M.pipes} />
            {lightSet(1, '#f97316', 0.45, BAY_X, 5)}
          </group>

          <group name="VentilationFans">
            {FAN_POS.map((p, i) => (
              <group key={i} position={p}>
                <mesh name={`Actuator_CirculationFan_Housing_0${i + 1}`} geometry={G.fanHousing[i]} material={M.fan} />
                <mesh
                  name={`Actuator_CirculationFan_Blades_0${i + 1}`} geometry={G.fanBlades[i]} material={M.blade}
                  ref={(b) => { blades.current[i] = b; }}
                />
              </group>
            ))}
          </group>

          <group name="Irrigation">
            <mesh name="Actuator_Irrigation_DripLines" geometry={G.drip} material={M.drip} />
            {lightSet(2, '#38bdf8', 0.9, BAY_X, 4)}
          </group>

          <group name="Fogging">
            <mesh name="Actuator_Fog_Nozzles" geometry={G.nozzles} material={M.brass} />
            <primitive object={mist.points} />
          </group>
        </group>

        <group name="SensorNodes">
          {SENSORS.map(([name, pos]) => (
            <group key={name} name={name} position={pos}>
              <mesh position={[0, 0, 0]} material={M.node}><boxGeometry args={[0.16, 0.22, 0.1]} /></mesh>
              <mesh position={[0, 0.02, 0.052]} material={M.housing}><boxGeometry args={[0.1, 0.08, 0.004]} /></mesh>
              <mesh position={[0.05, -0.07, 0.053]} material={M.nodeLed}><sphereGeometry args={[0.012, 8, 6]} /></mesh>
              <mesh position={[0, 0.735, 0]} material={M.steel}><cylinderGeometry args={[0.004, 0.004, 1.25, 5]} /></mesh>
            </group>
          ))}
        </group>

        {children}
      </group>
    </>
  );
}
