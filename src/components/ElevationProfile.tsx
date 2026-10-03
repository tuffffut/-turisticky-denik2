import React, { useState } from 'react';
import { GpxTrackpoint } from '../types';
import { TrendingUp, ArrowUpRight } from 'lucide-react';

interface ElevationProfileProps {
  trackpoints?: GpxTrackpoint[];
  highestPointM?: number;
  elevationGainM?: number;
  distanceKm?: number;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  trackpoints = [],
  highestPointM,
  elevationGainM,
  distanceKm,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    distKm: number;
    eleM: number;
  } | null>(null);

  // Filter valid elevation points
  const pointsWithEle = trackpoints.filter((pt) => typeof pt.ele === 'number');

  if (pointsWithEle.length < 2) {
    return (
      <div className="bg-stone-900/60 border border-stone-800 rounded-xl p-4 text-center text-xs text-stone-500">
        Výškový profil není k dispozici (v GPX záznamu chybí data nadmořské výšky).
      </div>
    );
  }

  // Calculate distances if not present
  let runningDist = 0;
  const processedPoints = pointsWithEle.map((pt, i) => {
    if (typeof pt.distFromStartKm === 'number') {
      return { dist: pt.distFromStartKm, ele: pt.ele! };
    }
    if (i > 0) {
      const prev = pointsWithEle[i - 1];
      const dLat = ((pt.lat - prev.lat) * Math.PI) / 180;
      const dLon = ((pt.lng - prev.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((prev.lat * Math.PI) / 180) *
          Math.cos((pt.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      runningDist += 6371 * c;
    }
    return { dist: runningDist, ele: pt.ele! };
  });

  const totalDist = distanceKm || processedPoints[processedPoints.length - 1].dist || 1;
  const minEle = Math.floor(Math.min(...processedPoints.map((p) => p.ele)) / 50) * 50;
  const maxEle = Math.ceil(Math.max(...processedPoints.map((p) => p.ele), highestPointM || 0) / 50) * 50;
  const eleSpan = Math.max(maxEle - minEle, 100);

  const width = 600;
  const height = 180;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 20;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const coords = processedPoints.map((p) => {
    const x = padLeft + (p.dist / totalDist) * chartW;
    const y = padTop + chartH - ((p.ele - minEle) / eleSpan) * chartH;
    return { x, y, dist: p.dist, ele: p.ele };
  });

  const polylineStr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaStr = `${coords[0].x},${padTop + chartH} ${polylineStr} ${coords[coords.length - 1].x},${padTop + chartH}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    if (mouseX < padLeft || mouseX > width - padRight) {
      setHoveredPoint(null);
      return;
    }
    // Find closest point
    let closest = coords[0];
    let minDist = Math.abs(coords[0].x - mouseX);
    for (let i = 1; i < coords.length; i++) {
      const d = Math.abs(coords[i].x - mouseX);
      if (d < minDist) {
        minDist = d;
        closest = coords[i];
      }
    }
    setHoveredPoint({
      x: closest.x,
      y: closest.y,
      distKm: closest.dist,
      eleM: Math.round(closest.ele),
    });
  };

  return (
    <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
            Výškový profil
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-stone-400">
          {elevationGainM !== undefined && (
            <span className="flex items-center gap-1 text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" /> +{elevationGainM} m
            </span>
          )}
          <span>Max: <strong className="text-stone-200">{highestPointM || maxEle} m</strong></span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id="eleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.5, 1].map((pct) => {
          const y = padTop + chartH * (1 - pct);
          const val = Math.round(minEle + eleSpan * pct);
          return (
            <g key={pct}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#292524"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                fill="#78716c"
                fontSize="10"
                textAnchor="end"
              >
                {val}m
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon points={areaStr} fill="url(#eleGradient)" />

        {/* Line stroke */}
        <polyline
          points={polylineStr}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X axis labels */}
        <text x={padLeft} y={height - 8} fill="#78716c" fontSize="10">
          0 km
        </text>
        <text
          x={padLeft + chartW / 2}
          y={height - 8}
          fill="#78716c"
          fontSize="10"
          textAnchor="middle"
        >
          {(totalDist / 2).toFixed(1)} km
        </text>
        <text
          x={width - padRight}
          y={height - 8}
          fill="#78716c"
          fontSize="10"
          textAnchor="end"
        >
          {totalDist.toFixed(1)} km
        </text>

        {/* Hover indicator */}
        {hoveredPoint && (
          <g>
            <line
              x1={hoveredPoint.x}
              y1={padTop}
              x2={hoveredPoint.x}
              y2={padTop + chartH}
              stroke="#e7e5e4"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="4.5"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {hoveredPoint && (
        <div
          className="absolute top-3 bg-stone-900/90 border border-stone-700 text-xs px-2.5 py-1 rounded shadow-lg pointer-events-none transform -translate-x-1/2"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
          }}
        >
          <span className="font-semibold text-emerald-400">{hoveredPoint.eleM} m</span>
          <span className="text-stone-400 ml-2">({hoveredPoint.distKm.toFixed(1)} km)</span>
        </div>
      )}
    </div>
  );
};
