import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrackAndRedirect } from '@/components/track-and-redirect';

// §28 — les URLs de tracking ne doivent jamais être indexées.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AffiliateRefPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <TrackAndRedirect code={code} />
    </Suspense>
  );
}
