'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createListingSchema } from '@gm/validation';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { ImageUploader } from '@/components/image-uploader';
import { apiFetch } from '@/lib/api-client';
import { validateForm, type FieldErrors } from '@/lib/form-validation';

interface Game {
  _id: string;
  name: string;
  slug: string;
  marketplaceEnabled: boolean;
}

const TITLE_MAX = 140;
const DESCRIPTION_MAX = 5000;

// Champs tableau du schéma saisis en listes séparées par des virgules
// (epic/showTime/featured players) — convertis en array propre au submit.
function parsePlayerList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export default function NewListingPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[] | null>(null);
  const [form, setForm] = useState({
    game: '',
    title: '',
    description: '',
    price: '',
    currency: 'XOF',
    country: 'SN',
    teamStrength: '',
    playerCount: '',
    epicPlayers: '',
    showTimePlayers: '',
    featuredPlayers: '',
  });
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch<{ games: Game[] }>('/api/v1/games')
      .then((d) => {
        setGames(d.games);
        if (d.games.length > 0) {
          setForm((f) => ({ ...f, game: d.games[0]!._id }));
        }
      })
      .catch(() => setGames([]));
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedGame = games?.find((g) => g._id === form.game);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Validation client avec le MÊME schéma Zod que le contrôleur API :
    // les règles (longueurs, prix positif, 1 à 10 captures...) ne peuvent
    // plus diverger entre le formulaire et le serveur.
    const parsed = validateForm(createListingSchema, {
      game: form.game,
      title: form.title,
      description: form.description,
      price: Number(form.price),
      currency: form.currency,
      country: form.country,
      teamStrength: form.teamStrength ? Number(form.teamStrength) : undefined,
      playerCount: form.playerCount ? Number(form.playerCount) : undefined,
      epicPlayers: parsePlayerList(form.epicPlayers).length > 0 ? parsePlayerList(form.epicPlayers) : undefined,
      showTimePlayers: parsePlayerList(form.showTimePlayers).length > 0 ? parsePlayerList(form.showTimePlayers) : undefined,
      featuredPlayers: parsePlayerList(form.featuredPlayers).length > 0 ? parsePlayerList(form.featuredPlayers) : undefined,
      screenshots,
    });

    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/v1/listings', {
        method: 'POST',
        json: parsed.data,
      });
      setSuccess(true);
      setTimeout(() => router.push('/dashboard/seller'), 1500);
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : 'Erreur lors de la création' });
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold';

  function fieldError(key: string): string | undefined {
    return errors[key];
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-display text-2xl text-bone">Créer une annonce</h1>
        <p className="mt-2 text-sm text-bone/60">
          Votre annonce sera vérifiée par notre équipe avant publication.
        </p>

        {success ? (
          <div className="mt-6 rounded-ticket border border-mint/30 bg-mint/10 p-6 text-center">
            <p className="font-display text-lg text-bone">Annonce créée</p>
            <p className="mt-2 text-sm text-bone/60">
              Elle est en attente de modération. Redirection…
            </p>
          </div>
        ) : games && games.length === 0 ? (
          <div className="mt-6 rounded-ticket border border-coral/30 bg-coral/10 p-6 text-center">
            <p className="font-display text-lg text-bone">Aucun jeu disponible</p>
            <p className="mt-2 text-sm text-bone/60">
              Aucun jeu n&apos;est actif sur la marketplace pour l&apos;instant.
            </p>
          </div>
        ) : selectedGame && !selectedGame.marketplaceEnabled ? (
          <div className="mt-6 rounded-ticket border border-coral/30 bg-coral/10 p-6 text-center">
            <p className="font-display text-lg text-bone">
              La vente de comptes {selectedGame.name} est temporairement désactivée
            </p>
            <p className="mt-2 text-sm text-bone/60">
              Notre équipe revoit actuellement la conformité de ce jeu avec les CGU de
              l&apos;éditeur. Revenez bientôt.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {fieldError('_form') && <p className="text-sm text-coral">{fieldError('_form')}</p>}
            {fieldError('game') && <p className="text-sm text-coral">{fieldError('game')}</p>}

            <select
              value={form.game}
              onChange={(e) => update('game', e.target.value)}
              className={inputClass}
            >
              {games?.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>

            <div>
              <input
                required
                placeholder="Titre de l'annonce (5 caractères minimum)"
                maxLength={TITLE_MAX}
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                className={inputClass}
              />
              <div className="mt-1 flex items-center justify-between">
                {fieldError('title') ? (
                  <p className="text-xs text-coral">{fieldError('title')}</p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-bone/40">
                  {form.title.length}/{TITLE_MAX}
                </span>
              </div>
            </div>

            <div>
              <textarea
                required
                rows={5}
                placeholder="Description détaillée du compte (joueurs, niveau, ancienneté...) — 20 caractères minimum"
                maxLength={DESCRIPTION_MAX}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className={inputClass}
              />
              <div className="mt-1 flex items-center justify-between">
                {fieldError('description') ? (
                  <p className="text-xs text-coral">{fieldError('description')}</p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-bone/40">
                  {form.description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  required
                  type="number"
                  min={1}
                  step="1"
                  placeholder="Prix (FCFA)"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                  className={inputClass}
                />
                {(fieldError('price') || fieldError('currency')) && (
                  <p className="mt-1 text-xs text-coral">
                    {fieldError('price') ?? fieldError('currency')}
                  </p>
                )}
              </div>
              <select
                value={form.currency}
                onChange={(e) => update('currency', e.target.value)}
                className={inputClass}
              >
                <option value="XOF">XOF (FCFA)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Force d'équipe (optionnel)"
                  value={form.teamStrength}
                  onChange={(e) => update('teamStrength', e.target.value)}
                  className={inputClass}
                />
                {fieldError('teamStrength') && (
                  <p className="mt-1 text-xs text-coral">{fieldError('teamStrength')}</p>
                )}
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Nombre de joueurs (optionnel)"
                  value={form.playerCount}
                  onChange={(e) => update('playerCount', e.target.value)}
                  className={inputClass}
                />
                {fieldError('playerCount') && (
                  <p className="mt-1 text-xs text-coral">{fieldError('playerCount')}</p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-bone/50">
                Joueurs Epic (séparés par des virgules, optionnel)
              </label>
              <input
                placeholder="Ex: Mbappé 107, Haaland 105"
                value={form.epicPlayers}
                onChange={(e) => update('epicPlayers', e.target.value)}
                className={inputClass}
              />
              {fieldError('epicPlayers') && (
                <p className="mt-1 text-xs text-coral">{fieldError('epicPlayers')}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-bone/50">
                Joueurs ShowTime (séparés par des virgules, optionnel)
              </label>
              <input
                placeholder="Ex: Ronaldinho ShowTime"
                value={form.showTimePlayers}
                onChange={(e) => update('showTimePlayers', e.target.value)}
                className={inputClass}
              />
              {fieldError('showTimePlayers') && (
                <p className="mt-1 text-xs text-coral">{fieldError('showTimePlayers')}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-bone/50">
                Joueurs vedettes (séparés par des virgules, optionnel)
              </label>
              <input
                placeholder="Ex: Messi 104"
                value={form.featuredPlayers}
                onChange={(e) => update('featuredPlayers', e.target.value)}
                className={inputClass}
              />
              {fieldError('featuredPlayers') && (
                <p className="mt-1 text-xs text-coral">{fieldError('featuredPlayers')}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-bone/50">
                Captures d&apos;écran du compte
              </label>
              <ImageUploader images={screenshots} onChange={setScreenshots} />
              {fieldError('screenshots') && (
                <p className="mt-1 text-xs text-coral">{fieldError('screenshots')}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !form.game || screenshots.length === 0}
              className="w-full rounded-full bg-gold px-6 py-3 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
            >
              {submitting ? 'Envoi en cours…' : "Soumettre l'annonce"}
            </button>
          </form>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
