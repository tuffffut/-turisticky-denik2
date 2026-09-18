import React, { useState, useRef } from 'react';
import { TrendingUp, Mountain, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { GPXTrackPoint } from '../types';

interface ElevationProfileProps {
  trackPoints: GPXTrackPoint[];
  onHoverPoint?: (point: GPXTrackPoint | null) => void;
  height?: number;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  trackPoints,
  onHoverPoint,
  height = 180,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<GPXTrackPoint | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  if (!trackPoints || trackPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-28 bg-stone-950/60 rounded-xl border border-stone-800 text-stone-500 text-xs">
        Pro tuto trasu nejsou k dispozici výšková data.
      </div>
    );
  }

  // Filter points with elevation
  const validPoints = trackPoints.filter((p) => p.ele !== undefined);
  if (validPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-28 bg-stone-950/60 rounded-xl border border-stone-800 text-stone-500 text-xs">
        Nedostatek výškových bodů.
      </div>
    );
  }

  const elevations = validPoints.map((p) => p.ele as number);
  const rawMinEle = Math.min(...elevations);
  const rawMaxEle = Math.max(...elevations);

  // Pad elevation range slightly for nice visual margins
  const elePadding = Math.max(20, (rawMaxEle - rawMinEle) * 0.1);
  const minEle = Math.floor(rawMinEle - elePadding);
  const maxEle = Math.ceil(rawMaxEle + elePadding);
  const eleRange = maxEle - minEle || 1;

  const totalDist = validPoints[validPoints.length - 1].distFromStartKm || 0;

  // SVG viewBox coordinates
  const svgWidth = 800;
  const svgHeight = height;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 28;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Build SVG path points
  const pointsCoords = validPoints.map((pt) => {
    const dist = pt.distFromStartKm || 0;
    const x = padLeft + (totalDist > 0 ? (dist / totalDist) * plotWidth : 0);
    const ele = pt.ele as number;
    const y = padTop + plotHeight - ((ele - minEle) / eleRange) * plotHeight;
    return { x, y, pt };
  });

  const pathD = pointsCoords.reduce((acc, curr, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }, '');

  // Closed area path for gradient
  const areaD = `${pathD} L ${pointsCoords[pointsCoords.length - 1].x.toFixed(1)} ${padTop + plotHeight} L ${padLeft} ${padTop + plotHeight} Z`;

  // Calculate ticks for elevation
  const eleStep = Math.round(eleRange / 3 / 50) * 50 || 50;
  const eleTicks: number[] = [];
  for (let e = Math.ceil(minEle / eleStep) * eleStep; e <= maxEle; e += eleStep) {
    eleTicks.push(e);
  }

  // Calculate ticks for distance
  const distTicks: number[] = [];
  const distStep = totalDist > 20 ? 5 : totalDist > 10 ? 2 : 1;
  for (let d = 0; d <= totalDist; d += distStep) {
    distTicks.push(d);
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const scale = svgWidth / rect.width;
    const currentSvgX = clientX * scale;

    if (currentSvgX < padLeft || currentSvgX > padLeft + plotWidth) {
      setHoveredPoint(null);
      setHoverX(null);
      if (onHoverPoint) onHoverPoint(null);
      return;
    }

    // Find closest point by x
    let closest = pointsCoords[0];
    let minDist = Math.abs(pointsCoords[0].x - currentSvgX);

    for (let i = 1; i < pointsCoords.length; i++) {
      const d = Math.abs(pointsCoords[i].x - currentSvgX);
      if (d < minDist) {
        minDist = d;
        closest = pointsCoords[i];
      }
    }

    setHoveredPoint(closest.pt);
    setHoverX(closest.x);
    if (onHoverPoint) onHoverPoint(closest.pt);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoverX(null);
    if (onHoverPoint) onHoverPoint(null);
  };

  return (
    <div className="w-full bg-stone-950/80 border border-stone-800/80 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-300">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>Výškový profil trasy</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-stone-400">
          <span className="flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            Max: <strong className="text-stone-200">{rawMaxEle} m</strong>
          </span>
          <span className="flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5 text-cyan-400" />
            Min: <strong className="text-stone-200">{rawMinEle} m</strong>
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto cursor-crosshair block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines for elevation */}
          {eleTicks.map((tick) => {
            const y = padTop + plotHeight - ((tick - minEle) / eleRange) * plotHeight;
            return (
              <g key={`ele-tick-${tick}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotWidth}
                  y2={y}
                  stroke="#332e2b"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#78716c"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {tick}m
                </text>
              </g>
            );
          })}

          {/* Grid lines & labels for distance */}
          {distTicks.map((d) => {
            const x = padLeft + (totalDist > 0 ? (d / totalDist) * plotWidth : 0);
            return (
              <g key={`dist-tick-${d}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotHeight}
                  stroke="#292524"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fill="#78716c"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {d} km
                </text>
              </g>
            );
          })}

          {/* Filled Area */}
          <path d={areaD} fill="url(#eleGradient)" />

          {/* Elevation Stroke Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Hover Indicator */}
          {hoverX !== null && hoveredPoint && hoveredPoint.ele !== undefined && (
            <g>
              <line
                x1={hoverX}
                y1={padTop}
                x2={hoverX}
                y2={padTop + plotHeight}
                stroke="#34d399"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle
                cx={hoverX}
                cy={padTop + plotHeight - ((hoveredPoint.ele - minEle) / eleRange) * plotHeight}
                r="5"
                fill="#10b981"
                stroke="#ecfdf5"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip HTML on Hover */}
        {hoveredPoint && hoverX !== null && (
          <div
            className="absolute pointer-events-none top-2 transform -translate-x-1/2 bg-stone-900 border border-emerald-500/60 shadow-lg rounded-md px-2.5 py-1 text-xs text-stone-100 backdrop-blur-md flex items-center gap-2 transition-transform"
            style={{
              left: `${((hoverX - padLeft) / plotWidth) * 100}%`,
            }}
          >
            <span className="font-semibold text-emerald-400 font-mono">
              {hoveredPoint.ele} m
            </span>
            <span className="text-stone-400">|</span>
            <span className="text-stone-300 font-mono">
              {hoveredPoint.distFromStartKm?.toFixed(1)} km
            </span>
          </div>
        )}
      </div>
      <p className="text-[11px] text-stone-500 mt-1.5 text-center">
        Pohybem myši nad grafem zobrazíte výšku a zvýrazníte pozici na mapě
      </p>
    </div>
  );
};
