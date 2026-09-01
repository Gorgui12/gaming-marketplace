import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';

export const metadata: Metadata = {
  title: 'Blog — Guides et actualités gaming au Sénégal',
  description:
    'Guides eFootball, astuces gaming, sécurité des transactions et actualités du marché des comptes gaming au Sénégal et en Afrique de l\'Ouest.',
  alternates: { canonical: '/blog' },
};

interface BlogPostSummary {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage?: string;
  category: string;
  publishedAt?: string;
}

async function getPosts(): Promise<BlogPostSummary[]> {
  try {
    const data = await apiFetch<{ items: BlogPostSummary[] }>('/api/v1/blog?pageSize=20');
    return data.items;
  } catch {
    return [];
  }
}

export default async function BlogIndexPage() {
  const posts = await getPosts();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 md:pt-12">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">Blog</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Guides et actualités gaming</h1>
        <p className="mt-2 max-w-xl text-bone/60">
          Astuces eFootball, conseils de sécurité pour vos transactions, actualités du marché
          gaming au Sénégal.
        </p>

        {posts.length === 0 ? (
          <div className="mt-10 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Aucun article pour l&apos;instant</p>
            <p className="mt-2 text-sm text-bone/60">Revenez bientôt.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post._id}
                href={`/blog/${post.slug}`}
                className="rounded-ticket border border-white/10 bg-navy-mid p-5 hover:border-gold/40"
              >
                <p className="font-mono text-[11px] uppercase tracking-widest text-gold/70">
                  {post.category}
                </p>
                <p className="mt-2 font-display text-lg text-bone">{post.title}</p>
                <p className="mt-2 line-clamp-2 text-sm text-bone/60">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
