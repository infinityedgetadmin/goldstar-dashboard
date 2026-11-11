import { describe, expect, it } from 'vitest';
import { labelsForBatch } from '../key-tags-pdf';
it('lays out 24 labels per page with tag values', () => { const pages = labelsForBatch(Array.from({ length: 30 }, (_, i) => ({ id: `k${i}`, value: `GS-SE-${String(i + 1).padStart(4, '0')}` })), { venueName: 'St. Elmo' }); expect(pages).toHaveLength(2); expect(pages[0]).toHaveLength(24); expect(pages[1]![0]!.value).toBe('GS-SE-0025'); });
