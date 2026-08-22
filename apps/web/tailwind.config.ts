import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#12173A',
          deep: '#0B0E28',
          mid: '#1B2150',
          soft: '#262C63',
        },
        gold: {
          DEFAULT: '#E8B84B',
          soft: '#F3D48A',
        },
        coral: '#FF6B5B',
        mint: '#3ECF8E',
        bone: '#F5F3EE',
      },
      fontFamily: {
        display: [
          'Klavika',
          'Archivo Black',
          'Arial Narrow',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        body: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        ticket: '10px',
      },
      backgroundImage: {
        'perforation-v':
          'repeating-linear-gradient(to bottom, transparent 0, transparent 6px, rgba(245,243,238,0.35) 6px, rgba(245,243,238,0.35) 8px)',
      },
    },
  },
  plugins: [],
};

export default config;
