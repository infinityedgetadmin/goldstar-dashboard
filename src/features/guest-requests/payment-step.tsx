'use client';

import { Elements } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { formatMoney } from '@/lib/public/format';
import { Text } from '@/components/ui/typography';
import { StripeForm } from '@/features/guest-pay/stripe-form';

export interface PaymentStepProps {
  clientSecret: string;
  total: number;
  currency: string;
  stripe: Promise<Stripe | null>;
  primaryColor: string;
}

/**
 * Shared authorization step for both request sheets — same Payment Element
 * pattern as `guest-pay/pay-sheet.tsx`'s post-checkout view (reuses its
 * `StripeForm` directly), but for a job's pre-authorization rather than a
 * settled charge: `guestConfirmDriveHome`/`guestConfirmRide` create a
 * `capture: manual`-style PaymentIntent server-side (Plan 5 scope) that's
 * only captured once the trip completes, hence the copy below rather than
 * PaySheet's "Pay & tip" framing.
 */
export function PaymentStep({ clientSecret, total, currency, stripe, primaryColor }: PaymentStepProps) {
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <Text weight="semibold">Total</Text>
        <Text weight="semibold">{formatMoney(total, currency)}</Text>
      </div>
      <Text size="sm" color="secondary" className="mb-3">
        Your card is authorized now and charged when the trip completes.
      </Text>
      <Elements
        stripe={stripe}
        options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: { colorPrimary: primaryColor, fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '12px' },
          },
        }}
      >
        <StripeForm amountLabel={formatMoney(total, currency)} />
      </Elements>
    </div>
  );
}
