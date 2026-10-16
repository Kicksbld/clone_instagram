import Link from 'next/link';

export default function ReportNotFound() {
  return (
    <div className="flex flex-col items-start gap-2">
      <p>Ce signalement n’existe pas.</p>
      <Link href="/reports" className="underline-offset-4 hover:underline">
        Retour aux signalements
      </Link>
    </div>
  );
}
