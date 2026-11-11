'use client';
import { useMemo, type CSSProperties } from 'react';
import { cssVariables, operatorTheme } from '@goldstar/platform/tokens';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Heading, Text } from '@/components/ui/typography';
import { LivePreviewPanel } from '@/features/platform/steps/branding';

export interface LivePreviewProps {
  displayName: string;
  primaryColor: string;
  accentColor: string;
}

/**
 * Branding settings' live preview — sidebar + ticket card (reused directly from
 * `features/platform/steps/branding.tsx`'s `LivePreviewPanel`, the onboarding wizard's
 * own preview, rather than re-implementing that mockup a second time — DRY per this
 * workspace's rules) plus two sections that panel doesn't cover: a themed buttons row
 * and a guest-page header sample, both named explicitly in this task's brief ("sidebar,
 * buttons, ticket card, guest page header").
 */
export function LivePreview({ displayName, primaryColor, accentColor }: LivePreviewProps) {
  const vars = useMemo(() => cssVariables(operatorTheme({ primaryColor, accentColor })), [primaryColor, accentColor]);

  return (
    <div className="space-y-4">
      <LivePreviewPanel displayName={displayName} primaryColor={primaryColor} accentColor={accentColor} />

      <div style={vars as CSSProperties} aria-hidden>
        <Card padding="sm">
          <CardHeader>
            <CardTitle as="h4">Buttons</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm">
              Primary action
            </Button>
            <Button variant="secondary" size="sm">
              Secondary action
            </Button>
          </CardContent>
        </Card>
      </div>

      <div style={vars as CSSProperties} aria-hidden>
        <Card padding="sm">
          <CardHeader>
            <CardTitle as="h4">Guest page header</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mirrors `guest-ticket/brand-header.tsx`'s real layout (centered logo + display-font
                name + venue line) without reusing it directly — that component takes a resolved
                `GuestTicket['branding'].logoUrl` and a venue name, neither of which a branding
                settings preview has on hand. */}
            <header className="flex flex-col items-center gap-2 rounded-lg bg-bg-secondary py-4 text-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-500 font-display text-heading-sm font-semibold text-white">
                {(displayName || 'GV').slice(0, 2).toUpperCase()}
              </div>
              <Heading level={1} variant="heading-md" font="display">
                {displayName || 'Goldstar Valet'}
              </Heading>
              <Text size="sm" color="secondary">
                St. Elmo Steak House
              </Text>
            </header>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
