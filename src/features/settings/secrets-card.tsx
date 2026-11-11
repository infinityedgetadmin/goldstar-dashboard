'use client';
import { useForm } from 'react-hook-form';
import type { IntegrationId } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface SecretsCardProps {
  provider: IntegrationId;
  /** A manifest entry's `secretFields` — the raw field names Secret Manager stores under this provider. */
  secretFields: readonly string[];
  /**
   * Task 8/9 (task-89-report.md): venue-scoped providers (`opera_cloud`, `toast` — manifest
   * `scope: 'venue'`) need their secrets stored per-venue, not per-operator. Passed straight through
   * to `integrationsSetSecret`, which now (this task) composes the secret id / integration doc id as
   * `{provider}_{venueId}` when present — see that callable's own comment for why the composite id
   * is safe (firestore.rules' `integrations/{provider}` match is a bare wildcard, already proven to
   * cover arbitrary id shapes by `test/rules/22-functions-only.test.ts` and, for this exact shape,
   * `test/rules/50-task8-venue-integrations.test.ts`, both in `goldstar-platform`). Omitted entirely
   * for operator-scoped providers — unchanged from before this task.
   */
  venueId?: string;
}

/** `apiKey` -> "Api key", `clientSecret` -> "Client secret" — readable label from a manifest field name. */
function labelFor(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Shared "Secrets" card for any provider integration — renders one password input per
 * manifest `secretFields` entry and saves whichever fields were actually filled in via the
 * `integrationsSetSecret` callable (never all of them unconditionally, so rotating just one
 * credential doesn't require re-entering the others). Used by both `messaging-settings.tsx`
 * (twilio) and `scheduling-settings.tsx` (when_i_work) rather than duplicating this pattern
 * per provider.
 *
 * Known gap, disclosed in task-4-report.md: `integrationSchema.secretRef` (the installed
 * `@goldstar/platform` contract) is a single string per provider integration doc, but a
 * provider can have multiple `secretFields` (twilio: accountSid + authToken). Each field's
 * secret VALUE is stored safely and independently in Secret Manager under its own id
 * (`operators-{op}-{provider}-{name}`) — nothing is lost — but the doc's `secretRef` pointer
 * only ever reflects whichever field's `integrationsSetSecret` call completed last. Fixing
 * this needs a contracts change (`secretRef` -> a map keyed by field name), which is outside
 * this task's pinned-contracts scope.
 *
 * Fix round 1 (Minor M2, task-4-review.md): per-field save results, not a bare `Promise.all`.
 * Each field's `integrationsSetSecret` write is independently atomic server-side — with
 * `Promise.all`, one field's rejection lost the OTHER field's already-succeeded write from the
 * operator's view entirely (a single generic error toast, no `reset()`, so a successfully-saved
 * value sat unexplained in its input). `Promise.allSettled` reports each field's outcome: a
 * failure toast per field naming which credential failed (label only, never the value — the
 * failure toast's `context` is always `labelFor(name)`, never anything error-derived), a success
 * toast reflecting exactly how many of the attempted fields actually saved, and only the fields
 * that DID save are cleared — a failed field's typed value stays so it doesn't need retyping.
 */
export function SecretsCard({ provider, secretFields, venueId }: SecretsCardProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(secretFields.map((f) => [f, ''])),
  });

  if (secretFields.length === 0) return null;

  const onSubmit = async (values: Record<string, string>) => {
    const entries = Object.entries(values).filter(([, v]) => v.trim().length > 0);
    if (entries.length === 0) return;

    const outcomes = await Promise.allSettled(
      entries.map(([name, value]) =>
        callable('integrationsSetSecret')({ provider, name, value, ...(venueId ? { venueId } : {}) }).then(() => name),
      ),
    );

    const succeeded = new Set<string>();
    const failures: { name: string; error: unknown }[] = [];
    outcomes.forEach((outcome, i) => {
      const [name] = entries[i]!;
      if (outcome.status === 'fulfilled') succeeded.add(name);
      else failures.push({ name, error: outcome.reason });
    });

    failures.forEach(({ name, error }) => toast.error(error, labelFor(name)));

    if (succeeded.size > 0) {
      toast.success(
        failures.length > 0 ? `Saved ${succeeded.size} of ${entries.length} secret(s).` : 'Secrets saved.',
      );
      // Clear only the fields that actually saved — a failed field keeps its typed value.
      reset({ ...values, ...Object.fromEntries([...succeeded].map((name) => [name, ''])) });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 border-t border-border pt-4">
      <Text size="sm" weight="medium">
        Secrets
      </Text>
      {secretFields.map((field) => (
        <Input key={field} label={labelFor(field)} type="password" fullWidth autoComplete="off" {...register(field)} />
      ))}
      <Button type="submit" size="sm" variant="secondary" loading={isSubmitting}>
        Save secrets
      </Button>
    </form>
  );
}
