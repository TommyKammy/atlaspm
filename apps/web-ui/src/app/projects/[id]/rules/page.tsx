'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, getToken } from '@/lib/api';

export default function RulesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [rules, setRules] = useState<any[]>([]);
  const token = getToken();

  const load = async () => {
    const data = await api(`/projects/${projectId}/rules`, { token });
    setRules(data);
  };

  useEffect(() => {
    if (!projectId) return;
    void load();
  }, [projectId]);

  if (!projectId) return <div>Loading...</div>;

  const toggle = async (rule: any) => {
    await api(`/rules/${rule.id}/${rule.enabled ? 'disable' : 'enable'}`, { method: 'POST', token });
    await load();
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Rules</h1>
      {rules.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded border bg-white p-3">
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-sm text-slate-500">template: {r.templateKey}</div>
          </div>
          <button className="rounded border px-3 py-1" onClick={() => void toggle(r)}>
            {r.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      ))}
    </div>
  );
}
