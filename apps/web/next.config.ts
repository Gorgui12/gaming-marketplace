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
};

export default nextConfig;
