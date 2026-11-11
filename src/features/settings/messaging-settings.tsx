'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { INTEGRATION_MANIFEST, type Operator } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { SecretsCard } from './secrets-card';

export interface MessagingSettingsProps {
  operatorId: string;
  operator: Operator;
}

// N4 (final-review.md): no `.min(1)` — an empty submission is a deliberate "clear/disconnect"
// action (see onSubmit below), not an invalid one.
const messagingFormSchema = z.object({ messagingServiceSid: z.string() });
type MessagingFormValues = z.infer<typeof messagingFormSchema>;

const TWILIO_MANIFEST = INTEGRATION_MANIFEST.find((m) => m.id === 'twilio');

export function MessagingSettings({ operatorId, operator }: MessagingSettingsProps) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<MessagingFormValues>({
    resolver: zodResolver(messagingFormSchema),
    defaultValues: { messagingServiceSid: operator.modules.messaging.messagingServiceSid ?? '' },
  });

  const onSubmit = async (values: MessagingFormValues) => {
    const trimmed = values.messagingServiceSid.trim();
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}`), {
        // N4 (final-review.md): an empty field CLEARS the SID via `deleteField()`, not by writing
        // `''` — consumers (first-run-checklist.tsx's `messagingSet` check, integration-status
        // reads) treat presence/absence as the source of truth, and `Boolean('')` is already falsy
        // there today, but an omitted key is the unambiguous "never configured" representation an
        // empty string is only an accidental cousin of. Safe unconditionally — deleteField() on an
        // already-absent field is a no-op.
        'modules.messaging.messagingServiceSid': trimmed ? trimmed : deleteField(),
        updatedAt: new Date().toISOString(),
      });
      toast.success(trimmed ? 'Messaging settings saved.' : 'Messaging service disconnected.');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            label="Messaging service SID"
            fullWidth
            helperText="From the Twilio console."
            error={errors.messagingServiceSid?.message}
            {...register('messagingServiceSid')}
          />
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save
          </Button>
        </form>

        <SecretsCard provider="twilio" secretFields={TWILIO_MANIFEST?.secretFields ?? []} />
      </CardContent>
    </Card>
  );
}
