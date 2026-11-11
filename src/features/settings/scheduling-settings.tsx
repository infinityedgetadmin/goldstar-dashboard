'use client';
import { useState } from 'react';
import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { INTEGRATION_MANIFEST, SCHEDULING_PROVIDERS, type Operator } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useDoc } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { SchemaForm } from '@/components/forms/schema-form';
import { SecretsCard } from './secrets-card';

export interface SchedulingSettingsProps {
  operatorId: string;
  operator: Operator;
}

type SchedulingProvider = (typeof SCHEDULING_PROVIDERS)[number];

const SCHEDULING_MANIFEST = INTEGRATION_MANIFEST.filter((m) => m.module === 'scheduling');

interface IntegrationDoc {
  lastSyncAt?: string;
  health?: { ok: boolean; message?: string; errors?: string[] };
  lastError?: string;
}

export function SchedulingSettings({ operatorId, operator }: SchedulingSettingsProps) {
  const currentProvider = operator.modules.scheduling.provider;
  const [provider, setProvider] = useState<SchedulingProvider>(currentProvider);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>(operator.modules.scheduling.config ?? {});
  const [configValid, setConfigValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const manifestEntry = SCHEDULING_MANIFEST.find((m) => m.id === provider);
  const { data: integration } = useDoc<IntegrationDoc>(
    provider !== 'internal' ? `operators/${operatorId}/integrations/${provider}` : undefined,
  );

  const handleProviderChange = (next: string) => {
    const nextProvider = next as SchedulingProvider;
    setProvider(nextProvider);
    setConfigValues(nextProvider === currentProvider ? (operator.modules.scheduling.config ?? {}) : {});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}`), {
        'modules.scheduling.provider': provider,
        'modules.scheduling.config': configValues,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Scheduling settings saved.');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await callable('schedulingSyncNow')({});
      toast.success(`Synced — ${res.upserted} shift(s) updated${res.errors.length ? `, ${res.errors.length} error(s)` : ''}.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          label="Scheduling provider"
          fullWidth
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          options={SCHEDULING_MANIFEST.map((m) => ({ value: m.id, label: m.label }))}
        />

        {/* `configSchema` is typed `z.ZodTypeAny` on the manifest entry (every actual scheduling
            entry today happens to be a `z.object(...)`, but the type doesn't guarantee it) — checked
            at runtime with `instanceof z.ZodObject` rather than cast, so a hypothetical future
            non-object configSchema degrades to "no config form" instead of a runtime crash. */}
        {manifestEntry && manifestEntry.configSchema instanceof z.ZodObject && (
          <SchemaForm
            key={provider}
            schema={manifestEntry.configSchema}
            defaultValues={provider === currentProvider ? operator.modules.scheduling.config : {}}
            exclude={manifestEntry.secretFields}
            onChange={(values, valid) => {
              setConfigValues(values);
              setConfigValid(valid);
            }}
            idPrefix={`scheduling-${provider}`}
          />
        )}

        <div className="space-y-2">
          {!configValid && (
            <Text size="xs" color="error">
              Fix the highlighted fields above before saving.
            </Text>
          )}
          <Button type="button" onClick={handleSave} loading={saving} disabled={!configValid}>
            Save
          </Button>
        </div>

        {manifestEntry && manifestEntry.secretFields.length > 0 && <SecretsCard provider={provider} secretFields={manifestEntry.secretFields} />}

        {provider !== 'internal' && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Text size="sm" weight="medium">
                Sync status
              </Text>
              {integration?.health && (
                <StatusPill label={integration.health.ok ? 'Healthy' : 'Error'} tone={integration.health.ok ? 'positive' : 'negative'} />
              )}
            </div>
            <Text size="xs" color="tertiary">
              {integration?.lastSyncAt ? `Last synced ${formatDateTime(integration.lastSyncAt)}` : 'Never synced'}
            </Text>
            <Button type="button" variant="secondary" size="sm" onClick={handleSync} loading={syncing}>
              Sync now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
