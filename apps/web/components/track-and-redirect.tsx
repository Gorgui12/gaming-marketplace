'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { getOrCreateTrackingSessionId } from '@/lib/tracking-session';

function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  return /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

export function TrackAndRedirect({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const sessionId = getOrCreateTrackingSessionId();
    const destination = '/marketplace/efootball';

    apiFetch('/api/v1/affiliates/track-click', {
      method: 'POST',
      json: {
        affiliateCode: code,
        sessionId,
        landingPage: window.location.href,
        referrer: document.referrer || undefined,
        utmSource: searchParams.get('utm_source') ?? undefined,
        utmMedium: searchParams.get('utm_medium') ?? undefined,
        utmCampaign: searchParams.get('utm_campaign') ?? undefined,
        deviceType: detectDeviceType(),
      },
    })
      .catch(() => setFailed(true))
      .finally(() => router.replace(destination));
  }, [code, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-deep">
      <p className="font-mono text-sm text-bone/50">
        {failed ? 'Redirection…' : 'Redirection vers la marketplace…'}
      </p>
    </div>
  );
}
