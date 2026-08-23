'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Pagination, StatusBadge } from '@/components/admin-ui';

interface AdminUser {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  country: string;
  roles: string[];
  status: string;
  sellerStatus: string;
  transactionCount: number;
  successfulSales: number;
  riskScore: number;
  createdAt: string;
}

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

export default function AdminUsersPage() {
  const [data, setData] = useState<{
    users: AdminUser[];
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await apiFetch<{ users: AdminUser[]; page: number; totalPages: number; total: number }>(
        `/api/v1/admin/users?${params.toString()}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(user: AdminUser, status: string) {
    setBusyId(user._id);
    setError('');
    try {
      await apiFetch(`/api/v1/admin/users/${user._id}/status`, { method: 'PATCH', json: { status } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Utilisateurs">
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Rechercher par email, username, nom…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-72 rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        >
          <option value="ALL">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {data && (
          <span className="self-center font-mono text-xs text-bone/40">{data.total} utilisateur(s)</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!data ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto overflow-hidden rounded-ticket border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
                <tr>
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Rôles</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Tx / Ventes</th>
                  <th className="px-4 py-3">Risque</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-bone/50">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                )}
                {data.users.map((u) => (
                  <tr key={u._id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <p className="text-bone">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="font-mono text-xs text-bone/40">{u.email}</p>
                      <p className="font-mono text-xs text-bone/30">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              r === 'ADMIN' || r === 'SUPER_ADMIN'
                                ? 'bg-gold/15 text-gold'
                                : 'bg-white/10 text-bone/60'
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-bone/60">
                      {u.transactionCount} tx · {u.successfulSales} ventes
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono text-xs ${
                          u.riskScore >= 50 ? 'text-coral' : u.riskScore >= 20 ? 'text-gold' : 'text-mint'
                        }`}
                      >
                        {u.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {u.status !== 'SUSPENDED' && (
                          <button
                            disabled={busyId === u._id}
                            onClick={() => setStatus(u, 'SUSPENDED')}
                            className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold hover:bg-gold/25 disabled:opacity-50"
                          >
                            Suspendre
                          </button>
                        )}
                        {u.status !== 'BANNED' && (
                          <button
                            disabled={busyId === u._id}
                            onClick={() => setStatus(u, 'BANNED')}
                            className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                          >
                            Bannir
                          </button>
                        )}
                        {u.status !== 'ACTIVE' && (
                          <button
                            disabled={busyId === u._id}
                            onClick={() => setStatus(u, 'ACTIVE')}
                            className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                          >
                            Réactiver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </AdminShell>
  );
}
