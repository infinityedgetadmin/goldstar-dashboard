'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, ShieldCheck } from 'lucide-react';
import { firebase } from '@/lib/firebase/client';
import { useSession } from '@/features/auth/use-session';
import { EnrollTotpDialog } from '@/features/auth/mfa/enroll-totp-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';

export function UserMenu() {
  const session = useSession();
  const router = useRouter();
  const [mfaOpen, setMfaOpen] = useState(false);

  if (session.status !== 'signed_in') return null;

  const currentUser = firebase().auth.currentUser;

  const handleSignOut = async () => {
    try {
      await session.signOut();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="User menu"
          className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-text-secondary hover:bg-bg-secondary"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-ui-sm font-semibold text-primary-700">
            {(session.email ?? 'U').slice(0, 1).toUpperCase()}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="max-w-[220px] truncate">{session.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setMfaOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Two-factor authentication
          </DropdownMenuItem>
          {/* Task 8 (task-89-report.md): self-service `notificationPrefs` page has no natural spot
              in `nav.ts`'s operator sections (every existing entry is operator-wide, not personal) —
              the account dropdown is the right home, same reasoning as "Two-factor authentication"
              living here rather than in the sidebar. */}
          <DropdownMenuItem onSelect={() => router.push('/notifications')}>
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {currentUser && (
        <EnrollTotpDialog
          user={currentUser}
          open={mfaOpen}
          onOpenChange={setMfaOpen}
          onEnrolled={() => toast.success('Two-factor authentication is enabled.')}
        />
      )}
    </>
  );
}
