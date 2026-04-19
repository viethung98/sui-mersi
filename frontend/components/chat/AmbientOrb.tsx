'use client';

// Pure CSS orb — technique from react-ai-orb source:
// rotate3d on each layer at staggered speeds + hue-rotate on the root
// creates organic morphing without canvas or WebGL.
export function AmbientOrb({ size = 140 }: { size?: number }) {
  return (
    <div className="orb-root" style={{ '--orb-size': `${size}px` } as React.CSSProperties}>
      {/* Soft ambient halo outside the circle — contained by its own sizing */}
      <div className="orb-halo" />
      {/* Clipped sphere */}
      <div className="orb-sphere">
        <div className="orb-base" />
        <div className="orb-layer orb-layer-a" />
        <div className="orb-layer orb-layer-b" />
        <div className="orb-layer orb-layer-c" />
        <div className="orb-layer orb-layer-d" />
        {/* Static specular highlight */}
        <div className="orb-spec" />
      </div>
    </div>
  );
}
