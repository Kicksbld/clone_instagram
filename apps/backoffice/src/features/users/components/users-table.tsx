'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { AdminUserSummary } from '../data/queries';
import { StatusBadge } from './status-badge';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

// Pagination, tri et filtres côté serveur (dans l'URL) : aucun traitement de lignes dans le tableau.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, AdminUserSummary>();
const columns = helper.columns([
  helper.accessor('username', {
    header: 'Utilisateur',
    cell: ({ row }) => (
      <Link
        href={`/users/${row.original.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        @{row.original.username}
      </Link>
    ),
  }),
  helper.accessor('fullName', { header: 'Nom' }),
  helper.accessor('status', {
    header: 'Statut',
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  helper.accessor('followerCount', { header: 'Abonnés' }),
  helper.accessor('postCount', { header: 'Publications' }),
  helper.accessor('createdAt', {
    header: 'Inscription',
    cell: ({ getValue }) => dateFormat.format(new Date(getValue())),
  }),
]);

export function UsersTable({ users }: { users: AdminUserSummary[] }) {
  const table = useTable({ features, columns, data: users, getRowId: (user) => user.id });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
