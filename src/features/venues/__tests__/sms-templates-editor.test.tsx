import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmsTemplatesEditor } from '../sms-templates-editor';

describe('SmsTemplatesEditor', () => {
  it('N3: surfaces RHF errors.sms.<field>.message on the matching field, not only the local overLimit check', () => {
    render(
      <SmsTemplatesEditor
        value={{}}
        onChange={vi.fn()}
        errors={{ welcome: { message: 'Server-side: template rejected' } }}
      />,
    );
    expect(screen.getByText('Server-side: template rejected')).toBeInTheDocument();
    // A field with no RHF error and under the char limit shows neither error.
    expect(screen.queryByText('SMS templates must be 320 characters or fewer.')).not.toBeInTheDocument();
  });

  it('N3: the local live overLimit check still wins over a stale/absent RHF error while typing past 320 chars', () => {
    const long = 'x'.repeat(321);
    render(<SmsTemplatesEditor value={{ ready: long }} onChange={vi.fn()} />);
    expect(screen.getByText('SMS templates must be 320 characters or fewer.')).toBeInTheDocument();
  });
});
