'use client';
import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import type { User } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useDoc } from '@/lib/firebase/hooks';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface NotificationPrefsFormProps {
  operatorId: string;
  uid: string;
}

type NotificationPrefs = NonNullable<User['notificationPrefs']>;

const DEFAULT_PREFS: NotificationPrefs = { emailClaims: true, emailCredentials: true, pushRequests: true };

const FIELDS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'emailClaims', label: 'Damage claim updates', description: 'Email when a claim you’re on is created or updated.' },
  { key: 'emailCredentials', label: 'Credential expirations', description: 'Email when one of your documents is expiring or was adjudicated.' },
  { key: 'pushRequests', label: 'Ride/vehicle requests', description: 'Push notification for new drive-home or passenger-ride requests.' },
];

/**
 * Task 8 (task-89-report.md): self-service notification preferences, `users/{uid}.notificationPrefs`
 * — an already-shipped field (`userSchema`, `goldstar-platform`'s v0.3.8 `src/schemas/user.ts`) and
 * already self-writable (`firestore.rules:228`'s `onlyChanged([..., 'notificationPrefs'])` branch,
 * gated only on `inOperator(op) && request.auth.uid == uid`) — no contracts/rules gap here, unlike
 * some of this task's other surfaces. A direct `updateDoc` (no callable) is correct and sufficient,
 * matching every other self-service field this app already writes this way (`avatarPath`/`phone` on
 * a staff profile — same rules branch).
 *
 * Whether these prefs are actually CONSUMED yet (an email/push send site reading
 * `notificationPrefs.X` before sending) is out of this form's scope to verify — it only has to write
 * a field the schema and rules already define; wiring senders to respect it, if they don't already,
 * is a separate concern.
 */
export function NotificationPrefsForm({ operatorId, uid }: NotificationPrefsFormProps) {
  const { data: user, loading } = useDoc<User>(`operators/${operatorId}/users/${uid}`);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user?.notificationPrefs) {
      setPrefs(user.notificationPrefs);
      setDirty(false);
    }
  }, [user]);

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/users/${uid}`), { notificationPrefs: prefs });
      toast.success('Notification preferences saved.');
      setDirty(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {FIELDS.map(({ key, label, description }) => (
          <div key={key} className="flex items-start gap-3">
            <Checkbox
              id={`notif-${key}`}
              checked={prefs[key]}
              onCheckedChange={() => toggle(key)}
              aria-label={label}
              className="mt-0.5"
            />
            <label htmlFor={`notif-${key}`} className="cursor-pointer space-y-0.5">
              <Text size="sm" weight="medium" as="span" className="block">
                {label}
              </Text>
              <Text size="xs" color="tertiary" as="span" className="block">
                {description}
              </Text>
            </label>
          </div>
        ))}
        <Button type="button" onClick={onSave} loading={saving} disabled={!dirty}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
