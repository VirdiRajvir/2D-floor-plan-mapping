'use client';

interface Props {
  points: { x: number; y: number }[];  // normalized 0-1
  imageWidth: number;
  imageHeight: number;
  color?: string;
  type?: 'walk' | 'stairs' | 'transition';
}

export function PathLayer({
  points,
  imageWidth,
  imageHeight,
  color = '#06b6d4',
  type = 'walk',
}: Props) {
  if (points.length < 2) return null;

  const pts = points.map(p => ({
    x: p.x * imageWidth,
    y: p.y * imageHeight,
  }));

  // Build SVG path
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Arrow direction for each segment
  const arrows: { cx: number; cy: number; angle: number }[] = [];
  const step = Math.max(1, Math.floor(pts.length / 6));
  for (let i = step; i < pts.length - 1; i += step) {
    const dx = pts[i + 1].x - pts[i - 1].x;
    const dy = pts[i + 1].y - pts[i - 1].y;
    arrows.push({
      cx: pts[i].x,
      cy: pts[i].y,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  const strokeDash = type === 'transition' ? '6 4' : type === 'stairs' ? '4 3' : undefined;
  const pathColor = type === 'transition' ? '#a78bfa' : type === 'stairs' ? '#818cf8' : color;

  return (
    <>
      {/* Glow effect */}
      <path
        d={d}
        fill="none"
        stroke={pathColor}
        strokeWidth={8}
        opacity={0.12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main path */}
      <path
        d={d}
        fill="none"
        stroke={pathColor}
        strokeWidth={3}
        opacity={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDash}
      >
        {!strokeDash && (
          <animate
            attributeName="strokeDashoffset"
            from="0"
            to="-20"
            dur="0.6s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Animated marching ants */}
      {!strokeDash && (
        <path
          d={d}
          fill="none"
          stroke="white"
          strokeWidth={1.5}
          opacity={0.5}
          strokeLinecap="round"
          strokeDasharray="8 12"
        >
          <animate
            attributeName="strokeDashoffset"
            from="0"
            to="-20"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Start circle */}
      <circle cx={pts[0].x} cy={pts[0].y} r={5} fill={pathColor} opacity={0.9} />
      <circle cx={pts[0].x} cy={pts[0].y} r={9} fill="none" stroke={pathColor} strokeWidth={1.5} opacity={0.5} />

      {/* End target */}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={7} fill="none" stroke={pathColor} strokeWidth={2} opacity={0.9} />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={pathColor} opacity={0.9} />

      {/* Direction arrows */}
      {arrows.map((arrow, i) => (
        <g
          key={i}
          transform={`translate(${arrow.cx},${arrow.cy}) rotate(${arrow.angle})`}
        >
          <polygon
            points="-5,-4 5,0 -5,4"
            fill={pathColor}
            opacity={0.85}
          />
        </g>
      ))}
    </>
  );
}
