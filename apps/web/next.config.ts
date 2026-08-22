import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gm/ui', '@gm/types', '@gm/config', '@gm/validation', '@gm/utils'],
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
