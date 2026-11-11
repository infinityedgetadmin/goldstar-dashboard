import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';

// Re-exported so `pdf(<KeyTagSheet .../>).toBlob()` (StaticQrPanel/KeyTagsPanel) never needs a
// second, separate `import('@react-pdf/renderer')` of its own — one dynamic import of this module
// is the whole story for both files.
export { pdf };

/**
 * This module is the one place `@react-pdf/renderer` is imported anywhere in `src/features/venues/`
 * — both it and `qrcode` (used by `key-tags-panel.tsx`/`static-qr-panel.tsx` to produce the
 * `qrDataUrl` values `KeyTagSheet` renders) are heavy and MUST NEVER be a static import from a page
 * module. Callers dynamic-`import('./key-tags-pdf')` on demand (the "Print key tags" / "Print sign"
 * action), which keeps both out of the operator dashboard's page-level bundle and, since
 * `src/features/venues/**` has no importer anywhere under `src/app/(public)/**`, out of the guest
 * bundle `check:guest-bundle` gates entirely regardless (same route-group code-splitting reasoning
 * as `use-collection-exists.ts`'s header comment).
 */

export interface KeyTagLike {
  id: string;
  value: string;
}

export interface KeyTagLabel extends KeyTagLike {
  venueName: string;
}

export interface KeyTagLabelWithQr extends KeyTagLabel {
  /** A `data:image/...;base64,...` URI from `qrcode`'s `toDataURL(value)` — precomputed by the
   * caller (async) before this synchronous PDF tree is built; `@react-pdf/renderer`'s `<Image>`
   * accepts a data URI src directly. */
  qrDataUrl: string;
}

const LABELS_PER_PAGE = 24; // 3 columns x 8 rows on a US Letter sheet — the physical stock this prints to.

/**
 * Pure layout function: chunks a flat list of key tags into print pages of `LABELS_PER_PAGE`
 * (3x8 = 24) each, and stamps each label with the venue name it belongs to (so `KeyTagSheet` below
 * can render a self-contained label with no extra prop threading per cell). No PDF/QR dependency —
 * this is the one piece of this file exercised directly by `__tests__/key-tags-pdf.test.tsx`
 * without going through the heavy render path.
 */
export function labelsForBatch(tags: KeyTagLike[], opts: { venueName: string }): KeyTagLabel[][] {
  const pages: KeyTagLabel[][] = [];
  for (let i = 0; i < tags.length; i += LABELS_PER_PAGE) {
    pages.push(tags.slice(i, i + LABELS_PER_PAGE).map((t) => ({ ...t, venueName: opts.venueName })));
  }
  return pages;
}

const styles = StyleSheet.create({
  page: { padding: 18, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  cell: {
    width: '33.33%',
    height: '12.5%',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#cccccc',
    borderStyle: 'dashed',
  },
  qr: { width: 46, height: 46, marginBottom: 3 },
  value: { fontSize: 9, fontWeight: 700, textAlign: 'center' },
  venue: { fontSize: 7, color: '#555555', textAlign: 'center' },
  operator: { fontSize: 6, color: '#888888', textAlign: 'center', marginTop: 1 },
});

export interface KeyTagSheetProps {
  pages: KeyTagLabelWithQr[][];
  /** Operator name/branding printed small under each label — optional, matches the task brief's
   * "each QR = tag value + venue name + operator logo" (logo omitted: `@react-pdf/renderer`'s
   * `<Image>` needs a resolvable URL/data URI, and the operator's logo lives behind a Storage path
   * — `operatorBrandingSchema.logoLightPath` — not a public URL; resolving one is out of this
   * component's scope, disclosed as a deviation in task-5-report.md). */
  operatorName?: string;
}

/** 3x8-per-Letter-page key tag sheet: one QR + tag value + venue name (+ operator name) per cell. */
export function KeyTagSheet({ pages, operatorName }: KeyTagSheetProps) {
  return (
    <Document>
      {pages.map((page, pageIndex) => (
        <Page key={pageIndex} size="LETTER" style={styles.page}>
          {page.map((label) => (
            <View key={label.id} style={styles.cell}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's PDF-tree
                  <Image>, not an HTML <img>; its ImageProps type has no `alt` (verified against
                  node_modules/@react-pdf/renderer's own .d.ts) — jsx-a11y's rule name-matches any
                  JSX element called "Image" with no awareness of which component it resolves to. */}
              <Image src={label.qrDataUrl} style={styles.qr} />
              <Text style={styles.value}>{label.value}</Text>
              <Text style={styles.venue}>{label.venueName}</Text>
              {operatorName ? <Text style={styles.operator}>{operatorName}</Text> : null}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}

const signStyles = StyleSheet.create({
  page: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  venue: { fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 8 },
  instruction: { fontSize: 16, color: '#555555', textAlign: 'center', marginBottom: 24 },
  qr: { width: 260, height: 260, marginBottom: 24 },
  url: { fontSize: 11, color: '#888888', textAlign: 'center' },
  operator: { fontSize: 10, color: '#aaaaaa', textAlign: 'center', marginTop: 24 },
});

export interface StaticCheckoutSignProps {
  venueName: string;
  operatorName?: string;
  /** `data:image/...;base64,...` for the guest-facing `/pay/{token}` URL — same precomputed-QR
   * convention as `KeyTagSheet`. */
  qrDataUrl: string;
  url: string;
}

/** One-page printable sign for a venue's static checkout QR (`StaticQrPanel`) — large format, meant
 * for a valet stand rather than a small key-tag label. */
export function StaticCheckoutSign({ venueName, operatorName, qrDataUrl, url }: StaticCheckoutSignProps) {
  return (
    <Document>
      <Page size="LETTER" style={signStyles.page}>
        <Text style={signStyles.venue}>{venueName}</Text>
        <Text style={signStyles.instruction}>Scan to pay for valet parking</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- see KeyTagSheet's identical comment above */}
        <Image src={qrDataUrl} style={signStyles.qr} />
        <Text style={signStyles.url}>{url}</Text>
        {operatorName ? <Text style={signStyles.operator}>{operatorName}</Text> : null}
      </Page>
    </Document>
  );
}
