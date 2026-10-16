'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

import type { ModerationResult } from '../data/actions';
import {
  moderationSchema,
  type ModerationAction,
  type ModerationInput,
} from '../schemas/moderation';
import type { AccountStatus } from '../schemas/search';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  destructive: boolean;
}

const COPY: Record<ModerationAction, ActionCopy> = {
  suspend: {
    label: 'Suspendre',
    title: 'Suspendre ce compte ?',
    description:
      'Le compte ne pourra plus utiliser l’app (écran « Compte suspendu ») et deviendra invisible pour les autres, jusqu’à sa réactivation.',
    destructive: false,
  },
  ban: {
    label: 'Bannir',
    title: 'Bannir ce compte ?',
    description:
      'Le compte ne pourra plus utiliser l’app et deviendra invisible pour les autres. Un compte banni peut être réactivé.',
    destructive: true,
  },
  reactivate: {
    label: 'Réactiver',
    title: 'Réactiver ce compte ?',
    description: 'Le compte retrouvera l’accès à l’app et redeviendra visible.',
    destructive: false,
  },
  delete: {
    label: 'Supprimer',
    title: 'Supprimer définitivement ce compte ?',
    description:
      'Le compte, ses publications, commentaires, J’aime et fichiers seront supprimés. Cette action est irréversible.',
    destructive: true,
  },
};

/** Actions permises selon le statut (transitions de l'API) ; la suppression l'est toujours. */
const AVAILABLE: Record<AccountStatus, ModerationAction[]> = {
  active: ['suspend', 'ban', 'delete'],
  suspended: ['ban', 'reactivate', 'delete'],
  banned: ['reactivate', 'delete'],
};

interface ModerationActionsProps {
  userId: string;
  status: AccountStatus;
  onModerate: (input: {
    userId: string;
    action: ModerationAction;
    reason: string;
  }) => Promise<ModerationResult>;
}

/** Boutons d'action ; chacun ouvre un dialogue de confirmation avec motif obligatoire (ADR-011). */
export function ModerationActions({ userId, status, onModerate }: ModerationActionsProps) {
  const [open, setOpen] = useState<ModerationAction | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      {AVAILABLE[status].map((action) => (
        <Button
          key={action}
          variant={COPY[action].destructive ? 'destructive' : 'outline'}
          onClick={() => setOpen(action)}
        >
          {COPY[action].label}
        </Button>
      ))}
      {open && (
        <ModerationDialog
          key={open}
          userId={userId}
          action={open}
          onModerate={onModerate}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ModerationDialog({
  userId,
  action,
  onModerate,
  onClose,
}: {
  userId: string;
  action: ModerationAction;
  onModerate: ModerationActionsProps['onModerate'];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ModerationInput>({
    resolver: zodResolver(moderationSchema),
    defaultValues: { reason: '' },
  });
  const copy = COPY[action];
  const error = form.formState.errors.reason?.message;

  const submit = form.handleSubmit(({ reason }) => {
    startTransition(async () => {
      const result = await onModerate({ userId, action, reason });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onClose();
      if (action === 'delete') router.push('/users');
    });
  });

  return (
    <AlertDialog open onOpenChange={(isOpen) => !isOpen && !pending && onClose()}>
      <AlertDialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="reason">Motif</FieldLabel>
            <Textarea
              id="reason"
              maxLength={500}
              aria-invalid={error ? true : undefined}
              {...form.register('reason')}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <Button
              type="submit"
              variant={copy.destructive ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending ? 'En cours…' : copy.label}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
