import Link from 'next/link';

export default function UserNotFound() {
  return (
    <div className="flex flex-col items-start gap-2">
      <p>Ce compte n’existe pas ou a été supprimé.</p>
      <Link href="/users" className="underline-offset-4 hover:underline">
        Retour aux utilisateurs
      </Link>
    </div>
  );
}
