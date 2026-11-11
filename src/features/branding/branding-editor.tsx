'use client';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { hexColorSchema } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useSession } from '@/features/auth/use-session';
import { toast } from '@/lib/toast';
import { contrastRatio } from '@/lib/color';
import { Input } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { LogoUpload } from './logo-upload';
import { LivePreview } from './live-preview';

const brandingFormSchema = z.object({
  displayName: z.string().min(1).max(60),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
});
type BrandingFormValues = z.infer<typeof brandingFormSchema>;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** WCAG AA minimum contrast ratio for normal-size text. */
const MIN_CONTRAST = 4.5;

export function BrandingEditor() {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId ?? operator?.id ?? '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingFormSchema),
    defaultValues: {
      displayName: operator?.branding.displayName ?? '',
      primaryColor: operator?.branding.primaryColor ?? '#000000',
      accentColor: operator?.branding.accentColor ?? '#000000',
    },
  });

  const displayName = watch('displayName');
  const primaryColor = watch('primaryColor');
  const accentColor = watch('accentColor');

  // Warns if white button/nav text on this primary color would fail WCAG AA — the brief's
  // stated check ("warn if white-on-primary < 4.5:1"). `Button`'s primary variant and
  // `Sidebar`'s active-nav-row text are both white-on-`primary-500`, so this is the real pairing
  // an operator's chosen color needs to clear, not an arbitrary black/white default.
  const primaryContrast = useMemo(
    () => (HEX_RE.test(primaryColor) ? contrastRatio('#ffffff', primaryColor) : null),
    [primaryColor],
  );
  const lowContrast = primaryContrast !== null && primaryContrast < MIN_CONTRAST;

  const onSubmit = async (values: BrandingFormValues) => {
    if (!operatorId) return;
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}`), {
        'branding.displayName': values.displayName,
        'branding.primaryColor': values.primaryColor,
        'branding.accentColor': values.accentColor,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Branding saved.');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Input label="Display name" fullWidth {...register('displayName')} />

          <div className="space-y-1.5">
            <div className="flex items-end gap-3">
              <input
                type="color"
                aria-label="Pick primary color"
                value={HEX_RE.test(primaryColor) ? primaryColor : '#000000'}
                onChange={(e) => setValue('primaryColor', e.target.value, { shouldValidate: true, shouldDirty: true })}
                className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-border"
              />
              <Input label="Primary color" fullWidth wrapperClassName="flex-1" {...register('primaryColor')} />
            </div>
            {lowContrast && (
              <Text size="xs" color="error">
                Low contrast against white text ({primaryContrast?.toFixed(1)}:1) — aim for at least {MIN_CONTRAST}:1.
              </Text>
            )}
          </div>

          <div className="flex items-end gap-3">
            <input
              type="color"
              aria-label="Pick accent color"
              value={HEX_RE.test(accentColor) ? accentColor : '#000000'}
              onChange={(e) => setValue('accentColor', e.target.value, { shouldValidate: true, shouldDirty: true })}
              className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-border"
            />
            <Input label="Accent color" fullWidth wrapperClassName="flex-1" {...register('accentColor')} />
          </div>

          <div className="space-y-1.5">
            <Text size="sm" weight="medium" as="span" color="primary" className="block">
              Logos
            </Text>
            <div className="flex flex-wrap gap-4">
              <LogoUpload operatorId={operatorId} kind="light" currentPath={operator?.branding.logoLightPath} />
              <LogoUpload operatorId={operatorId} kind="dark" currentPath={operator?.branding.logoDarkPath} />
            </div>
          </div>

          <Button type="submit" loading={isSubmitting}>
            Save branding
          </Button>
        </div>

        <LivePreview displayName={displayName} primaryColor={primaryColor} accentColor={accentColor} />
      </div>
    </form>
  );
}
