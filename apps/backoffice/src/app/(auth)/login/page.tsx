import { LoginForm } from '@/features/auth/components/login-form';
import { signIn } from '@/features/auth/data/actions';

const NOTICES: Record<string, string> = {
  not_admin: 'Ce compte n’a pas accès au backoffice.',
  session_expired: 'Votre session a expiré. Reconnectez-vous.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  const notice = typeof error === 'string' ? NOTICES[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Backoffice Clone Instagram</h1>
        <p className="text-muted-foreground">Connexion réservée aux administrateurs.</p>
      </div>
      <LoginForm action={signIn} {...(notice && { notice })} />
    </main>
  );
}
