import { useEffect, useRef } from 'react';
import { portalScreen } from '../../systems/portal/portalScreen';

/**
 * The NOVA portal's glow (Phase 12): the Core gathering warm light and
 * releasing the bloom.
 *
 * Deliberately all it draws. The applications that come out of the portal are
 * NOVA's real spatial windows, drawn, moved and operated by the window system —
 * so pointer drags, resizes, pinches and air clicks reach them unchanged. One
 * transform and one opacity per frame, through a ref.
 */
export function PortalLayer() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const glow = glowRef.current;
      if (!glow) return;
      const visible = portalScreen.phase !== 'closed';
      const charge = portalScreen.charge;
      glow.style.transform = `translate3d(${portalScreen.originX}px, ${portalScreen.originY}px, 0) scale(${0.5 + charge * 0.6})`;
      glow.style.opacity = String(visible ? charge * 0.55 : 0);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="portal" aria-hidden>
      <div className="portal__glow" ref={glowRef} />
    </div>
  );
}
