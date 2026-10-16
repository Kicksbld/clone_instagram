import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { AdminReportDetail } from '../data/queries';
import { dateFormat } from './labels';

/** Aperçu du contenu signalé (images, texte, ou compte), même privé ou supprimé. */
export function ReportedContent({ report }: { report: AdminReportDetail }) {
  const { post, comment, user } = report;
  if (post) {
    return (
      <ContentCard
        title={`Publication de @${post.author.username}`}
        authorId={post.author.id}
        createdAt={post.createdAt}
        removed={post.removed}
      >
        {post.media.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto">
            {post.media.map((item) => (
              // eslint-disable-next-line @next/next/no-img-element -- variantes déjà redimensionnées par le worker, hôte Storage différent selon l'environnement (ADR-009)
              <img
                key={item.variants.medium}
                src={item.variants.medium}
                alt=""
                width={item.width}
                height={item.height}
                className="h-64 w-auto rounded-md border object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Images supprimées.</p>
        )}
        {post.caption && <p className="whitespace-pre-line">{post.caption}</p>}
      </ContentCard>
    );
  }
  if (comment) {
    return (
      <ContentCard
        title={`Commentaire de @${comment.author.username}`}
        authorId={comment.author.id}
        createdAt={comment.createdAt}
        removed={comment.removed}
      >
        <p className="whitespace-pre-line">{comment.body}</p>
      </ContentCard>
    );
  }
  if (user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compte signalé</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2">
          <p>
            @{user.username} · {user.fullName}
          </p>
          <p className="text-sm text-muted-foreground">
            Un compte ne peut être que classé. Pour le sanctionner (suspendre, bannir, supprimer),
            passez par sa fiche.
          </p>
          <Link href={`/users/${user.id}`} className="underline-offset-4 hover:underline">
            Ouvrir la fiche du compte
          </Link>
        </CardContent>
      </Card>
    );
  }
  return <p className="text-muted-foreground">Le contenu signalé n’existe plus.</p>;
}

function ContentCard({
  title,
  authorId,
  createdAt,
  removed,
  children,
}: {
  title: string;
  authorId: string;
  createdAt: string;
  removed: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          {title}
          {removed && <Badge variant="destructive">Supprimé</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {dateFormat.format(new Date(createdAt))} ·{' '}
          <Link href={`/users/${authorId}`} className="underline-offset-4 hover:underline">
            Fiche de l’auteur
          </Link>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
