'use client';

import type { MapPin, MapProject } from '@/lib/types';

interface Props {
  pins: MapPin[];
  imageWidth: number;
  imageHeight: number;
  onPinClick: (pin: MapPin) => void;
  hoveredPinId: string | null;
  onPinHover: (id: string | null) => void;
  project: MapProject;
}

const ICON_COLORS: Record<string, string> = {
  building: '#818cf8',
  lab: '#06b6d4',
  office: '#22c55e',
  emergency: '#ef4444',
  '3d': '#06b6d4',
  default: '#818cf8',
};

export function MapPins({ pins, imageWidth, imageHeight, onPinClick, hoveredPinId, onPinHover, project }: Props) {
  return (
    <>
      {pins.map(pin => {
        const px = pin.x * imageWidth;
        const py = pin.y * imageHeight;
        const isHovered = hoveredPinId === pin.id;
        const is3D = !!pin.model3D;
        const color = is3D ? ICON_COLORS['3d'] : ICON_COLORS[pin.icon ?? 'default'];

        return (
          <g
            key={pin.id}
            data-pin="true"
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onPinClick(pin); }}
            onMouseEnter={() => onPinHover(pin.id)}
            onMouseLeave={() => onPinHover(null)}
          >
            {/* Outer pulse ring */}
            <circle
              cx={px} cy={py}
              r={isHovered ? 22 : 16}
              fill="none"
              stroke={color}
              strokeWidth={isHovered ? 2 : 1.5}
              opacity={0.35}
              style={{ transition: 'r 200ms, opacity 200ms' }}
            />

            {/* Animated pulse ring */}
            <circle
              cx={px} cy={py}
              r={isHovered ? 26 : 20}
              fill="none"
              stroke={color}
              strokeWidth={1}
              opacity={0.2}
            >
              <animate attributeName="r" from={isHovered ? 22 : 16} to={isHovered ? 34 : 28} dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
            </circle>

            {/* Pin circle background */}
            <circle
              cx={px} cy={py}
              r={isHovered ? 13 : 10}
              fill={color}
              opacity={0.9}
              style={{ transition: 'r 200ms, fill 200ms' }}
            />

            {/* Location icon */}
            <text
              x={px} y={py + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isHovered ? 9 : 7}
              fill="white"
              style={{ transition: 'font-size 200ms', userSelect: 'none', pointerEvents: 'none' }}
            >
              {is3D ? '🧊' : '●'}
            </text>

            {/* Tooltip label */}
            {isHovered && (
              <g>
                <rect
                  x={px - 45} y={py - 32}
                  width={90} height={20}
                  rx={4}
                  fill="rgba(15,20,30,0.92)"
                  stroke={color}
                  strokeWidth={0.5}
                />
                <text
                  x={px} y={py - 22 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8.5}
                  fill="white"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {pin.label.length > 16 ? pin.label.slice(0, 14) + '…' : pin.label}
                </text>

                {/* Click hint */}
                <text
                  x={px} y={py + 30}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={6.5}
                  fill={color}
                  opacity={0.8}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {is3D ? 'View 3D model' : 'Click to explore'}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
