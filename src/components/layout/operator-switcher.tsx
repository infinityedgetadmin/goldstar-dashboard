'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { toast } from '@/lib/toast';

/**
 * Minimal "assume operator" control for platform admins (spec §5).
 * Renders nothing for non-platform-admins. Takes an operator ID directly
 * rather than a searchable picker — the Operators list page (a later
 * task's scope; no `operators` listing UI exists yet) is where a proper
 * picker belongs. This is enough to exercise `assumeOperator` end to end
 * in the meantime.
 */
export function OperatorSwitcher() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [operatorId, setOperatorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!session.isPlatformAdmin) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const id = operatorId.trim();
    if (!id) return;
    setSubmitting(true);
    try {
      await session.assumeOperator(id);
      setOpen(false);
      setOperatorId('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<ArrowRightLeft className="h-4 w-4" />}
        iconPosition="left"
      >
        {session.assumedOperatorId ? 'Switch operator' : 'Assume operator'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader className="pr-12">
            <DialogTitle>Assume an operator</DialogTitle>
            <DialogDescription>
              Sign in as this operator to view and manage their dashboard. You can leave at any time from the banner
              at the top of the screen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Operator ID"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              required
              fullWidth
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting} disabled={!operatorId.trim()}>
                Assume
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
