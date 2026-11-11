'use client';
import { Plus, Trash2 } from 'lucide-react';
import type { Venue } from '@goldstar/platform';
import { Input } from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

type Zone = Venue['zones'][number];

export interface ZonesEditorProps {
  value: Zone[];
  onChange: (next: Zone[]) => void;
}

function newZoneId(existing: Zone[]): string {
  // Short, human-typeable ids (staff reference zones by name/id on the floor, e.g. "Lot A") —
  // venueSchema only requires zone ids to be unique within the venue (its own `.refine()`), not
  // globally, so a simple letter sequence is enough and reads far better on a printed sheet than a
  // uuid would.
  const used = new Set(existing.map((z) => z.id));
  for (let i = 0; i < 26; i++) {
    const candidate = String.fromCharCode(65 + i);
    if (!used.has(candidate)) return candidate;
  }
  return `Z${existing.length + 1}`;
}

/**
 * `ZonesEditor` = `venueSchema.zones` (id, name, optional capacity). Uncontrolled `value`/`onChange`
 * pair, same island shape as `RatesEditor` — `VenueForm` threads this through one `Controller` for
 * the `zones` array field.
 */
export function ZonesEditor({ value, onChange }: ZonesEditorProps) {
  const update = (id: string, patch: Partial<Zone>) => onChange(value.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const add = () => onChange([...value, { id: newZoneId(value), name: '' }]);
  const remove = (id: string) => onChange(value.filter((z) => z.id !== id));

  const duplicateIds = new Set(value.map((z) => z.id).filter((id, i, arr) => arr.indexOf(id) !== i));

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <Text size="sm" color="tertiary">
          No parking zones yet.
        </Text>
      )}
      {/* aria-label (not `label`) on every repeated-row field — a visible `<label>` here would
          duplicate the same text ("Zone ID"/"Name"/"Capacity") once per zone, and "Name" would
          additionally collide with the venue's own top-level Name field. */}
      {value.map((zone) => (
        <div key={zone.id} className="flex flex-wrap items-end gap-3">
          <Input
            placeholder="Zone ID"
            value={zone.id}
            error={duplicateIds.has(zone.id) ? 'Zone ids must be unique' : undefined}
            onChange={(e) => update(zone.id, { id: e.target.value })}
            aria-label={`Zone id ${zone.id}`}
          />
          <Input
            placeholder="Name"
            value={zone.name}
            onChange={(e) => update(zone.id, { name: e.target.value })}
            aria-label={`Zone name ${zone.id}`}
          />
          <Input
            placeholder="Capacity — no limit"
            type="number"
            min={1}
            step={1}
            value={zone.capacity ?? ''}
            onChange={(e) => update(zone.id, { capacity: e.target.value === '' ? undefined : Number(e.target.value) })}
            aria-label={`Zone capacity ${zone.id}`}
          />
          <Button variant="ghost" size="sm" aria-label={`Remove zone ${zone.name || zone.id}`} onClick={() => remove(zone.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={add}>
        Add zone
      </Button>
    </div>
  );
}
