'use client';
import { useContext } from 'react';
import { SessionContext, type Session } from './session-provider';

/** Reads the dashboard auth session. Must be used under `<SessionProvider>`. */
export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession() must be called within a <SessionProvider>.');
  }
  return ctx;
}
