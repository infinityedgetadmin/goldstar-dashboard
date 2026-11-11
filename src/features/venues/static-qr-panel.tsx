'use client';
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import type { Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface StaticQrPanelProps {
  operatorId: string;
  venue: Venue;
  operatorName?: string;
}

/**
 * `StaticQrPanel`: toggles `venue.qr.staticCheckoutEnabled` directly (its own `updateDoc` — NOT
 * routed through `VenueForm`'s save, which deliberately excludes `qr` from its payload; see that
 * file's header comment) and shows the `/pay/{token}` QR once eligible.
 *
 * Enabling is only OFFERED when `venue.rates.valet.model === 'flat'` — this mirrors
 * `onVenueWritten`'s Ruling M exactly (`goldstar-platform/functions/src/modules/venues/venue.handler.ts`):
 * the trigger only ever writes the `venuePublic/{token}` projection for a flat-rate venue, and
 * `guestStaticCheckout` throws `failed_precondition` for anything else — so an operator flipping this
 * on for a non-flat venue would produce a QR code that leads to a visibly broken guest page. The
 * toggle itself still writes `staticCheckoutEnabled: true` faithfully if somehow forced past the
 * disabled control (defense in depth only; the UI never offers that path) — the SERVER-side
 * trigger is what actually withholds the projection, not this panel.
 */
export function StaticQrPanel({ operatorId, venue, operatorName }: StaticQrPanelProps) {
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const flatRate = venue.rates.valet.model === 'flat';
  const enabled = venue.qr.staticCheckoutEnabled;
  const token = venue.qr.staticCheckoutToken;
  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/pay/${token}` : undefined;

  const handleToggle = async (checked: boolean) => {
    setSaving(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/venues/${venue.id}`), { 'qr.staticCheckoutEnabled': checked, updatedAt: new Date().toISOString() });
      toast.success(checked ? 'Static checkout enabled.' : 'Static checkout disabled.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!url) return;
    setPrinting(true);
    try {
      const [{ StaticCheckoutSign, pdf }, { toDataURL }] = await Promise.all([import('./key-tags-pdf'), import('qrcode')]);
      const qrDataUrl = await toDataURL(url, { width: 400, margin: 1 });
      const blob = await pdf(<StaticCheckoutSign venueName={venue.brandingOverride?.displayName ?? venue.name} operatorName={operatorName} qrDataUrl={qrDataUrl} url={url} />).toBlob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `pay-sign-${venue.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      toast.error(e);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Static checkout QR</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!flatRate && (
          <Text size="sm" color="tertiary">
            Static checkout requires flat-rate valet pricing. Switch this venue&rsquo;s pricing model to Flat rate under Rates to enable it.
          </Text>
        )}
        <div className="flex items-center gap-3">
          <Checkbox
            id="static-checkout-enabled"
            checked={enabled}
            disabled={!flatRate || saving}
            onCheckedChange={(checked) => handleToggle(checked === true)}
            aria-label="Enable static checkout"
          />
          <label htmlFor="static-checkout-enabled" className="cursor-pointer text-body-sm text-text-primary">
            Enable static checkout QR
          </label>
        </div>

        {enabled && flatRate && url && (
          <div className="space-y-3 rounded-lg border border-border bg-bg-secondary p-4">
            <Text size="sm" weight="medium">
              {url}
            </Text>
            <Text size="xs" color="tertiary">
              Any guest who scans this QR pays for valet on the spot — no ticket lookup needed.
            </Text>
            <Button variant="secondary" size="sm" loading={printing} onClick={handlePrint}>
              Print sign (PDF)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
