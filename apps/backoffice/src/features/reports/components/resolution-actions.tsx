'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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

import type { ResolutionResult } from '../data/actions';
import {
  type ResolutionAction,
  type ResolutionInput,
  resolutionSchema,
} from '../schemas/resolution';
import type { ReportTargetType } from '../schemas/search';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  destructive: boolean;
}

const COPY: Record<ResolutionAction, ActionCopy> = {
  remove_content: {
    label: 'Supprimer le contenu',
    title: 'Supprimer ce contenu ?',
    description:
      'Le contenu disparaît de l’app (avec ses réponses pour un commentaire) et ses fichiers sont effacés. Tous les signalements ouverts sur ce contenu seront traités.',
    destructive: true,
  },
  dismiss: {
    label: 'Classer',
    title: 'Classer ce signalement ?',
    description:
      'Le contenu reste en ligne. Tous les signalements ouverts sur ce contenu seront classés.',
    destructive: false,
  },
};

interface ResolutionActionsProps {
  reportId: string;
  targetType: ReportTargetType;
  onResolve: (input: {
    reportId: string;
    action: ResolutionAction;
    note: string;
  }) => Promise<ResolutionResult>;
}

/** Actions d'un signalement ouvert ; un compte ne peut être que classé (sanction depuis sa fiche). */
export function ResolutionActions({ reportId, targetType, onResolve }: ResolutionActionsProps) {
  const [open, setOpen] = useState<ResolutionAction | null>(null);
  const actions: ResolutionAction[] =
    targetType === 'user' ? ['dismiss'] : ['remove_content', 'dismiss'];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          variant={COPY[action].destructive ? 'destructive' : 'outline'}
          onClick={() => setOpen(action)}
        >
          {COPY[action].label}
        </Button>
      ))}
      {open && (
        <ResolutionDialog
          key={open}
          reportId={reportId}
          action={open}
          onResolve={onResolve}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ResolutionDialog({
  reportId,
  action,
  onResolve,
  onClose,
}: {
  reportId: string;
  action: ResolutionAction;
  onResolve: ResolutionActionsProps['onResolve'];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<ResolutionInput>({
    resolver: zodResolver(resolutionSchema),
    defaultValues: { note: '' },
  });
  const copy = COPY[action];
  const error = form.formState.errors.note?.message;

  const submit = form.handleSubmit(({ note }) => {
    startTransition(async () => {
      const result = await onResolve({ reportId, action, note });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onClose();
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
            <FieldLabel htmlFor="note">Note (facultative)</FieldLabel>
            <Textarea
              id="note"
              maxLength={500}
              aria-invalid={error ? true : undefined}
              {...form.register('note')}
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
