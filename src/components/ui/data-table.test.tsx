import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { render, screen, fireEvent, within } from '@/test/utils';
import { DataTable } from './data-table';

// Baseline interaction/regression tests (task-1-report.md, Fix round 1 M5)
// pinning the TanStack Table v8 generics fix (`useReactTable<TData>`,
// `fuzzyFilter<TData>`) the report itself flagged as fragile — this repo
// has no page consuming DataTable yet, so without a test here a regression
// wouldn't surface until the next `tsc --noEmit`.

interface Row {
  name: string;
  age: number;
}

const rows: Row[] = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 40 },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age' },
];

describe('DataTable', () => {
  it('renders a header and a row per data item, from the column defs', () => {
    render(<DataTable columns={columns} data={rows} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Age' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    const body = table.querySelectorAll('tbody tr');
    expect(body).toHaveLength(3);
    expect(within(body[0] as HTMLElement).getByText('Alice')).toBeInTheDocument();
    expect(within(body[0] as HTMLElement).getByText('30')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('toggles ascending/descending sort on a header click', () => {
    render(<DataTable columns={columns} data={rows} />);
    // The sort click handler lives on the inner <div> wrapping the header
    // label (see data-table.tsx), not on the <th> itself — click the label
    // text so the event actually originates inside that div.
    const nameHeaderLabel = screen.getByText('Name');

    const bodyText = () =>
      Array.from(screen.getByRole('table').querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent);

    // Unsorted: insertion order.
    expect(bodyText()).toEqual(['Alice', 'Bob', 'Charlie']);

    fireEvent.click(nameHeaderLabel);
    expect(bodyText()).toEqual(['Alice', 'Bob', 'Charlie']); // ascending — already alphabetical, so unchanged

    fireEvent.click(nameHeaderLabel);
    expect(bodyText()).toEqual(['Charlie', 'Bob', 'Alice']); // descending
  });

  it('filters rows via the global filter input', () => {
    render(<DataTable columns={columns} data={rows} />);
    const filterInput = screen.getByPlaceholderText('Filter...');

    fireEvent.change(filterInput, { target: { value: 'bob' } });

    const body = screen.getByRole('table').querySelectorAll('tbody tr');
    expect(body).toHaveLength(1);
    expect(within(body[0] as HTMLElement).getByText('Bob')).toBeInTheDocument();
  });

  it('hides pagination controls when showPagination is false', () => {
    render(<DataTable columns={columns} data={rows} showPagination={false} />);
    expect(screen.queryByText(/Page \d+ of \d+/)).toBeNull();
  });

  it('hides the column-visibility control when showColumnVisibility is false', () => {
    render(<DataTable columns={columns} data={rows} showColumnVisibility={false} />);
    expect(screen.queryByRole('button', { name: /Columns/i })).toBeNull();
  });

  describe('rows per page (owner-demo capture: venue board read "10" while showing 16 rows)', () => {
    const many: Row[] = Array.from({ length: 30 }, (_, i) => ({ name: `Guest ${i + 1}`, age: 20 + i }));
    const bodyRows = () => screen.getByRole('table').querySelectorAll('tbody tr');

    it('shows the page size actually in use, even when it is not one of the stock choices', () => {
      render(<DataTable columns={columns} data={many} pageSize={25} />);
      const select = screen.getByRole('combobox', { name: 'Rows per page' });
      expect((select as HTMLSelectElement).value).toBe('25');
      expect(within(select).getByRole('option', { name: '25', selected: true })).toBeInTheDocument();
      expect(bodyRows()).toHaveLength(25);
    });

    it('still pages by a stock size the user picks', () => {
      render(<DataTable columns={columns} data={many} pageSize={25} />);
      fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '10' } });
      expect(bodyRows()).toHaveLength(10);
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });
  });
});
