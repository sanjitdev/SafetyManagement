/**
 * Static SVG map (components/MapView.tsx).
 *
 * A simplified city map used by the report flow. v1 keeps it as an SVG
 * so the feature is fully runnable in a browser without tile-server
 * dependencies; the production path (per tech-audit §2) swaps this for
 * MapLibre GL JS + OpenStreetMap raster tiles.
 *
 * The map shows:
 *   - A neutral city background
 *   - A ward polygon (the citizen's ward)
 *   - A draggable pin at the current location
 *   - A 50m dedup ring around the pin
 *
 * The pin is draggable via pointer events; the parent receives onPinMove.
 */

'use client';

import { useCallback, useRef, useState } from 'react';

interface MapViewProps {
  lat: number;
  lng: number;
  // approximate bounds for the SVG viewport
  center: { lat: number; lng: number };
  // width of map area in pixels (responsive)
  width: number;
  height: number;
  // when true, dragging is enabled
  draggable?: boolean;
  onPinMove?: (lat: number, lng: number) => void;
  // when true, the dedup ring is shown
  showDedupRing?: boolean;
  // when true, the city boundary is shaded to indicate the supported area
  showBoundary?: boolean;
}

const DEFAULT_CITY_CENTER = { lat: 23.789, lng: 90.4075 };
const VISIBLE_DEG = 0.05; // ~5 km

function project(lat: number, lng: number, center: { lat: number; lng: number }, width: number, height: number) {
  const xRatio = (lng - (center.lng - VISIBLE_DEG / 2)) / VISIBLE_DEG;
  const yRatio = 1 - (lat - (center.lat - VISIBLE_DEG / 2)) / VISIBLE_DEG;
  return {
    x: xRatio * width,
    y: yRatio * height,
  };
}

function unproject(x: number, y: number, center: { lat: number; lng: number }, width: number, height: number) {
  const lng = center.lng - VISIBLE_DEG / 2 + (x / width) * VISIBLE_DEG;
  const lat = center.lat - VISIBLE_DEG / 2 + (1 - y / height) * VISIBLE_DEG;
  return { lat, lng };
}

export default function MapView({
  lat,
  lng,
  center = DEFAULT_CITY_CENTER,
  width = 720,
  height = 480,
  draggable = true,
  onPinMove,
  showDedupRing = false,
  showBoundary = false,
}: MapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!draggable) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [draggable],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !onPinMove) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > width || y > height) return;
      const { lat: nlat, lng: nlng } = unproject(x, y, center, width, height);
      onPinMove(
        Math.max(center.lat - VISIBLE_DEG / 2, Math.min(center.lat + VISIBLE_DEG / 2, nlat)),
        Math.max(center.lng - VISIBLE_DEG / 2, Math.min(center.lng + VISIBLE_DEG / 2, nlng)),
      );
    },
    [dragging, onPinMove, center, width, height],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  const pin = project(lat, lng, center, width, height);
  const ringRadiusPx = (50 / 111_000) * (width / VISIBLE_DEG) * 10; // ~50m ring scaled

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      style={{
        display: 'block',
        // Use design tokens for the map background so it follows the
        // active theme. The faux-road grid below hardcodes light-mode
        // stroke colors (#cdd6c8); a dark-theme stroke follows the
        // surface-raised token in the dark override below.
        background:
          'linear-gradient(180deg, var(--color-map-bg) 0%, var(--color-surface-sunken) 100%)',
        cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
        borderRadius: 'var(--radius-md)',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="img"
      aria-label="Map showing your report location"
    >
      {/* Faux road grid */}
      <g stroke="#cdd6c8" strokeWidth={1.2}>
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            x2={width}
            y1={(i + 1) * (height / 8)}
            y2={(i + 1) * (height / 8)}
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`v-${i}`}
            y1={0}
            y2={height}
            x1={(i + 1) * (width / 10)}
            x2={(i + 1) * (width / 10)}
          />
        ))}
      </g>

      {/* City boundary shaded — opt-in */}
      {showBoundary && (
        <rect
          x={width * 0.18}
          y={height * 0.18}
          width={width * 0.64}
          height={height * 0.64}
          fill="rgba(14, 90, 74, 0.08)"
          stroke="rgba(14, 90, 74, 0.4)"
          strokeDasharray="6 6"
          strokeWidth={2}
          rx={12}
        />
      )}

      {/* City label */}
      <text
        x={width / 2}
        y={height * 0.1}
        textAnchor="middle"
        fill="var(--color-ink-secondary, #6b7280)"
        fontSize={14}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        Dhaka North — Ward 14 (Mirpur)
      </text>

      {/* 50m dedup ring */}
      {showDedupRing && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={ringRadiusPx}
          fill="rgba(232, 99, 87, 0.15)"
          stroke="rgba(232, 99, 87, 0.6)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
      )}

      {/* Pin */}
      <g transform={`translate(${pin.x}, ${pin.y})`}>
        <circle r={14} fill="var(--color-primary, #0E5A4A)" />
        <circle r={5} fill="#fff" />
        <text
          y={-22}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="var(--color-ink, #111)"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
        </text>
      </g>
    </svg>
  );
}
