import type { Metadata } from 'next';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { AffiliateDashboard } from '@/components/affiliate-dashboard';

export const metadata: Metadata = {
  title: 'Mon espace affilié',
  robots: { index: false, follow: false },
};

export default function AffiliateDashboardPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="font-display text-2xl text-bone">Mon espace affilié</h1>
        <div className="mt-6">
          <AffiliateDashboard />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
