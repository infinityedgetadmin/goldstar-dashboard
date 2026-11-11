'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { useStoragePhotoUrl } from '@/features/tickets/use-storage-photo-url';

function IncidentPhoto({ storagePath }: { storagePath: string }) {
  const { url, loading } = useStoragePhotoUrl(storagePath);
  return (
    <div className="bg-bg-secondary aspect-square w-full overflow-hidden rounded-lg">
      {loading ? null : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storage-hosted, dynamic per-photo URL, same as photo-gallery.tsx's precedent
        <img src={url} alt="Incident photo" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Text size="xs" color="tertiary">
            No preview
          </Text>
        </div>
      )}
    </div>
  );
}

export interface IncidentPhotosProps {
  photos: string[];
}

/**
 * Incident photo grid (Task 6 brief: "detail view with photos via signed URLs") — reuses
 * `tickets/use-storage-photo-url.ts` verbatim per the brief's explicit instruction, one hook call
 * per photo path (the incident schema's `photos: string[]` holds bare Storage paths directly,
 * unlike `tickets/photo-gallery.tsx`'s richer `TicketPhoto` metadata — no timestamp/GPS/sha256 to
 * show here, just the image).
 */
export function IncidentPhotos({ photos }: IncidentPhotosProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <EmptyState title="No photos" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((path) => (
              <IncidentPhoto key={path} storagePath={path} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
