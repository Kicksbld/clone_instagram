import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/features/auth/data/session';
import { ModerationActions } from '@/features/users/components/moderation-actions';
import { ReportsTable } from '@/features/users/components/reports-table';
import { UserProfileCard } from '@/features/users/components/user-profile-card';
import { moderateUser } from '@/features/users/data/actions';
import { getUser } from '@/features/users/data/queries';

export default async function UserPage({ params }: PageProps<'/users/[id]'>) {
  const client = await requireAdmin();
  const { id } = await params;
  const user = await getUser(client, id);
  if (!user) notFound();

  return (
    <>
      <Link
        href="/users"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Utilisateurs
      </Link>
      <UserProfileCard user={user} />
      <ModerationActions userId={user.id} status={user.status} onModerate={moderateUser} />
      <ReportsTable
        title="Signalements reçus"
        total={user.reportsReceived.total}
        reports={user.reportsReceived.items}
        showReporter
      />
      <ReportsTable
        title="Signalements émis"
        total={user.reportsFiled.total}
        reports={user.reportsFiled.items}
        showReporter={false}
      />
    </>
  );
}
