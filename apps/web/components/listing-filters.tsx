'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'popular', label: 'Plus consultés' },
] as const;

export type ListingSort = (typeof SORT_OPTIONS)[number]['value'];

export function ListingFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sort, setSort] = useState<ListingSort>(
    (searchParams.get('sort') as ListingSort) || 'recent',
  );
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '');

  const hasFilters =
    (searchParams.get('sort') !== null && searchParams.get('sort') !== 'recent') ||
    searchParams.get('minPrice') !== null ||
    searchParams.get('maxPrice') !== null;

  function pushUrl(values: { sort?: string; minPrice?: string; maxPrice?: string }) {
    const params = new URLSearchParams();
    if (values.sort && values.sort !== 'recent') params.set('sort', values.sort);
    if (values.minPrice) params.set('minPrice', values.minPrice.trim());
    if (values.maxPrice) params.set('maxPrice', values.maxPrice.trim());
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushUrl({ sort, minPrice, maxPrice });
  }

  function handleSortChange(value: ListingSort) {
    setSort(value);
    pushUrl({ sort: value, minPrice, maxPrice });
  }

  function handleReset() {
    setSort('recent');
    setMinPrice('');
    setMaxPrice('');
    router.push(pathname);
  }

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-navy-deep px-3 py-2 text-sm text-bone outline-none transition placeholder:text-bone/30 focus:border-gold';

  return (
    <div className="mt-8 rounded-ticket border border-white/10 bg-navy-mid p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-bone/50">
          <SlidersHorizontal size={14} className="text-gold" />
          Filtres
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end lg:max-w-2xl"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-bone/40">Tri</span>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as ListingSort)}
              className={`${inputClass} cursor-pointer`}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-bone/40">Prix min (XOF)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-bone/40">Prix max (XOF)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy-deep transition hover:bg-gold-soft"
            >
              <Search size={15} />
              Filtrer
            </button>
            {hasFilters ? (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-bone/70 transition hover:border-white/30 hover:text-bone"
              >
                <RotateCcw size={13} />
                Réinitialiser
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}