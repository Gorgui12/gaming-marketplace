'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface CampaignRow {
  campaign: {
    _id: string;
    name: string;
    utmSource?: string;
    utmMedium?: string;
    status: string;
  };
  clicks: number;
}

export default function AdminCampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ campaigns: CampaignRow[] }>('/api/v1/admin/affiliate-campaigns')
      .then((d) => setRows(d.campaigns))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'));
  }, []);

  return (
    <AdminShell title="Campagnes affiliées">
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}
      {!rows ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-bone/50">Aucune campagne créée pour l&apos;instant.</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Campagne</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Clics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ campaign, clicks }) => (
                <tr key={campaign._id} className="border-t border-white/5">
                  <td className="px-4 py-3">{campaign.name}</td>
                  <td className="px-4 py-3 text-bone/60">
                    {campaign.utmSource ?? '—'} {campaign.utmMedium ? `/ ${campaign.utmMedium}` : ''}
                  </td>
                  <td className="px-4 py-3">{campaign.status}</td>
                  <td className="px-4 py-3">{clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
