import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { INTEGRATION_MANIFEST } from '@goldstar/platform';
import { SchemaForm } from '../schema-form';

describe('SchemaForm', () => {
  it('renders a url field for a .url() string and reports typed values on change', async () => {
    const schema = z.object({
      feedUrl: z.string().url(),
      venueId: z.string().min(1),
      matchBy: z.enum(['email', 'name']).default('email'),
    });
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} defaultValues={{ venueId: 'v1', matchBy: 'email' }} onChange={onChange} />);

    const feedUrlInput = screen.getByLabelText('Feed url', { exact: false }) as HTMLInputElement;
    expect(feedUrlInput.type).toBe('url');

    fireEvent.change(feedUrlInput, { target: { value: 'https://cal.example.com/feed.ics' } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ feedUrl: 'https://cal.example.com/feed.ics', venueId: 'v1', matchBy: 'email' }),
        true,
      ),
    );
  });

  it('renders enum fields as a select with the schema options', () => {
    const schema = z.object({ matchBy: z.enum(['email', 'name']).default('email') });
    render(<SchemaForm schema={schema} defaultValues={{ matchBy: 'email' }} />);
    const select = screen.getByLabelText('Match by') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['email', 'name']);
  });

  it('excludes secretFields from rendering', () => {
    const schema = z.object({
      apiKey: z.string().min(1),
      locationId: z.string().min(1),
    });
    render(<SchemaForm schema={schema} exclude={['apiKey']} defaultValues={{ locationId: 'loc_1' }} />);
    expect(screen.queryByLabelText('Api key', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Location id', { exact: false })).toBeInTheDocument();
  });

  it('renders a checkbox for a boolean field and reports the toggled value', async () => {
    const schema = z.object({ enabled: z.boolean() });
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} defaultValues={{ enabled: false }} onChange={onChange} />);
    const checkbox = screen.getByLabelText('Enabled');
    fireEvent.click(checkbox);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }), true));
  });

  it('renders a number field with min/max/step derived from the schema and reports it as a number', async () => {
    const schema = z.object({ platformFeeBps: z.number().int().min(0).max(10000) });
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} defaultValues={{ platformFeeBps: 0 }} onChange={onChange} />);
    const input = screen.getByLabelText('Platform fee bps', { exact: false }) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.max).toBe('10000');
    fireEvent.change(input, { target: { value: '500' } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ platformFeeBps: 500 }), true));
  });

  it('reports invalid when a required field fails its check', async () => {
    const schema = z.object({ feedUrl: z.string().url() });
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} defaultValues={{ feedUrl: '' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Feed url', { exact: false }), { target: { value: 'not-a-url' } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ feedUrl: 'not-a-url' }), false));
  });

  it('reports invalid immediately on mount for blank required fields, before any edit', async () => {
    const schema = z.object({ feedUrl: z.string().url(), venueId: z.string().min(1) });
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.anything(), false));
  });

  it('renders nothing for a schema with no supported fields', () => {
    const schema = z.object({ venueMap: z.record(z.string(), z.string()).default({}) });
    const { container } = render(<SchemaForm schema={schema} />);
    expect(container.firstChild).toBeNull();
  });

  // Fix round 1 (Major M1, task-4-review.md): a zod `.default()` value was never seeded into
  // react-hook-form's own `defaultValues`, so an unsupplied defaulted field fell back to a
  // *browser* default (first `<option>`, empty string, NaN) instead of the schema's actual
  // default. These reproduce the review's own repro table and pin the fix.
  describe('schema .default() seeding', () => {
    it('a defaulted enum renders the SCHEMA default, not the first declared option', async () => {
      // Default ('email') is deliberately the SECOND option here — proves this isn't just the
      // ical-manifest coincidence (default happening to equal the first option) the review flagged.
      const schema = z.object({ matchBy: z.enum(['name', 'email']).default('email') });
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} onChange={onChange} />);
      const select = screen.getByLabelText('Match by') as HTMLSelectElement;
      expect(select.value).toBe('email');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ matchBy: 'email' }), true));
    });

    it('a defaulted number is prefilled from the schema — no blank/NaN input, Save not blocked', async () => {
      const schema = z.object({ platformFeeBps: z.number().int().min(0).max(10_000).default(250) });
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} onChange={onChange} />);
      const input = screen.getByLabelText('Platform fee bps', { exact: false }) as HTMLInputElement;
      expect(input.value).toBe('250');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ platformFeeBps: 250 }), true));
    });

    it('a defaulted string is prefilled from the schema', async () => {
      const schema = z.object({ region: z.string().default('us') });
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} onChange={onChange} />);
      const input = screen.getByLabelText('Region', { exact: false }) as HTMLInputElement;
      expect(input.value).toBe('us');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ region: 'us' }), true));
    });

    it('a caller-supplied defaultValues entry still wins over the schema default', async () => {
      const schema = z.object({ matchBy: z.enum(['email', 'name']).default('email') });
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} defaultValues={{ matchBy: 'name' }} onChange={onChange} />);
      const select = screen.getByLabelText('Match by') as HTMLSelectElement;
      expect(select.value).toBe('name');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ matchBy: 'name' }), true));
    });

    it('the real ical manifest configSchema seeds matchBy to its schema default with no caller defaultValues', async () => {
      const ical = INTEGRATION_MANIFEST.find((m) => m.id === 'ical');
      expect(ical).toBeDefined();
      const schema = ical!.configSchema as z.ZodObject<z.ZodRawShape>;
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} defaultValues={{ feedUrl: 'https://cal.example.com/feed.ics', venueId: 'v1' }} onChange={onChange} />);
      const select = screen.getByLabelText('Match by') as HTMLSelectElement;
      expect(select.value).toBe('email');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ matchBy: 'email' }), true));
    });
  });
});
