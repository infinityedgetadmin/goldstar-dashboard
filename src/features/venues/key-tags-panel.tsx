'use client';
import { useMemo, useState } from 'react';
import { where, type QueryConstraint } from 'firebase/firestore';
import type { KeyTag } from '@goldstar/platform';
import { useCollection } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/buttons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';

export interface KeyTagsPanelProps {
  operatorId: string;
  venueId: string;
  venueName: string;
  operatorName?: string;
}

const STATUS_TONE: Record<KeyTag['status'], StatusTone> = {
  available: 'positive',
  assigned: 'info',
  lost: 'negative',
  retired: 'neutral',
};

interface BatchGroup {
  batchId: string;
  values: string[];
}

/**
 * `KeyTagsPanel`: generate N key tags for this venue via `venueGenerateKeyTags`, then print any
 * batch as a 3x8-per-Letter-page QR sheet. `@react-pdf/renderer` and `qrcode` are only ever reached
 * through the dynamic `import('./key-tags-pdf')` / `import('qrcode')` inside `handlePrint` — never a
 * static import here — per the task brief's bundle rule; this panel only lives under
 * `src/app/(operator)/venues/**`, so even a static import couldn't reach the guest bundle (different
 * route group — same reasoning as `use-collection-exists.ts`), but the lazy-load keeps the venue
 * detail PAGE's own first-load light regardless of whether the operator ever clicks "Print".
 *
 * task-5-review.md N2: printing is driven entirely by the live `tags` collection (grouped by
 * `printedBatchId`), not by in-memory state from the "Generate" click — a page reload/navigation no
 * longer strands an unprinted batch. `useCollection` is an `onSnapshot` listener (this workspace's
 * ledger constraint: no one-shot read introduced here), so a batch generated in a different browser
 * tab/session shows up and is printable here too.
 */
export function KeyTagsPanel({ operatorId, venueId, venueName, operatorName }: KeyTagsPanelProps) {
  const [count, setCount] = useState(50);
  const [prefix, setPrefix] = useState('GS');
  const [generating, setGenerating] = useState(false);
  const [printingBatchId, setPrintingBatchId] = useState<string | null>(null);

  const constraints = useMemo<QueryConstraint[]>(() => [where('venueId', '==', venueId)], [venueId]);
  const { data: tags, loading } = useCollection<KeyTag>(`operators/${operatorId}/keyTags`, constraints);

  const counts = tags.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {});

  // Groups the live tag list by printedBatchId, sorted by value within each group (keyTagSchema has
  // no timestamp field to order groups by generation time — grouping is complete and correct either
  // way; only the DISPLAY order of the batch list itself is arbitrary).
  const batches = useMemo<BatchGroup[]>(() => {
    const byBatch = new Map<string, string[]>();
    for (const t of tags) {
      if (!t.printedBatchId) continue;
      const arr = byBatch.get(t.printedBatchId) ?? [];
      arr.push(t.value);
      byBatch.set(t.printedBatchId, arr);
    }
    return [...byBatch.entries()].map(([batchId, values]) => ({ batchId, values: values.sort() }));
  }, [tags]);

  const prefixValid = /^[A-Z0-9]{2,6}$/.test(prefix);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const out = await callable('venueGenerateKeyTags')({ venueId, count, prefix });
      toast.success(`Generated ${out.values.length} key tags.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async (batch: BatchGroup) => {
    setPrintingBatchId(batch.batchId);
    try {
      const [{ labelsForBatch, KeyTagSheet, pdf }, { toDataURL }] = await Promise.all([import('./key-tags-pdf'), import('qrcode')]);
      const pages = labelsForBatch(
        batch.values.map((value) => ({ id: value, value })),
        { venueName },
      );
      const pagesWithQr = await Promise.all(
        pages.map((page) =>
          Promise.all(
            page.map(async (label) => ({ ...label, qrDataUrl: await toDataURL(label.value, { width: 200, margin: 1 }) })),
          ),
        ),
      );
      const blob = await pdf(<KeyTagSheet pages={pagesWithQr} operatorName={operatorName} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `key-tags-${venueName.replace(/\s+/g, '-').toLowerCase()}-${batch.batchId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e);
    } finally {
      setPrintingBatchId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3 text-body-sm text-text-secondary">
          {loading ? (
            <Text size="sm" color="tertiary">
              Loading…
            </Text>
          ) : (
            (['available', 'assigned', 'lost', 'retired'] as const).map((status) => (
              <StatusPill key={status} label={`${counts[status] ?? 0} ${status}`} tone={STATUS_TONE[status]} />
            ))
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Input label="Count" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
          <Input
            label="Prefix"
            value={prefix}
            maxLength={6}
            error={prefix.length > 0 && !prefixValid ? '2-6 uppercase letters/digits' : undefined}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          />
          <Button loading={generating} disabled={!prefixValid || count < 1 || count > 500} onClick={handleGenerate}>
            Generate
          </Button>
        </div>

        {batches.length > 0 && (
          <div className="space-y-2">
            <Text size="sm" weight="medium">
              Batches
            </Text>
            {batches.map((batch) => (
              <div key={batch.batchId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-secondary p-4">
                <Text size="sm">
                  Batch {batch.batchId}: {batch.values[0]} – {batch.values[batch.values.length - 1]} ({batch.values.length} tags)
                </Text>
                <Button variant="secondary" size="sm" loading={printingBatchId === batch.batchId} onClick={() => handlePrint(batch)}>
                  Print sheet (PDF)
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
