'use client';
import { useState } from 'react';
import type { Claim } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { useStoragePhotoUrl } from '@/features/tickets/use-storage-photo-url';

export interface EvidencePanelProps {
  claimId: string;
  evidenceBundle: Claim['evidenceBundle'];
}

/**
 * "Generate bundle" -> `claimsGenerateBundle` callable (`{ claimId }` -> `{ pdfPath, zipPath }`).
 * The panel doesn't need the callable's own return value for its links — `claim-detail.tsx` passes
 * `evidenceBundle` from the LIVE claim subscription, which updates the moment
 * `claimsGenerateBundleHandler`'s `claimRef.update({ evidenceBundle })` lands, so a successful call
 * re-renders this panel with the new paths automatically. Download links reuse
 * `use-storage-photo-url.ts`'s `useStoragePhotoUrl` (despite its ticket-photo-scoped name and
 * location, it's storage-path-generic — a plain `getDownloadURL` wrapper — reused here rather than
 * duplicated per the DRY house rule) — the CLIENT-side `getDownloadURL()` call, made by the
 * signed-in admin's own authenticated session, is what `storage.rules`' `operators/{op}/claims/
 * {claimId}/{file}` read gate (`isAdmin() || isPlatformAdmin()`) actually evaluates against; the
 * platform callable only ever mints the object's download TOKEN, never a URL itself.
 */
export function EvidencePanel({ claimId, evidenceBundle }: EvidencePanelProps) {
  const [generating, setGenerating] = useState(false);
  const { url: pdfUrl, loading: pdfLoading } = useStoragePhotoUrl(evidenceBundle?.pdfPath);
  const { url: zipUrl, loading: zipLoading } = useStoragePhotoUrl(evidenceBundle?.zipPath);

  const generate = async () => {
    setGenerating(true);
    try {
      await callable('claimsGenerateBundle')({ claimId });
      toast.success('Evidence bundle generated.');
    } catch (e) {
      toast.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence bundle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={generate} loading={generating} disabled={generating}>
          {evidenceBundle ? 'Regenerate bundle' : 'Generate bundle'}
        </Button>

        {evidenceBundle ? (
          <div className="space-y-2">
            <Text size="xs" color="tertiary">
              Generated {new Date(evidenceBundle.generatedAt).toLocaleString()}
            </Text>
            <div className="flex flex-wrap gap-3">
              {pdfLoading ? (
                <Text size="sm" color="tertiary">
                  Resolving PDF link…
                </Text>
              ) : pdfUrl ? (
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-body-sm font-medium text-text-primary hover:underline">
                  Download PDF
                </a>
              ) : (
                <Text size="sm" color="tertiary">
                  PDF link unavailable
                </Text>
              )}
              {zipLoading ? (
                <Text size="sm" color="tertiary">
                  Resolving ZIP link…
                </Text>
              ) : zipUrl ? (
                <a href={zipUrl} target="_blank" rel="noreferrer" className="text-body-sm font-medium text-text-primary hover:underline">
                  Download originals (.zip)
                </a>
              ) : (
                <Text size="sm" color="tertiary">
                  ZIP link unavailable
                </Text>
              )}
            </div>
            <Text size="xs" color="tertiary" className="font-mono break-all">
              SHA-256: {evidenceBundle.sha256}
            </Text>
          </div>
        ) : (
          <Text size="sm" color="tertiary">
            No bundle generated yet.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
