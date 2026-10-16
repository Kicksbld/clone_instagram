import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { AdminUserDetail } from '../data/queries';
import { StatusBadge } from './status-badge';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/** Profil, statut, compteurs et abonnement Clone Plus d'un compte. */
export function UserProfileCard({ user }: { user: AdminUserDetail }) {
  const facts: [string, string][] = [
    ['Abonnés', String(user.followerCount)],
    ['Abonnements', String(user.followingCount)],
    ['Publications', String(user.postCount)],
    ['Compte', user.isPrivate ? 'Privé' : 'Public'],
    [
      'Clone Plus',
      user.plan === 'plus'
        ? `Actif${user.plusExpiresAt ? ` jusqu’au ${dateFormat.format(new Date(user.plusExpiresAt))}` : ''}`
        : 'Non abonné',
    ],
    ['Inscription', dateFormat.format(new Date(user.createdAt))],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          @{user.username}
          <StatusBadge status={user.status} />
        </CardTitle>
        <p className="text-muted-foreground">{user.fullName}</p>
        {user.bio && <p className="whitespace-pre-line">{user.bio}</p>}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
