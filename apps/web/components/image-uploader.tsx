'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const MAX_IMAGES = 10;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo — aligné sur le backend
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface UploadResult {
  url: string;
  publicId: string;
  bytes: number;
}

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
}

export function ImageUploader({ images, onChange, max = MAX_IMAGES }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');

    const remaining = max - images.length;
    const selected = Array.from(files).slice(0, remaining);

    if (Array.from(files).length > remaining) {
      setError(`Maximum ${max} images pour une annonce.`);
    }

    const valid = selected.filter((f) => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError('Seuls JPEG, PNG et WebP sont acceptés.');
        return false;
      }
      if (f.size > MAX_SIZE_BYTES) {
        setError('Chaque image doit peser moins de 5 Mo.');
        return false;
      }
      return true;
    });
    if (valid.length === 0) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(valid.length);
    try {
      // Un fichier par requête, en parallèle — l'API attend du binaire
      // brut avec le vrai mime en Content-Type.
      const results = await Promise.all(
        valid.map((file) =>
          apiFetch<UploadResult>('/api/v1/uploads/image', {
            method: 'POST',
            body: file,
            headers: { 'Content-Type': file.type },
          }),
        ),
      );
      onChange([...images, ...results.map((r) => r.url)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'upload");
    } finally {
      setUploading(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {images.map((url, i) => (
          <div key={url} className="group relative overflow-hidden rounded-lg border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Capture ${i + 1}`} className="aspect-video w-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute right-1 top-1 rounded-full bg-navy-deep/90 px-2 py-0.5 text-xs text-coral opacity-0 transition group-hover:opacity-100"
              aria-label={`Supprimer la capture ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-xs text-bone/50 hover:border-gold/60 hover:text-gold disabled:opacity-50"
          >
            {uploading > 0 ? (
              <span>Envoi… ({uploading})</span>
            ) : (
              <>
                <span className="text-lg leading-none">+</span>
                <span>Ajouter</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(',')}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <p className="mt-1.5 text-xs text-bone/40">
        JPEG/PNG/WebP, max 5 Mo — {images.length}/{max} captures. Minimum 1 capture requis.
      </p>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
