import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// Alüminyum çerçeveli, çok katlı NFT hidroponik marul serası (referans fotoğrafa göre).
// Birimler metre: genişlik 5 (x), uzunluk 10 (z), saçak 2.6, mahya 3.9. Kapı +z alınlığında.
const HW = 2.5;
const HL = 5;
const H = 2.6;
const RIDGE = 3.9;
const SLOPE = Math.atan2(RIDGE - H, HW);
const SLOPE_LEN = Math.hypot(HW, RIDGE - H);
const PANES_Z = 5;
const PANE_W = (2 * HL) / PANES_Z;
const FRAMES_Z = [-5, -3, -1, 1, 3, 5];
const RACK_X = [-1.95, -1.15, 1.15, 1.95];
const TIERS_Y = [0.45, 0.95, 1.45, 1.95];
const CH_LEN = 7; // kanal uzunluğu (uçlarda tank/boru alanı kalır)
const ALU = '#f1f4f7';
const DARK = '#2b323b';
const yRoof = (x) => H + (RIDGE - H) * (1 - Math.abs(x) / HW);

const rngf = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------- yapı taşları ---------- */
const Box = ({ size, pos = [0, 0, 0], rot, color = ALU, metal = 0.2, rough = 0.5, shadow = true, children }) => (
  <mesh position={pos} rotation={rot} castShadow={shadow} receiveShadow>
    <boxGeometry args={size} />
    {children || <meshStandardMaterial color={color} roughness={rough} metalness={metal} />}
  </mesh>
);
const Alu = (props) => <Box color={ALU} metal={0.3} rough={0.38} {...props} />;

const _up = new THREE.Vector3(0, 1, 0);
function Strut({ a, b, r = 0.03, color = ALU, seg = 10, metal = 0.2 }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const length = d.length();
    return { quat: new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()), pos: A.add(B).multiplyScalar(0.5), len: length };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, seg]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={0.4} />
    </mesh>
  );
}

// PVC boru: noktalar arası silindir + dirsek
function Pipe({ pts, r = 0.04, color = '#f4f6f7' }) {
  return (
    <group>
      {pts.slice(1).map((p, i) => <Strut key={i} a={pts[i]} b={p} r={r} color={color} />)}
      {pts.slice(1, -1).map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <sphereGeometry args={[r * 1.15, 14, 10]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Inst({ items, children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = ref.current;
    const d = new THREE.Object3D();
    d.rotation.order = 'YZX';
    const c = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(...it.p);
      d.rotation.set(...(it.r || [0, 0, 0]));
      d.scale.set(...(it.s || [1, 1, 1]));
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (it.c) m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[null, null, items.length]} castShadow receiveShadow frustumCulled={false}>{children}</instancedMesh>;
}

const Glass = ({ opacity = 0.2, tint = '#9fd3e3' }) => (
  <meshPhysicalMaterial color={tint} transparent opacity={opacity} roughness={0.03} metalness={0.1} envMapIntensity={1.8} side={THREE.DoubleSide} depthWrite={false} />
);

/* ---------- çatı ---------- */
function RoofSlope({ side, ventAngle }) {
  const halfBars = Array.from({ length: PANES_Z * 2 - 1 }, (_, k) => -HL + (PANE_W / 2) * (k + 1)).filter((z) => !FRAMES_Z.includes(z));
  return (
    <group position={[(side * HW) / 2, (H + RIDGE) / 2, 0]} rotation={[0, 0, -side * SLOPE]}>
      {[-1, 1].map((r, ri) => Array.from({ length: PANES_Z }, (_, k) => {
        if (side === 1 && ri === 0 && k === 2) return null; // havalandırma kapağı
        return (
          <mesh key={`${ri}-${k}`} position={[(r * SLOPE_LEN) / 4, 0, -HL + PANE_W * (k + 0.5)]}>
            <boxGeometry args={[SLOPE_LEN / 2 - 0.05, 0.02, PANE_W - 0.05]} />
            <Glass />
          </mesh>
        );
      }))}
      {FRAMES_Z.map((z) => <Alu key={z} size={[SLOPE_LEN + 0.1, 0.1, 0.08]} pos={[0, 0.03, z]} />)}
      {[-SLOPE_LEN / 2, 0, SLOPE_LEN / 2].map((x) => <Alu key={x} size={[0.07, 0.08, 2 * HL + 0.1]} pos={[x, 0.03, 0]} />)}
      {halfBars.map((z) => <Alu key={z} size={[SLOPE_LEN, 0.03, 0.03]} pos={[0, 0.02, z]} />)}

      {side === 1 && (
        <group position={[-SLOPE_LEN / 2, 0.03, -HL + PANE_W * 2.5]}>
          <group rotation={[0, 0, ventAngle]}>
            <mesh position={[SLOPE_LEN / 4, 0, 0]}>
              <boxGeometry args={[SLOPE_LEN / 2 - 0.08, 0.02, PANE_W - 0.1]} />
              <Glass opacity={0.22} />
            </mesh>
            <Alu size={[SLOPE_LEN / 2 - 0.06, 0.05, 0.05]} pos={[SLOPE_LEN / 4, 0, (PANE_W - 0.08) / 2]} />
            <Alu size={[SLOPE_LEN / 2 - 0.06, 0.05, 0.05]} pos={[SLOPE_LEN / 4, 0, -(PANE_W - 0.08) / 2]} />
            <Alu size={[0.05, 0.05, PANE_W - 0.08]} pos={[SLOPE_LEN / 2 - 0.04, 0, 0]} />
          </group>
          {[-1, 1].map((s) => <Strut key={s} a={[SLOPE_LEN / 4 + 0.2, 0.02, s * 0.5]} b={[SLOPE_LEN / 2 - 0.1, 0.4, s * 0.5]} r={0.014} color="#9aa6b2" metal={0.7} />)}
        </group>
      )}
    </group>
  );
}

function Bracket({ pos, size = 0.15 }) {
  return <Box size={[size, size, size]} pos={pos} color="#59636e" metal={0.3} />;
}

/* ---------- duvarlar, alınlıklar, kapı ---------- */
function GableEnd({ z, door }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-HW, 0); s.lineTo(HW, 0); s.lineTo(HW, H); s.lineTo(0, RIDGE); s.lineTo(-HW, H);
    return s;
  }, []);
  const fan = useRef();
  useFrame((_, dt) => { if (fan.current) fan.current.rotation.z -= dt * 4; });
  return (
    <group position={[0, 0, z]}>
      <mesh><shapeGeometry args={[shape]} /><Glass opacity={0.1} /></mesh>
      {/* alt kuşak, alt ve orta raylar */}
      <Alu size={[2 * HW, 0.2, 0.07]} pos={[0, 0.1, 0]} />
      <Alu size={[2 * HW, 0.06, 0.06]} pos={[0, 1.3, 0]} />
      <Alu size={[2 * HW, 0.07, 0.07]} pos={[0, H, 0]} />
      {/* dikmeler */}
      {[-1.7, -0.9, 0.9, 1.7].map((x) => <Alu key={x} size={[0.05, H, 0.05]} pos={[x, H / 2, 0]} />)}
      {[-1.25, 0, 1.25].map((x) => <Alu key={x} size={[0.045, yRoof(x) - H + 0.02, 0.045]} pos={[x, (yRoof(x) + H) / 2, 0]} />)}
      {door && (
        <group>
          {[-0.62, 0.62].map((x) => <Alu key={x} size={[0.07, 2.2, 0.08]} pos={[x, 1.1, 0.01]} />)}
          <Alu size={[1.32, 0.07, 0.08]} pos={[0, 2.2, 0.01]} />
          <Alu size={[0.05, 2.1, 0.06]} pos={[0, 1.08, 0.03]} />
          <Alu size={[1.2, 0.05, 0.05]} pos={[0, 1.1, 0.03]} />
          <mesh position={[0, 1.1, 0.02]}><boxGeometry args={[1.2, 2.1, 0.015]} /><Glass opacity={0.12} /></mesh>
          {[-0.08, 0.08].map((x) => <Box key={x} size={[0.025, 0.4, 0.04]} pos={[x, 1.05, 0.07]} color="#f1f4f6" metal={0.9} rough={0.2} />)}
          {[-0.62, 0.62].map((x) => [0.3, 1.1, 1.9].map((y) => <Box key={`${x}${y}`} size={[0.04, 0.1, 0.05]} pos={[x, y, 0.05]} color="#59636e" metal={0.6} shadow={false} />))}
          <Box size={[1.2, 0.2, 0.02]} pos={[0, 0.12, 0.035]} color="#aab5c0" metal={0.7} shadow={false} />
          <Box size={[0.5, 0.025, 0.03]} pos={[-0.3, 1.0, 0.07]} color="#e6ebef" metal={0.9} rough={0.2} shadow={false} />
          <Box size={[0.5, 0.025, 0.03]} pos={[0.3, 1.0, 0.07]} color="#e6ebef" metal={0.9} rough={0.2} shadow={false} />
          <Box size={[0.2, 0.05, 0.06]} pos={[0.45, 2.15, 0.06]} color="#59636e" metal={0.5} shadow={false} />
          <Box size={[1.3, 0.04, 0.12]} pos={[0, 0.03, 0.06]} color="#9aa6b2" metal={0.6} shadow={false} />
        </group>
      )}
      {/* gable'daki küçük egzoz fanı */}
      <group position={[1.25, 3.08, 0.05]}>
        <mesh><torusGeometry args={[0.2, 0.025, 8, 24]} /><meshStandardMaterial color={ALU} metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[0, 0, -0.01]}><circleGeometry args={[0.2, 24]} /><meshStandardMaterial color="#9aa6b2" transparent opacity={0.5} /></mesh>
        <group ref={fan}>
          {[0, 1, 2, 3].map((i) => <Box key={i} size={[0.17, 0.06, 0.01]} pos={[0.08, 0, 0]} rot={[0.4, 0, (i * Math.PI) / 2]} color="#2a303a" shadow={false} />)}
        </group>
      </group>
    </group>
  );
}

function SideWall({ x }) {
  return (
    <group>
      <mesh position={[x, H / 2 + 0.1, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2 * HL, H - 0.2]} /><Glass opacity={0.1} /></mesh>
      <Alu size={[0.07, 0.2, 2 * HL + 0.1]} pos={[x, 0.1, 0]} />
      <Alu size={[0.06, 0.06, 2 * HL]} pos={[x, 1.3, 0]} />
      <Alu size={[0.09, 0.09, 2 * HL + 0.2]} pos={[x, H, 0]} />
      {Array.from({ length: PANES_Z * 2 }, (_, k) => -HL + PANE_W / 2 * (k + 1)).filter((z) => !FRAMES_Z.includes(z) && Math.abs(z) < HL).map((z) => (
        <Alu key={z} size={[0.04, H, 0.04]} pos={[x, H / 2, z]} />
      ))}
      {/* oluk */}
      <Box size={[0.22, 0.1, 2 * HL + 0.2]} pos={[x + Math.sign(x) * 0.12, H - 0.04, 0]} color="#c5ced6" metal={0.85} rough={0.25} />
    </group>
  );
}

const STEELD = '#3a4450';
const BOLT = '#8d98a4';

// a'dan b'ye dikdörtgen profilli kiriş (yerel z ekseni a->b)
function BeamAB({ a, b, w = 0.06, h = 0.09, color = ALU, metal = 0.35, rough = 0.38 }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const up = Math.abs(dir.clone().normalize().y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4().lookAt(B, A, up);
    return { quat: new THREE.Quaternion().setFromRotationMatrix(m), pos: A.clone().add(B).multiplyScalar(0.5), len: dir.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow receiveShadow>
      <boxGeometry args={[w, h, len]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  );
}

function Frame() {
  const bolts = useMemo(() => {
    const it = [];
    [-HW, HW].forEach((x) => FRAMES_Z.forEach((z) => {
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
        it.push({ p: [x + sx * 0.1, 0.06, z + sz * 0.1] });
        it.push({ p: [x + sx * 0.06, H + 0.06, z + sz * 0.06] });
      });
      [0.3, 0.9, 1.5, 2.1].forEach((y) => it.push({ p: [x + Math.sign(-x) * 0.0 + (x < 0 ? -0.075 : 0.075), y, z + 0.0], r: [0, 0, Math.PI / 2] }));
      const s = x < 0 ? 1 : -1;
      it.push({ p: [x + s * 0.5, yRoof(x + s * 0.5) - 0.1, z + 0.04] }, { p: [x + s * 0.5, yRoof(x + s * 0.5) - 0.1, z - 0.04] });
      it.push({ p: [x, H - 0.5, z + 0.04] }, { p: [x, H - 0.5, z - 0.04] });
    }));
    FRAMES_Z.forEach((z) => it.push({ p: [0, RIDGE - 0.02, z + 0.05] }, { p: [0, RIDGE - 0.02, z - 0.05] }));
    return it;
  }, []);
  const diag = (z0, z1, x) => [
    [[x, 0.45, z0], [x, H - 0.35, z1]],
    [[x, 0.45, z1], [x, H - 0.35, z0]],
  ];
  return (
    <group>
      {[-HW, HW].map((x) => FRAMES_Z.map((z) => {
        const s = x < 0 ? 1 : -1;
        return (
          <group key={`${x}-${z}`}>
            {/* kolon: ana profil + dış flanş + conta çizgisi */}
            <Alu size={[0.08, H, 0.08]} pos={[x, H / 2, z]} />
            <Alu size={[0.14, H - 0.1, 0.022]} pos={[x - s * 0.01, H / 2, z]} />
            <Box size={[0.012, H - 0.1, 0.1]} pos={[x + s * 0.045, H / 2, z]} color="#3b434d" shadow={false} />
            {/* taban plakası, grout, kolon başlığı */}
            <Box size={[0.3, 0.035, 0.3]} pos={[x, 0.07, z]} color="#9aa6b2" metal={0.6} rough={0.35} />
            <Box size={[0.2, 0.03, 0.2]} pos={[x, 0.11, z]} color="#7f8b97" metal={0.6} />
            <Box size={[0.17, 0.035, 0.17]} pos={[x, H + 0.02, z]} color="#9aa6b2" metal={0.6} />
            <Bracket pos={[x, H + 0.1, z]} size={0.1} />
            {/* diz payandası (knee brace) */}
            <BeamAB a={[x, H - 0.55, z]} b={[x + s * 0.6, yRoof(x + s * 0.6) - 0.06, z]} w={0.035} h={0.05} />
            {/* köşe takviye plakası */}
            <Box size={[0.2, 0.28, 0.02]} pos={[x + s * 0.06, H - 0.12, z + 0.05]} color="#cfd6dc" metal={0.5} />
            <Box size={[0.2, 0.28, 0.02]} pos={[x + s * 0.06, H - 0.12, z - 0.05]} color="#cfd6dc" metal={0.5} />
          </group>
        );
      }))}

      {/* çatı kirişleri: dikdörtgen profil + üst flanş */}
      {FRAMES_Z.map((z) => (
        <group key={z}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <BeamAB a={[s * HW, H, z]} b={[0, RIDGE, z]} w={0.055} h={0.1} />
              <BeamAB a={[s * HW, H + 0.055, z]} b={[0, RIDGE + 0.055, z]} w={0.1} h={0.015} color="#cfd6dc" />
              <BeamAB a={[s * HW, H, z]} b={[0, RIDGE, z]} w={0.02} h={0.105} color="#3b434d" metal={0.2} />
            </group>
          ))}
        </group>
      ))}
      {/* gergi kirişleri + kral dikme + Warren köşegenleri */}
      {[-5, -1, 3, 5].map((z) => (
        <group key={z}>
          <Alu size={[2 * HW, 0.07, 0.06]} pos={[0, H, z]} />
          <Alu size={[0.05, RIDGE - H, 0.05]} pos={[0, (H + RIDGE) / 2, z]} />
          <BeamAB a={[0, H, z]} b={[-1.25, yRoof(-1.25), z]} w={0.035} h={0.035} />
          <BeamAB a={[0, H, z]} b={[1.25, yRoof(1.25), z]} w={0.035} h={0.035} />
          <BeamAB a={[-1.25, H, z]} b={[-0.65, yRoof(-0.65), z]} w={0.03} h={0.03} />
          <BeamAB a={[1.25, H, z]} b={[0.65, yRoof(0.65), z]} w={0.03} h={0.03} />
          <BeamAB a={[-HW, H, z]} b={[-1.25, yRoof(-1.25), z]} w={0.03} h={0.03} />
          <BeamAB a={[HW, H, z]} b={[1.25, yRoof(1.25), z]} w={0.03} h={0.03} />
        </group>
      ))}
      {/* aşıklar (purlin) */}
      {[-2.2, -1.25, 1.25, 2.2].map((x) => <Alu key={x} size={[0.05, 0.065, 2 * HL]} pos={[x, yRoof(x) - 0.065, 0]} />)}
      {/* mahya + conta */}
      <Alu size={[0.13, 0.13, 2 * HL + 0.2]} pos={[0, RIDGE + 0.04, 0]} />
      <Box size={[0.16, 0.025, 2 * HL + 0.2]} pos={[0, RIDGE + 0.115, 0]} color="#3b434d" shadow={false} />
      <Box size={[0.1, 0.1, 2 * HL + 0.2]} pos={[-HW, H, 0]} color={ALU} metal={0.3} />
      <Box size={[0.1, 0.1, 2 * HL + 0.2]} pos={[HW, H, 0]} color={ALU} metal={0.3} />
      <Bracket pos={[0, RIDGE + 0.06, -HL]} size={0.12} />
      <Bracket pos={[0, RIDGE + 0.06, HL]} size={0.12} />

      {/* rüzgar çaprazları: yan duvarlarda ilk ve son aralık */}
      {[-HW, HW].map((x) => [[-5, -3], [3, 5]].map(([z0, z1]) => diag(z0 + 0.1, z1 - 0.1, x).map(([a, b], i) => (
        <group key={`${x}-${z0}-${i}`}>
          <Strut a={a} b={b} r={0.008} color={STEELD} metal={0.7} seg={6} />
          <Box size={[0.05, 0.05, 0.1]} pos={[x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} color="#8d98a4" metal={0.7} shadow={false} />
        </group>
      ))))}

      {/* beton temel kuşağı */}
      {[-1, 1].map((s) => <Box key={s} size={[0.3, 0.14, 2 * HL + 0.5]} pos={[s * (HW + 0.02), 0.04, 0]} color="#cdd3d8" rough={0.9} />)}
      {[-1, 1].map((s) => <Box key={s} size={[2 * HW + 0.3, 0.14, 0.3]} pos={[0, 0.04, s * (HL + 0.02)]} color="#cdd3d8" rough={0.9} />)}

      {/* iniş boruları + kelepçeler (varil köşesi hariç) */}
      {[[-1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <Strut a={[sx * (HW + 0.25), 0.1, sz * (HL - 0.25)]} b={[sx * (HW + 0.25), H - 0.12, sz * (HL - 0.25)]} r={0.035} color="#cfd6dc" metal={0.5} />
          {[0.5, 1.4, 2.3].map((y) => <Box key={y} size={[0.1, 0.04, 0.1]} pos={[sx * (HW + 0.25), y, sz * (HL - 0.25)]} color="#59636e" metal={0.5} shadow={false} />)}
        </group>
      ))}
      {/* oluk askıları */}
      {[-1, 1].map((s) => FRAMES_Z.map((z) => <Box key={`${s}${z}`} size={[0.2, 0.03, 0.04]} pos={[s * (HW + 0.1), H - 0.07, z]} color="#59636e" metal={0.5} shadow={false} />))}

      <Inst items={bolts}><cylinderGeometry args={[0.014, 0.014, 0.03, 6]} /><meshStandardMaterial color={BOLT} metalness={0.8} roughness={0.3} /></Inst>
    </group>
  );
}

/* ---------- raflar, marul ---------- */
function useLeafGeo() {
  return useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 6, 5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5; // 0..1 yaprak boyunca
      const v = p.getY(i); // -0.5..0.5 enine
      const w = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.06)), 0.75) * 0.5;
      const zz = v * 2 * w;
      const cup = 0.55 * zz * zz * 4 * 0.25;
      const ruffle = 0.045 * Math.sin(u * 24 + zz * 18) * Math.min(1, Math.abs(zz) * 3) * u;
      p.setXYZ(i, u, cup + ruffle - 0.18 * u * u * 0.4, zz);
    }
    g.computeVertexNormals();
    return g;
  }, []);
}

function Racks() {
  const leafGeo = useLeafGeo();
  const d = useMemo(() => {
    const rnd = rngf(5);
    const leaves = []; const pots = []; const rims = []; const clamps = [];
    const RINGS = [
      { n: 4, pitch: 1.2, len: 0.55, h: 0.2, l: 0.44 },
      { n: 5, pitch: 0.85, len: 0.8, h: 0.22, l: 0.36 },
      { n: 6, pitch: 0.5, len: 1.0, h: 0.25, l: 0.29 },
      { n: 7, pitch: 0.22, len: 1.12, h: 0.27, l: 0.23 },
    ];
    RACK_X.forEach((x) => TIERS_Y.forEach((y) => {
      for (let z = -CH_LEN / 2 + 0.2; z <= CH_LEN / 2 - 0.2; z += 0.3) {
        const s = 0.85 + rnd() * 0.3;
        const rot0 = rnd() * 6.28;
        RINGS.forEach((rg, ri) => {
          for (let k = 0; k < rg.n; k++) {
            const ang = rot0 + (k / rg.n) * 6.28 + ri * 0.7 + (rnd() - 0.5) * 0.4;
            const L = 0.25 * rg.len * s * (0.9 + rnd() * 0.2);
            leaves.push({
              p: [x, y + 0.055 + ri * 0.012, z],
              r: [0, -ang, rg.pitch + (rnd() - 0.5) * 0.25],
              s: [L, L * 0.9, L * 0.62],
              c: new THREE.Color().setHSL(rg.h + rnd() * 0.03, 0.72, rg.l + rnd() * 0.07).getStyle(),
            });
          }
        });
        pots.push({ p: [x, y + 0.045, z] });
        rims.push({ p: [x, y + 0.075, z], r: [Math.PI / 2, 0, 0] });
      }
    }));
    RACK_X.forEach((x) => [-3.9, 3.9].forEach((z) => TIERS_Y.forEach((yy) => clamps.push({ p: [x, yy - 0.1, z] }))));
    return { leaves, pots, rims, clamps };
  }, []);
  return (
    <group>
      <Inst items={d.leaves}><primitive object={leafGeo} attach="geometry" /><meshStandardMaterial roughness={0.65} side={THREE.DoubleSide} /></Inst>
      <Inst items={d.pots}><cylinderGeometry args={[0.05, 0.035, 0.07, 10]} /><meshStandardMaterial color="#20252c" roughness={0.6} /></Inst>
      <Inst items={d.rims}><torusGeometry args={[0.05, 0.008, 6, 14]} /><meshStandardMaterial color="#2a3038" roughness={0.5} /></Inst>
      {RACK_X.map((x) => (
        <group key={x}>
          {TIERS_Y.map((y, ti) => (
            <group key={y}>
              <Box size={[0.44, 0.09, CH_LEN]} pos={[x, y, 0]} color="#f5f7f8" rough={0.35} />
              <Box size={[0.38, 0.012, CH_LEN - 0.04]} pos={[x, y + 0.047, 0]} color="#e3e8eb" shadow={false} />
              {[-1, 1].map((s) => <Box key={s} size={[0.46, 0.11, 0.04]} pos={[x, y, s * (CH_LEN / 2)]} color="#e9eef0" />)}
              {[-3, 0, 3].map((z) => <Box key={z} size={[0.5, 0.025, 0.06]} pos={[x, y - 0.06, z]} color="#d4dbe0" />)}
              {/* kanal uç bağlantıları: dirsek + besleme borusu */}
              {[-1, 1].map((s) => (
                <group key={s}>
                  <Strut a={[x, y, s * (CH_LEN / 2 + 0.02)]} b={[x, y, s * 3.9]} r={0.02} color={s > 0 ? SUP : RET} />
                  <mesh position={[x, y, s * 3.9]}><sphereGeometry args={[0.032, 10, 8]} /><meshStandardMaterial color={s > 0 ? SUP : RET} /></mesh>
                </group>
              ))}
              {/* altlardaki LED şeritler (üst katlar) */}
              {ti > 0 && <Box size={[0.06, 0.012, CH_LEN - 0.3]} pos={[x, y - 0.1, 0]} color="#fff6df" metal={0} shadow={false}><meshStandardMaterial color="#fff6df" emissive="#fff0c8" emissiveIntensity={1.6} /></Box>}
            </group>
          ))}
          {[-3.4, 0, 3.4].map((z) => [-0.22, 0.22].map((dx) => (
            <group key={`${z}${dx}`}>
              <Alu size={[0.05, 2.3, 0.05]} pos={[x + dx, 1.15, z]} />
              <Box size={[0.07, 0.02, 0.07]} pos={[x + dx, 0.01, z]} color="#9aa6b2" metal={0.5} shadow={false} />
            </group>
          )))}
          <Strut a={[x, 0.1, -3.9]} b={[x, 0.1, 3.4]} r={0.04} color={RET} />
          {[-1, 1].map((s) => <Strut key={s} a={[x, 0.1, s * 3.9]} b={[x, 2.05, s * 3.9]} r={0.03} color={s > 0 ? SUP : RET} />)}
        </group>
      ))}
      <Inst items={d.clamps}><cylinderGeometry args={[0.042, 0.042, 0.05, 10]} /><meshStandardMaterial color="#1c2026" roughness={0.5} /></Inst>
    </group>
  );
}

function HafFan({ z, spin = true }) {
  const blades = useRef();
  useFrame((_, dt) => { if (blades.current && spin) blades.current.rotation.z -= dt * 6; });
  return (
    <group position={[0, 2.05, z]}>
      <mesh><torusGeometry args={[0.34, 0.03, 8, 28]} /><meshStandardMaterial color="#59636e" metalness={0.5} roughness={0.4} /></mesh>
      {Array.from({ length: 8 }, (_, i) => <Box key={i} size={[0.3, 0.008, 0.008]} pos={[Math.cos((i * Math.PI) / 4) * 0.16, Math.sin((i * Math.PI) / 4) * 0.16, 0.05]} rot={[0, 0, (i * Math.PI) / 4]} color="#aab5c0" metal={0.8} shadow={false} />)}
      <group ref={blades}>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 5]}><Box size={[0.26, 0.1, 0.01]} pos={[0.17, 0, 0]} rot={[0.5, 0, 0]} color="#e4e9ee" shadow={false} /></group>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 12]} /><meshStandardMaterial color="#3a4450" /></mesh>
      </group>
      {[-0.28, 0.28].map((dx) => <Strut key={dx} a={[dx, 0.3, 0]} b={[dx, H - 2.05, 0]} r={0.008} color="#8d98a4" metal={0.7} seg={5} />)}
    </group>
  );
}

function Cabinet() {
  return (
    <group position={[-2.3, 1.3, -4.88]}>
      <Box size={[0.4, 0.55, 0.14]} color="#cfd6dc" metal={0.4} />
      <Box size={[0.34, 0.49, 0.012]} pos={[0, 0, 0.075]} color="#e6ebef" shadow={false} />
      <Box size={[0.06, 0.03, 0.012]} pos={[-0.1, 0.14, 0.085]} color="#9dffb8" shadow={false}><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} /></Box>
      <Box size={[0.06, 0.03, 0.012]} pos={[0.0, 0.14, 0.085]} color="#fbbf24" shadow={false}><meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.4} /></Box>
      <Strut a={[0, 0.28, 0]} b={[0, 1.15, 0]} r={0.015} color="#59636e" />
    </group>
  );
}

function Tank({ pos }) {
  return (
    <group position={pos}>
      <RoundedBox args={[0.6, 0.85, 0.6]} radius={0.06} smoothness={4} position={[0, 0.425, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f7f9fa" roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.06, 14]} /><meshStandardMaterial color="#c9d0d6" roughness={0.4} /></mesh>
      <Box size={[0.5, 0.015, 0.016]} pos={[0, 0.5, 0.31]} color="#dfe5e8" shadow={false} />
      <Box size={[0.5, 0.015, 0.016]} pos={[0, 0.3, 0.31]} color="#dfe5e8" shadow={false} />
      <mesh position={[0.2, 0.1, 0.33]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.1, 10]} /><meshStandardMaterial color="#f4f6f7" /></mesh>
      <mesh position={[0.2, 0.1, 0.4]} castShadow><boxGeometry args={[0.12, 0.05, 0.05]} /><meshStandardMaterial color="#2f6fd6" roughness={0.4} /></mesh>
    </group>
  );
}

const SUP = '#4a90e2'; // basınçlı besleme
const RET = '#cfd6dc'; // dönüş / drenaj
const FRESH = '#8cc4ff'; // emme / temiz su
const PDARK = '#1f2933';

// Küre vana (yerel z borunun yönü)
function Valve({ pos, rot = [0, 0, 0], color = SUP }) {
  return (
    <group position={pos} rotation={rot}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.055, 0.055, 0.1, 12]} /><meshStandardMaterial color={PDARK} metalness={0.4} roughness={0.5} /></mesh>
      {[-0.07, 0.07].map((z) => <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.048, 0.048, 0.035, 12]} /><meshStandardMaterial color={color} roughness={0.4} /></mesh>)}
      <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.012, 0.012, 0.07, 8]} /><meshStandardMaterial color="#9aa6b2" metalness={0.8} /></mesh>
      <Box size={[0.11, 0.016, 0.022]} pos={[0.04, 0.11, 0]} color="#e0483c" shadow={false} />
    </group>
  );
}

function FlowMeter({ pos }) {
  return (
    <group position={pos}>
      <Box size={[0.13, 0.12, 0.2]} pos={[0, 0, 0]} color="#2c3641" metal={0.4} />
      <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.055, 0.055, 0.02, 16]} /><meshStandardMaterial color="#f7f9fa" /></mesh>
      <Box size={[0.006, 0.004, 0.045]} pos={[0.01, 0.083, 0.01]} rot={[0, 0.7, 0]} color="#e0483c" shadow={false} />
    </group>
  );
}

function Gauge({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.012, 0.012, 0.08, 8]} /><meshStandardMaterial color="#9aa6b2" metalness={0.8} /></mesh>
      <mesh position={[0, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 0.025, 20]} /><meshStandardMaterial color="#e6ebef" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0.014, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}><circleGeometry args={[0.042, 20]} /><meshStandardMaterial color="#ffffff" /></mesh>
    </group>
  );
}

function Filter({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.17, 0]} castShadow><cylinderGeometry args={[0.085, 0.085, 0.3, 16]} /><meshPhysicalMaterial color="#cfe6f2" transparent opacity={0.55} roughness={0.2} /></mesh>
      <mesh position={[0, 0.34, 0]} castShadow><cylinderGeometry args={[0.095, 0.095, 0.05, 16]} /><meshStandardMaterial color="#2c3641" /></mesh>
      <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.09, 0.09, 0.04, 16]} /><meshStandardMaterial color="#2c3641" /></mesh>
    </group>
  );
}

function Pump({ pos }) {
  return (
    <group position={pos}>
      <Box size={[0.3, 0.035, 0.7]} pos={[0, 0.02, -0.15]} color="#9aa6b2" metal={0.6} />
      {/* motor + soğutma fanı kapağı + klemens kutusu */}
      <mesh position={[0, 0.15, -0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.34, 20]} /><meshStandardMaterial color="#2f8fa8" metalness={0.4} roughness={0.4} /></mesh>
      {[-0.35, -0.2, -0.05].map((z) => <mesh key={z} position={[0, 0.15, z - 0.05]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.1, 0.006, 6, 20]} /><meshStandardMaterial color="#1f6f85" /></mesh>)}
      <mesh position={[0, 0.15, -0.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.085, 0.085, 0.07, 16]} /><meshStandardMaterial color="#1f2933" /></mesh>
      <Box size={[0.1, 0.07, 0.1]} pos={[0, 0.27, -0.25]} color="#2c3641" />
      {/* salyangoz gövde */}
      <mesh position={[0, 0.15, 0.0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.1, 20]} /><meshStandardMaterial color="#e6ebef" metalness={0.3} roughness={0.35} /></mesh>
      <mesh position={[0, 0.24, 0.0]}><cylinderGeometry args={[0.04, 0.04, 0.1, 10]} /><meshStandardMaterial color="#e6ebef" /></mesh>
      <Gauge pos={[0.05, 0.28, 0.0]} />
    </group>
  );
}

function Plumbing() {
  const arrows = useMemo(() => {
    const a = [];
    [-1.4, -0.6, 0.6, 1.4].forEach((x) => a.push({ p: [x, 0.22, 3.9], r: [0, 0, -Math.PI / 2], c: '#ffffff' }));
    [1.2, 0.2, -0.8].forEach((x) => a.push({ p: [x, 0.19, -3.9], r: [0, 0, Math.PI / 2], c: '#6b7682' }));
    [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0].forEach((z) => a.push({ p: [-2.38, 0.2, z], r: [Math.PI / 2, 0, 0], c: '#6b7682' }));
    [1.9, 0.9, -0.2].forEach((x) => a.push({ p: [x, 0.17, 4.72], r: [0, 0, Math.PI / 2], c: '#ffffff' }));
    return a;
  }, []);
  const clips = useMemo(() => {
    const c = [];
    for (let z = -3.4; z <= 3.5; z += 0.8) c.push({ p: [-2.38, 0.09, z] });
    [-1.6, -0.3, 0.9, 1.6].forEach((x) => c.push({ p: [x, 0.09, 3.9] }, { p: [x, 0.09, -3.9] }));
    return c;
  }, []);
  const rackX = [-1.95, -1.15, 1.15, 1.95];
  return (
    <group>
      <Tank pos={[1.45, 0, 4.35]} />
      <Tank pos={[2.1, 0, 4.35]} />
      <Tank pos={[-1.75, 0, 4.35]} />

      {/* emme manifoldu (tank çıkışları) */}
      <Pipe pts={[[2.3, 0.1, 4.72], [-1.0, 0.1, 4.72]]} r={0.045} color={FRESH} />
      {[1.65, 2.3, -1.55].map((x) => <Strut key={x} a={[x, 0.1, 4.68]} b={[x, 0.1, 4.72]} r={0.04} color={FRESH} />)}
      <Valve pos={[0.55, 0.1, 4.72]} rot={[0, Math.PI / 2, 0]} color={FRESH} />
      <Valve pos={[1.65 + 0.35, 0.1, 4.72]} rot={[0, Math.PI / 2, 0]} color={FRESH} />
      <Box size={[0.8, 0.045, 0.24]} pos={[0.1, 0.03, 4.72]} color="#59636e" rough={0.8} shadow={false} />

      {/* pompa istasyonu */}
      <Pump pos={[-1.0, 0, 4.5]} />
      <Strut a={[-1.0, 0.1, 4.72]} b={[-1.0, 0.15, 4.57]} r={0.04} color={FRESH} />
      <Filter pos={[-0.6, 0, 4.25]} />
      <Pipe pts={[[-1.0, 0.3, 4.5], [-1.0, 0.3, 4.3], [-0.6, 0.3, 4.3]]} r={0.035} color={SUP} />
      <Strut a={[-0.6, 0.2, 4.3]} b={[-0.6, 0.3, 4.3]} r={0.035} color={SUP} />
      <Pipe pts={[[-0.6, 0.3, 4.3], [-0.6, 0.3, 3.9], [-0.6, 0.14, 3.9]]} r={0.035} color={SUP} />

      {/* besleme ana hattı (mavi) */}
      <Pipe pts={[[-1.95, 0.14, 3.9], [1.95, 0.14, 3.9]]} r={0.042} color={SUP} />
      <FlowMeter pos={[0.1, 0.14, 3.9]} />
      <Gauge pos={[-0.3, 0.17, 3.9]} />
      {rackX.map((x) => (
        <group key={x}>
          <Valve pos={[x, 0.36, 3.9]} rot={[Math.PI / 2, 0, 0]} />
          <mesh position={[x, 0.14, 3.9]}><sphereGeometry args={[0.058, 12, 10]} /><meshStandardMaterial color={SUP} /></mesh>
        </group>
      ))}
      <Box size={[0.8, 0.05, 0.24]} pos={[0.1, 0.045, 3.9]} color="#59636e" rough={0.8} shadow={false} />

      {/* dönüş hattı (gri): arka başlık + sol duvar boyunca tanka */}
      <Pipe pts={[[1.95, 0.14, -3.9], [-2.38, 0.14, -3.9], [-2.38, 0.14, 4.35], [-2.38, 0.7, 4.35], [-2.05, 0.7, 4.35]]} r={0.045} color={RET} />
      {rackX.map((x) => <mesh key={x} position={[x, 0.14, -3.9]}><sphereGeometry args={[0.058, 12, 10]} /><meshStandardMaterial color={RET} /></mesh>)}
      <Valve pos={[-2.38, 0.14, 2.6]} rot={[0, 0, 0]} color={RET} />
      <Valve pos={[-2.38, 0.14, -2.0]} rot={[0, 0, 0]} color={RET} />

      {/* dış su deposundan taze su girişi */}
      <Pipe pts={[[-3.4, 0.15, -3.8], [-2.38, 0.15, -3.8]]} r={0.04} color={FRESH} />
      <Valve pos={[-2.9, 0.15, -3.8]} rot={[0, Math.PI / 2, 0]} color={FRESH} />
      <mesh position={[-2.38, 0.15, -3.8]}><sphereGeometry args={[0.05, 12, 10]} /><meshStandardMaterial color={FRESH} /></mesh>

      <Inst items={arrows}><coneGeometry args={[0.035, 0.09, 8]} /><meshStandardMaterial roughness={0.5} /></Inst>
      <Inst items={clips}><boxGeometry args={[0.1, 0.018, 0.08]} /><meshStandardMaterial color="#2c3641" roughness={0.6} /></Inst>
    </group>
  );
}

/* ---------- çevre düzenlemesi ---------- */
const WOOD = '#c99d66';
const inRect = (x, z, cx, cz, hw, hl) => Math.abs(x - cx) < hw && Math.abs(z - cz) < hl;
const lawnFree = (x, z) => !inRect(x, z, 0, 0, 4.0, 6.4) && !inRect(x, z, 0, 7.2, 1.0, 1.6) && !inRect(x, z, -5.0, 0, 0.9, 3.2)
  && !inRect(x, z, 5.0, -3.2, 1.0, 1.2) && !inRect(x, z, -4.8, -3.8, 0.9, 0.9);

function useSignTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f9fa'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#22c55e'; g.fillRect(0, 0, 256, 22);
    g.fillStyle = '#1e293b'; g.font = 'bold 46px sans-serif'; g.fillText('GH-0126', 18, 80);
    g.fillStyle = '#64748b'; g.font = '24px sans-serif'; g.fillText('Greenhouse 01', 20, 112);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function useSolarTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1f3a73'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#9db6df'; g.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
      g.beginPath(); g.moveTo(i * 42.6, 0); g.lineTo(i * 42.6, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 42.6); g.lineTo(256, i * 42.6); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Tree({ pos, s = 1, hue = 0.3 }) {
  const blobs = [[0, 2.3, 0, 0.9], [0.5, 1.8, 0.2, 0.65], [-0.45, 1.9, -0.2, 0.7], [0.1, 2.9, 0.1, 0.55]];
  return (
    <group position={pos} scale={s}>
      <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.1, 0.16, 1.8, 8]} /><meshStandardMaterial color="#7a5a3a" roughness={0.9} /></mesh>
      {blobs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[r, r * 0.9, r]} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 2]} />
          <meshStandardMaterial color={new THREE.Color().setHSL(hue + i * 0.012, 0.58, 0.3 + i * 0.02)} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function GroundSolar({ tex }) {
  const leg = (x, z, top) => <Strut a={[x, -0.85, z]} b={[x, top, z]} r={0.025} color="#9aa6b2" metal={0.6} />;
  return (
    <group position={[-5.1, 0, 0]}>
      {[-2.2, 0, 2.2].map((z) => (
        <group key={z} position={[0, 0.85, z]}>
          <group rotation={[0, 0, -0.5]}>
            <Box size={[1.5, 0.05, 1.8]} color="#c8d3de" metal={0.6} />
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.4, 1.7]} /><meshStandardMaterial map={tex} metalness={0.5} roughness={0.25} /></mesh>
          </group>
          {leg(-0.55, -0.7, 0.2)}
          {leg(-0.55, 0.7, 0.2)}
          {leg(0.5, -0.7, -0.2)}
          {leg(0.5, 0.7, -0.2)}
        </group>
      ))}
    </group>
  );
}

function Shed() {
  return (
    <group position={[5.0, 0, -3.2]}>
      <RoundedBox args={[1.4, 1.3, 1.9]} radius={0.04} position={[0, 0.65, 0]} castShadow receiveShadow><meshStandardMaterial color="#eef1f3" roughness={0.5} /></RoundedBox>
      <Box size={[1.7, 0.08, 2.2]} pos={[0, 1.34, 0]} color="#59636e" metal={0.3} />
      <Box size={[0.03, 1.0, 0.62]} pos={[-0.71, 0.55, 0.35]} color="#cfd6dc" />
      <Box size={[0.04, 0.2, 0.03]} pos={[-0.73, 0.55, 0.6]} color="#59636e" />
      {[0, 1, 2, 3].map((i) => <Box key={i} size={[0.03, 0.03, 0.5]} pos={[-0.71, 1.05 + i * 0.05, -0.55]} color="#aab5c0" shadow={false} />)}
      <Box size={[0.3, 0.45, 0.5]} pos={[0.85, 0.3, -0.4]} color="#d9dfe4" />
      <mesh position={[0.99, 0.3, -0.4]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.15, 18]} /><meshStandardMaterial color="#59636e" /></mesh>
    </group>
  );
}

function WaterTank() {
  return (
    <group position={[-4.8, 0, -3.8]}>
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow><cylinderGeometry args={[0.65, 0.65, 2.0, 24]} /><meshStandardMaterial color="#f1f5f8" roughness={0.35} /></mesh>
      {[0.3, 0.9, 1.5].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.66, 0.025, 6, 32]} /><meshStandardMaterial color="#d3dbe1" /></mesh>)}
      <mesh position={[0, 2.0, 0]} castShadow><sphereGeometry args={[0.65, 24, 8, 0, Math.PI * 2, 0, Math.PI / 3]} /><meshStandardMaterial color="#dbe3e8" roughness={0.4} /></mesh>
      <Box size={[0.08, 1.0, 0.06]} pos={[0.62, 1.0, 0]} color="#8fd0ff" shadow={false} />
      <Pipe pts={[[0.4, 0.15, 0], [1.4, 0.15, 0]]} r={0.04} />
    </group>
  );
}

function RainBarrel() {
  return (
    <group>
      <mesh position={[3.1, 0.4, -4.75]} castShadow><cylinderGeometry args={[0.3, 0.27, 0.8, 18]} /><meshStandardMaterial color="#2f6fd0" roughness={0.5} /></mesh>
      <mesh position={[3.1, 0.82, -4.75]}><cylinderGeometry args={[0.31, 0.31, 0.04, 18]} /><meshStandardMaterial color="#2f64ad" /></mesh>
      {[0.2, 0.55].map((y) => <mesh key={y} position={[3.1, y, -4.75]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.285, 0.015, 6, 24]} /><meshStandardMaterial color="#2f64ad" /></mesh>)}
      <Pipe pts={[[2.82, H - 0.1, -4.75], [2.82, 1.0, -4.75], [3.05, 0.88, -4.75]]} r={0.035} color="#cfd6dc" />
    </group>
  );
}

function Fence() {
  const { posts, rails } = useMemo(() => {
    const ps = []; const rs = [];
    for (let x = -6; x <= 6.01; x += 1.2) ps.push({ p: [x, 0.35, -7.4] });
    for (let z = -6.2; z <= 7.41; z += 1.2) ps.push({ p: [-6.0, 0.35, z] });
    for (let x = -5.4; x < 6; x += 1.2) [0.28, 0.55].forEach((y) => rs.push({ p: [x, y, -7.4] }));
    for (let z = -5.6; z < 7.4; z += 1.2) [0.28, 0.55].forEach((y) => rs.push({ p: [-6.0, y, z], r: [0, Math.PI / 2, 0] }));
    return { posts: ps, rails: rs };
  }, []);
  return (
    <group>
      <Inst items={posts}><boxGeometry args={[0.07, 0.7, 0.07]} /><meshStandardMaterial color="#d6b383" roughness={0.8} /></Inst>
      <Inst items={rails}><boxGeometry args={[1.2, 0.045, 0.03]} /><meshStandardMaterial color="#e0c196" roughness={0.8} /></Inst>
    </group>
  );
}

function LampPost({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.03, 0.04, 1.1, 8]} /><meshStandardMaterial color="#38424d" metalness={0.5} /></mesh>
      <mesh position={[0, 1.15, 0]} castShadow><coneGeometry args={[0.16, 0.12, 8]} /><meshStandardMaterial color="#38424d" metalness={0.5} /></mesh>
      <mesh position={[0, 1.07, 0]}><sphereGeometry args={[0.06, 12, 10]} /><meshStandardMaterial color="#fff3cf" emissive="#ffd98a" emissiveIntensity={2.2} /></mesh>
    </group>
  );
}

function Planter({ x }) {
  const items = useMemo(() => {
    const rnd = rngf(Math.abs(x) * 10 + 9);
    const leaves = []; const flowers = [];
    for (let i = 0; i < 9; i++) {
      const px = x + (rnd() - 0.5) * 0.7;
      const pz = 6.05 + (rnd() - 0.5) * 0.25;
      leaves.push({ p: [px, 0.42 + rnd() * 0.08, pz], s: [0.13, 0.1, 0.13], c: new THREE.Color().setHSL(0.28 + rnd() * 0.05, 0.6, 0.32).getStyle() });
      if (i % 2 === 0) flowers.push({ p: [px + 0.03, 0.55 + rnd() * 0.06, pz], s: [0.05, 0.05, 0.05], c: ['#ff8fb1', '#ffd166', '#ffffff'][i % 3] });
    }
    return { leaves, flowers };
  }, [x]);
  return (
    <group>
      <Box size={[0.9, 0.32, 0.42]} pos={[x, 0.2, 6.05]} color={WOOD} rough={0.8} />
      <Box size={[0.8, 0.02, 0.34]} pos={[x, 0.37, 6.05]} color="#4a3b2b" shadow={false} />
      <Inst items={items.leaves}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.8} /></Inst>
      <Inst items={items.flowers}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial roughness={0.6} /></Inst>
    </group>
  );
}

function Bench({ pos }) {
  return (
    <group position={pos}>
      <Box size={[1.4, 0.06, 0.4]} pos={[0, 0.42, 0]} color={WOOD} rough={0.8} />
      <Box size={[1.4, 0.3, 0.05]} pos={[0, 0.66, -0.2]} color={WOOD} rough={0.8} />
      {[-0.6, 0.6].map((x) => <Box key={x} size={[0.06, 0.42, 0.36]} pos={[x, 0.21, 0]} color="#38424d" metal={0.4} />)}
    </group>
  );
}

function Crates() {
  return (
    <group position={[4.4, 0, -5.9]}>
      {[[0, 0.2, 0], [0.55, 0.2, 0.05], [0.25, 0.6, 0.02]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, i * 0.2, 0]}>
          <Box size={[0.5, 0.38, 0.4]} color={WOOD} rough={0.85} />
          {[-0.1, 0.1].map((dy) => <Box key={dy} size={[0.52, 0.04, 0.42]} pos={[0, dy, 0]} color="#a37a47" shadow={false} />)}
        </group>
      ))}
    </group>
  );
}

function Signpost({ tex }) {
  return (
    <group position={[-1.9, 0, 7.6]} rotation={[0, 0.25, 0]}>
      {[-0.4, 0.4].map((x) => <Box key={x} size={[0.06, 1.2, 0.06]} pos={[x, 0.6, 0]} color={WOOD} rough={0.8} />)}
      <Box size={[1.1, 0.55, 0.05]} pos={[0, 1.0, 0.04]} color="#f7f9fa" />
      <mesh position={[0, 1.0, 0.07]}><planeGeometry args={[1.05, 0.5]} /><meshStandardMaterial map={tex} /></mesh>
    </group>
  );
}

// Yumuşak zemin gölgeleri (güneşin tersi yönüne kaymış radyal degrade); gerçek gölge haritası çim üstünde görünmediği için.
function useBlobTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(12,24,12,0.95)');
    gr.addColorStop(0.55, 'rgba(12,24,12,0.55)');
    gr.addColorStop(1, 'rgba(12,24,12,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
}

function Blob({ tex, x, z, w, d = w, o = 0.45, y = 0.014 }) {
  return (
    <mesh position={[x + 0.35 * Math.min(w, 3), y, z + 0.25 * Math.min(w, 3)]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent opacity={o} depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
    </mesh>
  );
}

function Surroundings() {
  const solarTex = useSolarTexture();
  const signTex = useSignTexture();
  const blobTex = useBlobTexture();
  const d = useMemo(() => {
    const rnd = rngf(33);
    const tufts = []; const pebbles = []; const shrubs = []; const flowers = []; const stones = [];
    for (let i = 0; i < 380; i++) {
      const x = (rnd() - 0.5) * 12.2;
      const z = (rnd() - 0.5) * 15.2;
      if (!lawnFree(x, z)) continue;
      tufts.push({ p: [x, 0.09, z], r: [0, rnd() * 6, (rnd() - 0.5) * 0.4], s: [0.5 + rnd() * 0.6, 0.6 + rnd() * 0.9, 0.5 + rnd() * 0.6], c: new THREE.Color().setHSL(0.27 + rnd() * 0.05, 0.65, 0.3 + rnd() * 0.1).getStyle() });
    }
    [-4.35, 4.35].forEach((cx) => {
      for (let i = 0; i < 140; i++) pebbles.push({ p: [cx + (rnd() - 0.5) * 0.7, 0.05, (rnd() - 0.5) * 12], s: [0.04 + rnd() * 0.04, 0.03 + rnd() * 0.03, 0.04 + rnd() * 0.04], r: [0, rnd() * 6, 0], c: new THREE.Color().setHSL(0.08, 0.05, 0.55 + rnd() * 0.25).getStyle() });
    });
    [[-4.3, 6.8, 0.5], [4.4, 6.9, 0.55], [-5.4, -6.4, 0.6], [5.3, 1.8, 0.45], [5.5, 4.4, 0.4], [-3.4, 4.2, 0.35]].forEach(([x, z, s]) => {
      for (let k = 0; k < 4; k++) {
        const bx = x + (rnd() - 0.5) * 0.8;
        const bz = z + (rnd() - 0.5) * 0.8;
        const bs = s * (0.6 + rnd() * 0.5);
        shrubs.push({ p: [bx, bs * 0.7, bz], s: [bs, bs * 0.8, bs], c: new THREE.Color().setHSL(0.3 + rnd() * 0.04, 0.62, 0.24 + rnd() * 0.07).getStyle() });
        if (rnd() > 0.45) {
          for (let f = 0; f < 5; f++) flowers.push({ p: [bx + (rnd() - 0.5) * bs * 1.3, bs * 1.0 + rnd() * bs * 0.3, bz + (rnd() - 0.5) * bs * 1.3], s: [0.045, 0.045, 0.045], c: ['#ff8fb1', '#ffd166', '#ffffff', '#c4a3ff'][Math.floor(rnd() * 4)] });
        }
      }
    });
    for (let i = 0; i < 3; i++) stones.push({ p: [(rnd() - 0.5) * 0.3, 0.03, 6.75 + i * 0.5] });
    const shrubShadows = shrubs.map((s) => ({ p: [s.p[0] + 0.3, 0.016, s.p[2] + 0.22], r: [-Math.PI / 2, 0, 0], s: [s.s[0] * 2.6, s.s[0] * 2.6, 1] }));
    return { tufts, pebbles, shrubs, flowers, stones, shrubShadows };
  }, []);
  return (
    <group>
      {/* çim ada: katmanlı diorama zemin */}
      <RoundedBox args={[12.5, 0.12, 15.5]} radius={0.05} smoothness={3} position={[0, -0.18, 0]} castShadow receiveShadow><meshStandardMaterial color="#6f5b46" roughness={0.95} /></RoundedBox>
      <RoundedBox args={[12.5, 0.14, 15.5]} radius={0.06} smoothness={3} position={[0, -0.06, 0]} castShadow receiveShadow><meshStandardMaterial color="#6fae4a" roughness={0.95} /></RoundedBox>
      {/* beton apron + derz çizgileri */}
      <RoundedBox args={[7.6, 0.06, 12.2]} radius={0.04} smoothness={3} position={[0, 0.0, 0]} receiveShadow><meshStandardMaterial color="#c9cdd0" roughness={0.85} /></RoundedBox>
      {[-4, -2, 0, 2, 4].map((z) => <Box key={z} size={[7.6, 0.065, 0.025]} pos={[0, 0.0, z]} color="#c3c9ce" shadow={false} />)}
      {/* giriş yolu: taş plakalar */}
      {d.stones.map((s, i) => <Box key={i} size={[1.2, 0.05, 0.4]} pos={s.p} color="#e8ebed" rough={0.9} />)}
      {/* çakıl şeritler */}
      {[-4.35, 4.35].map((x) => <Box key={x} size={[0.95, 0.04, 12]} pos={[x, 0.0, 0]} color="#cfd2d4" rough={1} shadow={false} />)}
      <Inst items={d.pebbles}><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial roughness={1} flatShading /></Inst>
      <Inst items={d.tufts}><coneGeometry args={[0.05, 0.22, 5]} /><meshStandardMaterial roughness={0.9} /></Inst>
      <Inst items={d.shrubs}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.9} /></Inst>
      <Inst items={d.flowers}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial roughness={0.6} /></Inst>

      {/* yumuşak zemin gölgeleri */}
      <Blob tex={blobTex} x={0} z={0} w={9.5} d={13.5} o={0.28} y={0.012} />
      <Blob tex={blobTex} x={-5.0} z={-6.4} w={3.2} o={0.5} />
      <Blob tex={blobTex} x={4.6} z={-6.6} w={2.8} o={0.5} />
      <Blob tex={blobTex} x={-5.5} z={6.2} w={2.4} o={0.5} />
      <Blob tex={blobTex} x={5.0} z={-3.2} w={3.0} d={3.6} o={0.55} />
      <Blob tex={blobTex} x={-4.8} z={-3.8} w={2.2} o={0.5} />
      <Blob tex={blobTex} x={3.1} z={-4.75} w={1.1} o={0.5} />
      <Blob tex={blobTex} x={4.7} z={-5.9} w={1.8} d={1.3} o={0.5} />
      <Blob tex={blobTex} x={3.2} z={7.0} w={2.0} d={1.0} o={0.45} />
      <Blob tex={blobTex} x={-1.6} z={6.05} w={1.4} d={0.9} o={0.45} />
      <Blob tex={blobTex} x={1.6} z={6.05} w={1.4} d={0.9} o={0.45} />
      <Blob tex={blobTex} x={-4.9} z={0} w={2.8} d={6.8} o={0.35} />
      <Inst items={d.shrubShadows}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={blobTex} transparent opacity={0.45} depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} /></Inst>

      <Tree pos={[-5.0, 0, -6.4]} s={1.15} hue={0.3} />
      <Tree pos={[4.6, 0, -6.6]} s={0.95} hue={0.33} />
      <Tree pos={[-5.5, 0, 6.2]} s={0.8} hue={0.28} />
      <GroundSolar tex={solarTex} />
      <Shed />
      <WaterTank />
      <RainBarrel />
      <Fence />
      <Crates />
      <Bench pos={[3.2, 0, 7.0]} />
      <Planter x={-1.6} />
      <Planter x={1.6} />
      <LampPost x={-1.3} z={7.4} />
      <LampPost x={1.3} z={7.4} />
      <Signpost tex={signTex} />
    </group>
  );
}

/* ---------- ana model ---------- */
export default function GreenhouseModel() {
  const ventAngle = 0.55;
  return (
    <group>
      <Environment resolution={128} frames={1} environmentIntensity={0.4}>
        <Lightformer form="rect" intensity={2.4} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-12, 4, 0]} rotation-y={Math.PI / 2} scale={[24, 8, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[12, 4, 6]} rotation-y={-Math.PI / 2} scale={[24, 8, 1]} />
      </Environment>

      <ContactShadows position={[0, 0.045, 0]} scale={24} blur={2.6} far={4} opacity={0.5} resolution={1024} frames={1} color="#1d2b1a" />

      {/* yumuşak zemin gölgesi + iç zemin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.22} />
      </mesh>
      <Box size={[2 * HW + 0.2, 0.04, 2 * HL + 0.2]} pos={[0, 0.0, 0]} color="#d6dce1" rough={0.8} />
      <Box size={[1.8, 0.012, 2 * HL]} pos={[0, 0.026, 0]} color="#c3cbd1" rough={0.85} shadow={false} />

      <Frame />
      <SideWall x={-HW} />
      <SideWall x={HW} />
      <GableEnd z={-HL} />
      <GableEnd z={HL} door />
      <RoofSlope side={-1} ventAngle={ventAngle} />
      <RoofSlope side={1} ventAngle={ventAngle} />

      <Racks />
      <HafFan z={-1} />
      <HafFan z={3} />
      <Cabinet />
      <Plumbing />
      <Surroundings />
    </group>
  );
}
