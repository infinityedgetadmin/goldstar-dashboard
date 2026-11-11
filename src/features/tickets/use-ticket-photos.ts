'use client';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { DamageReport, Photo } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

export interface TicketPhoto extends Photo {
  reportId: string;
  reportPhase: DamageReport['phase'];
}

export interface UseTicketPhotosResult {
  photos: TicketPhoto[];
  loading: boolean;
}

/**
 * `photos` is a subcollection of EACH damage report (`operators/{op}/damageReports/{reportId}/photos`),
 * and a ticket can have several reports (check_in/check_out/pre_drive/post_drive/incident phases) —
 * so this multiplexes one `onSnapshot` listener per report, mirroring `use-live-tickets.ts`'s
 * per-venue multiplexing pattern (subscribe to N sources, merge into one keyed record, recompute a
 * flat sorted list via a stable dependency key rather than the array's own identity).
 */
export function useTicketPhotos(operatorId: string | undefined, reports: Pick<DamageReport, 'id' | 'phase'>[]): UseTicketPhotosResult {
  const reportKey = [...reports].map((r) => r.id).sort().join(',');
  const [byReport, setByReport] = useState<Record<string, TicketPhoto[]>>({});
  const [loading, setLoading] = useState(reports.length > 0);

  useEffect(() => {
    if (!operatorId || reportKey === '') {
      setByReport({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { db } = firebase();
    const ids = reportKey.split(',');
    const phaseById = new Map(reports.map((r) => [r.id, r.phase]));
    const pending = new Set(ids);
    const unsubs: Unsubscribe[] = ids.map((reportId) =>
      onSnapshot(collection(db, `operators/${operatorId}/damageReports/${reportId}/photos`), (snap) => {
        pending.delete(reportId);
        setByReport((prev) => ({
          ...prev,
          [reportId]: snap.docs.map((d) => ({ ...(d.data() as Photo), reportId, reportPhase: phaseById.get(reportId) ?? 'check_in' })),
        }));
        setLoading(pending.size > 0);
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reports' content is captured via reportKey
  }, [operatorId, reportKey]);

  const photos = Object.values(byReport)
    .flat()
    .sort((a, b) => a.at.localeCompare(b.at));

  return { photos, loading };
}
