'use client';
import type { Venue } from '@goldstar/platform';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

type VenueSms = Venue['sms'];

export interface SmsTemplatesEditorProps {
  value: VenueSms;
  onChange: (next: VenueSms) => void;
  /** RHF's real `errors.sms` for this field, keyed the same as `VenueSms` — threaded down from
   * `VenueForm` (task-5-review.md N3) so a `.max(320)` violation shows the SAME authoritative error
   * this field's own local `overLimit` character-count check already signals, instead of only the
   * generic "Fix the highlighted fields before saving." banner at the bottom of the form. */
  errors?: Partial<Record<keyof VenueSms, { message?: string }>>;
}

const TOKENS = ['venue', 'link', 'operator', 'eta'] as const;

const PREVIEW_VARS: Record<(typeof TOKENS)[number], string> = {
  venue: 'St. Elmo',
  link: 'https://app.goldstar.example.com/t/AbCdEfGhIjKlMnOpQrStUv',
  operator: 'Goldstar',
  eta: '6 minutes',
};

/**
 * Platform default template text (mirrors `goldstar-platform`'s
 * `functions/src/modules/messaging/templates.ts` `DEFAULTS` map verbatim). That file lives in
 * `functions/`, not the `@goldstar/platform` contracts package this dashboard depends on, so there
 * is no shared export to import here — this is a deliberate, disclosed duplication (task-5-report.md),
 * same shape as `src/lib/error-copy.ts`'s own header comment about the guest/dashboard error-copy
 * split, just across repos instead of within one. Keep in sync by hand; a future task should promote
 * these into the contracts package so both sides read one source.
 */
const PLATFORM_DEFAULTS: Record<keyof VenueSms, string> = {
  welcome: '{{operator}} at {{venue}}: your car is checked in. Tap to request it, pay, or tip: {{link}} Reply STOP to opt out.',
  ready: 'Your car is ready at the {{venue}} valet stand. {{link}}',
  survey: 'Thanks for visiting {{venue}}. How did we do? {{link}}#survey',
  driveHomeAssigned: 'Your {{operator}} driver is on the way. Track here: {{link}}',
  rideAssigned: 'Your ride is on the way. Track here: {{link}}',
};

const FIELD_LABELS: Record<keyof VenueSms, string> = {
  welcome: 'Welcome (guest checked in)',
  ready: 'Ready for pickup',
  survey: 'Post-visit survey',
  driveHomeAssigned: 'Drive-home driver assigned',
  rideAssigned: 'Ride driver assigned',
};

/**
 * Mirrors `renderTemplate`'s substitution rule exactly (same `/\{\{(\w+)\}\}/g` pattern, same
 * "unknown token -> empty string" behavior) so this preview never shows an operator a result the
 * real SMS sender wouldn't actually produce.
 *
 * `{{eta}}` is offered as a token chip per the task brief, but disclosed here as a real product gap
 * (task-5-report.md): no `enqueueSms` call site in `ticket.handler.ts` currently passes an `eta`
 * var (`driveHomeAssigned`/`rideAssigned` are both enqueued with only `{ venue, link }`) — an
 * operator who uses `{{eta}}` in a custom template will see it render blank in the real SMS today,
 * even though this preview shows a sample value so the token's PURPOSE is legible while editing.
 */
function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '').slice(0, 320);
}

function TokenChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert token">
      {TOKENS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onInsert(`{{${t}}}`)}
          className="min-h-11 rounded-full border border-border bg-bg-secondary px-3 text-body-xs font-medium text-text-secondary hover:bg-bg-tertiary"
        >
          {`{{${t}}}`}
        </button>
      ))}
    </div>
  );
}

/**
 * `SmsTemplatesEditor` = `venueSchema.sms` (5 optional per-event overrides, each `.max(320)`). An
 * empty field means "use the platform default" — shown as the field's placeholder text so an
 * operator sees exactly what will actually go out before typing a single character of override.
 */
export function SmsTemplatesEditor({ value, onChange, errors }: SmsTemplatesEditorProps) {
  const fields = Object.keys(PLATFORM_DEFAULTS) as (keyof VenueSms)[];

  const setField = (key: keyof VenueSms, text: string) => onChange({ ...value, [key]: text === '' ? undefined : text });
  const insert = (key: keyof VenueSms, token: string) => setField(key, `${value[key] ?? ''}${token}`);

  return (
    <div className="space-y-6">
      {fields.map((key) => {
        const current = value[key] ?? '';
        const previewSource = current || PLATFORM_DEFAULTS[key];
        const length = current.length;
        const overLimit = length > 320;
        // Local `overLimit` fires live, on every keystroke, before any submit attempt (RHF only
        // validates on submit — mode: 'onSubmit', no per-keystroke resolver run); `errors?.[key]` is
        // RHF's own post-submit-attempt validation state for this exact field, threaded down from
        // `VenueForm`. Either one showing the same message keeps them from ever visibly disagreeing.
        const fieldError = overLimit ? 'SMS templates must be 320 characters or fewer.' : errors?.[key]?.message;
        return (
          <div key={key} className="space-y-2">
            <Textarea
              id={`sms-${key}`}
              label={FIELD_LABELS[key]}
              fullWidth
              rows={2}
              placeholder={PLATFORM_DEFAULTS[key]}
              value={current}
              onChange={(e) => setField(key, e.target.value)}
              helperText={current === '' ? 'Using the platform default shown above.' : undefined}
              error={fieldError}
            />
            <div className="flex items-center justify-between gap-3">
              <TokenChips onInsert={(t) => insert(key, t)} />
              <Text size="xs" color={overLimit ? 'error' : 'tertiary'} className={cn('shrink-0 tabular-nums')}>
                {length} / 320
              </Text>
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary p-3">
              <Text size="xs" color="tertiary" className="mb-1 font-medium uppercase tracking-wide">
                Preview
              </Text>
              <Text size="sm">{renderPreview(previewSource, PREVIEW_VARS)}</Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}
