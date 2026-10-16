'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import type { SignInState } from '../data/actions';

interface LoginFormProps {
  action: (previous: SignInState | undefined, formData: FormData) => Promise<SignInState>;
  /** Message affiché à l'arrivée (session expirée, compte non admin). */
  notice?: string;
}

export function LoginForm({ action, notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const error = state?.error ?? notice;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state?.email}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        {error && <FieldError role="alert">{error}</FieldError>}
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
