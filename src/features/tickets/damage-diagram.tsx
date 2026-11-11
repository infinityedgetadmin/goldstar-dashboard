'use client';
import type { DamageReport } from '@goldstar/platform';
import { VEHICLE_PANELS } from '@goldstar/platform';
import { Text } from '@/components/ui/typography';

type PanelKey = (typeof VEHICLE_PANELS)[number];
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Schematic top-down panel layout (front of the car at the top of the SVG). This is a labeled-box
 * schematic, not a pixel-matched trace of goldstar-mobile's own car artwork (no asset for that was
 * available to this task) — it mirrors the SEMANTICS `diagramMarks` actually needs (each mark's
 * `(x, y)` is normalized 0-1 within its OWN panel's box — schemas/damage.ts's comment on
 * `diagramMarks`), not the visual asset. Disclosed simplification.
 */
const PANEL_LAYOUT: Record<PanelKey, Rect> = {
  front_bumper: { x: 60, y: 5, w: 80, h: 15 },
  hood: { x: 55, y: 22, w: 90, h: 35 },
  windshield: { x: 55, y: 59, w: 90, h: 25 },
  roof: { x: 55, y: 86, w: 90, h: 70 },
  rear_window: { x: 55, y: 158, w: 90, h: 25 },
  trunk: { x: 55, y: 185, w: 90, h: 35 },
  rear_bumper: { x: 60, y: 222, w: 80, h: 15 },
  front_left_fender: { x: 15, y: 22, w: 38, h: 35 },
  front_left_door: { x: 15, y: 59, w: 38, h: 55 },
  rear_left_door: { x: 15, y: 116, w: 38, h: 55 },
  rear_left_quarter: { x: 15, y: 173, w: 38, h: 47 },
  front_right_fender: { x: 147, y: 22, w: 38, h: 35 },
  front_right_door: { x: 147, y: 59, w: 38, h: 55 },
  rear_right_door: { x: 147, y: 116, w: 38, h: 55 },
  rear_right_quarter: { x: 147, y: 173, w: 38, h: 47 },
  wheels: { x: 70, y: 242, w: 60, h: 20 },
  interior: { x: 5, y: 242, w: 60, h: 20 },
  other: { x: 135, y: 242, w: 60, h: 20 },
};

const KIND_COLOR: Record<DamageReport['diagramMarks'][number]['kind'], string> = {
  scratch: '#f59e0b',
  dent: '#ef4444',
  chip: '#eab308',
  crack: '#dc2626',
  scuff: '#fb923c',
  missing: '#7c3aed',
  stain: '#0891b2',
  other: '#6b7280',
};

export interface DamageDiagramProps {
  report: DamageReport;
}

/** Renders `diagramMarks` as dots on a schematic top-down panel layout — one diagram per damage
 * report (a ticket can have several: check-in, check-out, pre/post-drive, incident). */
export function DamageDiagram({ report }: DamageDiagramProps) {
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 200 270" role="img" aria-label={`Damage diagram for ${report.phase.replace(/_/g, ' ')}`} className="mx-auto w-full max-w-[220px]">
        {(Object.entries(PANEL_LAYOUT) as [PanelKey, Rect][]).map(([panel, r]) => (
          <g key={panel}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={3} className="fill-bg-secondary stroke-border" strokeWidth={1} />
          </g>
        ))}
        {report.diagramMarks.map((mark, i) => {
          const r = PANEL_LAYOUT[mark.panel];
          const cx = r.x + mark.x * r.w;
          const cy = r.y + mark.y * r.h;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={mark.preExisting ? 3.5 : 4.5}
              fill={KIND_COLOR[mark.kind]}
              fillOpacity={mark.preExisting ? 0.5 : 0.9}
              stroke={mark.preExisting ? KIND_COLOR[mark.kind] : '#fff'}
              strokeDasharray={mark.preExisting ? '1.5 1' : undefined}
              strokeWidth={1}
            >
              <title>
                {mark.panel.replace(/_/g, ' ')}: {mark.kind}
                {mark.preExisting ? ' (pre-existing)' : ''}
                {mark.note ? ` — ${mark.note}` : ''}
              </title>
            </circle>
          );
        })}
      </svg>
      {report.diagramMarks.length === 0 ? (
        <Text size="xs" color="tertiary" className="text-center">
          No damage marked.
        </Text>
      ) : (
        <ul className="space-y-1">
          {report.diagramMarks.map((mark, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: KIND_COLOR[mark.kind] }} aria-hidden />
              <Text size="xs" color="secondary">
                {mark.panel.replace(/_/g, ' ')} · {mark.kind}
                {mark.preExisting ? ' (pre-existing)' : ''}
                {mark.note ? ` — ${mark.note}` : ''}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
