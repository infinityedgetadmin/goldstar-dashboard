'use client';
import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { firebase } from '@/lib/firebase/client';

export interface UseStoragePhotoUrlResult {
  url: string | undefined;
  loading: boolean;
}

/** Resolves a Cloud Storage object path (`photo.storagePath`, e.g.
 * `operators/{op}/tickets/{ticketId}/photos/{photoId}.jpg` — storage.rules keys these by ticket,
 * not by damage-report id) to a downloadable URL. Not a live subscription — a Storage download URL
 * doesn't change once minted, so a one-shot fetch per photo is enough. */
export function useStoragePhotoUrl(storagePath: string | undefined): UseStoragePhotoUrlResult {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(storagePath));

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setUrl(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { storage } = firebase();
    getDownloadURL(ref(storage, storagePath))
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return { url, loading };
}
