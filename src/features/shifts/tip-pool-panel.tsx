import type { Shift } from '@goldstar/platform';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';

export interface TipPoolPanelProps {
  shift: Shift;
  staffByUid: Map<string, { displayName: string }>;
}

/** Renders `shift.tipPool` (Functions-only — written by the platform repo's `onShiftWritten` trigger
 * when the operator's `tipPolicy` is `'shift_pool'` and this shift closes). Nothing to render before
 * that happens — a shift that hasn't closed yet, or whose operator pays tips straight to the
 * deliverer, simply never gets a `tipPool` field. */
export function TipPoolPanel({ shift, staffByUid }: TipPoolPanelProps) {
  const pool = shift.tipPool;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tip pool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!pool ? (
          <Text size="sm" color="tertiary">
            {shift.status === 'closed' ? 'This shift does not pool tips.' : 'Tip pool allocations appear once this shift is closed.'}
          </Text>
        ) : (
          <>
            <Text size="sm" weight="medium">
              Total: {formatMoney(pool.total)}
            </Text>
            <ul className="space-y-1.5">
              {pool.allocations.map((a) => (
                <li key={a.uid} className="flex items-center justify-between gap-3 text-body-sm">
                  <span className="text-text-primary">{staffByUid.get(a.uid)?.displayName ?? a.uid}</span>
                  <span className="text-text-secondary">
                    {(pool.hoursByUid[a.uid] ?? 0).toFixed(2)}h · {formatMoney(a.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
