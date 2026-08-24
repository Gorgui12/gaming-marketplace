import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gm/ui', '@gm/types', '@gm/config', '@gm/validation', '@gm/utils'],
  // Les packages @gm/* compilent avec moduleResolution NodeNext : leurs
  // imports internes utilisent l'extension .js alors que les sources sont .ts.
  // Sans cet alias, webpack ne résout pas ./x.js -> ./x.ts quand il compile
  // les sources directement (cas du build Vercel où dist/ n'existe pas).
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Les couvertures d'annonces sont des URLs collées par les vendeurs
    // (n'importe quel hébergeur) tant que l'upload Cloudinary n'est pas
    // branché sur le formulaire — on autorise donc tous les hôtes HTTPS.
    // À restreindre à res.cloudinary.com une fois l'upload réellement intégré.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Proxy /backend/* -> API. Le navigateur ne parle qu'à l'origine du site :
  // le cookie de session devient first-party, sinon Safari iOS (ITP) jette
  // les cookies tiers posés par un fetch cross-site et la connexion échoue
  // silencieusement sur mobile alors que Chrome desktop fonctionne.
  async rewrites() {
    const backend = process.env.API_URL ?? 'http://localhost:4000';
    return [{ source: '/backend/:path*', destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
