import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, User } from '@goldstar/platform';
import { AuditTable } from '../audit-table';

function entry(over: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '01912345-7abc-7def-8123-456789abcdef',
    actorUid: 'owner1',
    action: 'integrations.setSecret',
    target: 'twilio.authToken',
    before: null,
    after: null,
    at: '2026-08-23T21:00:00.000Z',
    requestId: 'req1',
    ...over,
  };
}

const STAFF = new Map<string, User>([['owner1', { uid: 'owner1', displayName: 'Jamie Rivera' } as User]]);

describe('AuditTable', () => {
  it('shows a prompt to search before any search has run', () => {
    render(<AuditTable entries={[]} staffByUid={STAFF} loading={false} hasSearched={false} />);
    expect(screen.getByText('Search the audit log')).toBeInTheDocument();
  });

  it('shows a loading state while a search is in flight', () => {
    render(<AuditTable entries={[]} staffByUid={STAFF} loading hasSearched />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an empty state when a search returns nothing', () => {
    render(<AuditTable entries={[]} staffByUid={STAFF} loading={false} hasSearched />);
    expect(screen.getByText('No audit entries')).toBeInTheDocument();
  });

  it('renders one row per entry, resolving the actor to a display name', () => {
    render(<AuditTable entries={[entry()]} staffByUid={STAFF} loading={false} hasSearched />);
    expect(screen.getByText('Jamie Rivera')).toBeInTheDocument();
    expect(screen.getByText('integrations.setSecret')).toBeInTheDocument();
    expect(screen.getByText('twilio.authToken')).toBeInTheDocument();
  });

  it('renders "System" for the literal actorUid "system"', () => {
    render(<AuditTable entries={[entry({ actorUid: 'system' })]} staffByUid={STAFF} loading={false} hasSearched />);
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('the diff viewer is collapsed by default', () => {
    render(
      <AuditTable
        entries={[entry({ before: { status: 'active' }, after: { status: 'suspended' } })]}
        staffByUid={STAFF}
        loading={false}
        hasSearched
      />,
    );
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('clicking the row expands the diff viewer, showing changed field/before/after', () => {
    render(
      <AuditTable
        entries={[entry({ before: { status: 'active' }, after: { status: 'suspended' } })]}
        staffByUid={STAFF}
        loading={false}
        hasSearched
      />,
    );
    fireEvent.click(screen.getByLabelText(/Expand details/));
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('"active"')).toBeInTheDocument();
    expect(screen.getByText('"suspended"')).toBeInTheDocument();
  });

  it('clicking again collapses the diff viewer', () => {
    render(
      <AuditTable
        entries={[entry({ before: { status: 'active' }, after: { status: 'suspended' } })]}
        staffByUid={STAFF}
        loading={false}
        hasSearched
      />,
    );
    const toggle = screen.getByLabelText(/Expand details/);
    fireEvent.click(toggle);
    expect(screen.getByText('status')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Collapse details/));
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('an entry with no field-level changes shows the "no changes" message when expanded', () => {
    render(<AuditTable entries={[entry({ before: null, after: null })]} staffByUid={STAFF} loading={false} hasSearched />);
    fireEvent.click(screen.getByLabelText(/Expand details/));
    expect(screen.getByText('No field-level changes recorded.')).toBeInTheDocument();
  });

  it('renders multiple entries independently, each expandable on its own', () => {
    render(
      <AuditTable
        entries={[
          entry({ id: 'e1', action: 'action.one', before: { a: 1 }, after: { a: 2 } }),
          entry({ id: 'e2', action: 'action.two', before: { b: 1 }, after: { b: 2 } }),
        ]}
        staffByUid={STAFF}
        loading={false}
        hasSearched
      />,
    );
    const toggles = screen.getAllByLabelText(/Expand details/);
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]!);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('b')).not.toBeInTheDocument();
  });
});
