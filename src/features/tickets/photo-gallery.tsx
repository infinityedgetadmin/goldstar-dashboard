'use client';
import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/lib/toast';
import { useStoragePhotoUrl } from './use-storage-photo-url';
import type { TicketPhoto } from './use-ticket-photos';

const PHASE_LABEL: Record<TicketPhoto['reportPhase'], string> = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  pre_drive: 'Pre-drive',
  post_drive: 'Post-drive',
  incident: 'Incident',
};

function mapThumbnailUrl(lat: number, lng: number): string | undefined {
  const token = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  if (!token) return undefined;
  // Static Images API — a plain <img> src, no mapboxgl JS bundle involved ("keep it light" per the
  // brief), matching live-board.tsx's own graceful degrade-without-a-token pattern.
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ab6034(${lng},${lat})/${lng},${lat},13,0/160x100@2x?access_token=${token}`;
}

function PhotoCard({ photo, timezone }: { photo: TicketPhoto; timezone: string }) {
  const { url, loading } = useStoragePhotoUrl(photo.storagePath);
  const [copied, setCopied] = useState(false);

  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(photo.sha256);
      setCopied(true);
      toast.success('SHA-256 copied');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error(e);
    }
  };

  const map = photo.geo ? mapThumbnailUrl(photo.geo.lat, photo.geo.lng) : undefined;

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="bg-bg-secondary aspect-square w-full">
        {loading ? null : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage-hosted, dynamic per-photo URL; next/image's domain allowlist isn't worth configuring for this
          <img src={url} alt={`${photo.panel ?? photo.stage} photo`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Text size="xs" color="tertiary">
              No preview
            </Text>
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <Text size="xs" weight="medium">
          {PHASE_LABEL[photo.reportPhase]} · {photo.panel ? photo.panel.replace(/_/g, ' ') : photo.stage}
        </Text>
        <Text size="xs" color="tertiary">
          {formatInTimeZone(new Date(photo.at), timezone, 'MMM d, h:mm:ss a')}
        </Text>
        {map ? (
          // eslint-disable-next-line @next/next/no-img-element -- external static-map thumbnail, not a local asset
          <img src={map} alt="Photo location" className="h-20 w-full rounded object-cover" />
        ) : photo.geo ? (
          <Text size="xs" color="tertiary">
            {photo.geo.lat.toFixed(4)}, {photo.geo.lng.toFixed(4)}
          </Text>
        ) : null}
        <button
          type="button"
          onClick={copySha}
          className="text-text-tertiary hover:text-text-secondary flex min-h-11 items-center gap-1 text-ui-xs"
          aria-label="Copy SHA-256 hash"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          <span className="truncate font-mono">{photo.sha256.slice(0, 12)}…</span>
        </button>
      </div>
    </div>
  );
}

export interface PhotoGalleryProps {
  photos: TicketPhoto[];
  timezone: string;
}

/** Photo gallery with per-photo metadata: timestamp, GPS map thumbnail, and a sha256 copy button —
 * per the brief. */
export function PhotoGallery({ photos, timezone }: PhotoGalleryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <EmptyState title="No photos yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <PhotoCard key={`${p.reportId}-${p.id}`} photo={p} timezone={timezone} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
