import React, { useEffect } from 'react';
import { motion, animate } from 'motion/react';

// Kısa, sakin giriş animasyonları (0.3-0.9 sn): kartlar sırayla yükselir, sayılar sayarak değişir, grafik soldan açılır
export const cardIn = (i) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.1 * i, ease: 'easeOut' } });

export function CountUp({ value, decimals = 1 }) {
  const ref = React.useRef(null);
  const prev = React.useRef(0);
  const num = parseFloat(value);
  useEffect(() => {
    if (!Number.isFinite(num) || !ref.current) return;
    const c = animate(prev.current, num, { duration: 0.8, ease: 'easeOut', onUpdate: v => { ref.current.textContent = v.toFixed(decimals); } });
    prev.current = num;
    return () => c.stop();
  }, [num, decimals]);
  return <span ref={ref}>{Number.isFinite(num) ? num.toFixed(decimals) : value}</span>;
}

export const Reveal = ({ children, k }) => (
  <motion.div key={k} style={{ height: '100%' }} initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.9, ease: 'easeInOut' }}>
    {children}
  </motion.div>
);
