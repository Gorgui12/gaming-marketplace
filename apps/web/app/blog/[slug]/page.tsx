import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo';

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  category: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string;
  updatedAt?: string;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const data = await apiFetch<{ post: BlogPost }>(`/api/v1/blog/${slug}`);
    return data.post;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <>
      <SiteNav />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleJsonLd({
              title: post.title,
              description: post.excerpt,
              slug: post.slug,
              coverImage: post.coverImage,
              publishedAt: post.publishedAt,
              updatedAt: post.updatedAt,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Accueil', url: '/' },
              { name: 'Blog', url: '/blog' },
              { name: post.title, url: `/blog/${post.slug}` },
            ]),
          ),
        }}
      />

      <main className="mx-auto max-w-2xl px-5 pb-16 pt-8 md:pt-12">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">{post.category}</p>
        <h1 className="mt-2 font-display text-3xl text-bone">{post.title}</h1>
        {post.publishedAt && (
          <p className="mt-2 text-xs text-bone/40">
            {new Date(post.publishedAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}

        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt={post.title}
            className="mt-6 w-full rounded-ticket border border-white/10 object-cover"
          />
        )}

        <div
          className="mt-8 space-y-4 text-[15px] leading-relaxed text-bone/80 [&_a]:text-gold [&_a]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-bone [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:text-bone [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-bone"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-bone/50"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
