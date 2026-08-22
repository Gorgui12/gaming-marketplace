import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BASE_URL, GEO, SITE_NAME, organizationJsonLd, websiteJsonLd } from '@/lib/seo';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0E28',
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default:
      'Marketplace Gaming Sénégal — Acheter et vendre des comptes eFootball à Dakar en toute sécurité',
    template: '%s — Gaming Market Sénégal',
  },
  description:
    'La marketplace de confiance pour acheter et vendre des comptes eFootball au Sénégal. Paiement Orange Money et Wave, remise sécurisée, vendeurs vérifiés à Dakar et partout au Sénégal.',
  keywords: [
    'compte eFootball Sénégal',
    'acheter compte eFootball Dakar',
    'vendre compte gaming Sénégal',
    'marketplace gaming Afrique de l\'Ouest',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_SN',
    siteName: SITE_NAME,
    url: BASE_URL,
    title: 'Marketplace Gaming Sénégal — Comptes eFootball vérifiés',
    description:
      'Achetez et vendez des comptes eFootball au Sénégal en toute confiance. Paiement Mobile Money, remise sécurisée.',
  },
  twitter: {
    card: 'summary_large_image',
  },
  other: {
    // Signaux géographiques classiques pour le SEO local (Dakar/Sénégal).
    'geo.region': GEO.region,
    'geo.placename': GEO.placename,
    'geo.position': `${GEO.latitude};${GEO.longitude}`,
    ICBM: `${GEO.latitude}, ${GEO.longitude}`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-body antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        {children}
      </body>
    </html>
  );
}
