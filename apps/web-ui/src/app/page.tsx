'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getToken } from '@/lib/api';

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');

  const load = async () => {
    const token = getToken();
    if (!token) return;
    const ws = await api('/workspaces', { token });
    setWorkspaces(ws);
    if (!workspaceId && ws.length) setWorkspaceId(ws[0].id);
    const prj = await api('/projects', { token });
    setProjects(prj);
  };

  useEffect(() => {
    void load();
  }, []);

  const createProject = async () => {
    const token = getToken();
    await api('/projects', { method: 'POST', token, body: { workspaceId, name } });
    setName('');
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">AtlasPM</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-xl">Workspace Switch</h2>
        <p className="text-slate-500">Current available workspaces</p>
        <ul className="mt-2 list-disc pl-6">
          {workspaces.map((w) => (
            <li key={w.id}>{w.name}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-xl">Projects</h2>
        <div className="my-3 grid gap-2 md:grid-cols-3">
          <input className="rounded border p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          <select className="rounded border p-2" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={createProject} data-testid="create-project-btn">
            Create Project
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link className="text-blue-700 underline" href={`/projects/${p.id}`}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Link className="text-blue-700 underline" href="/login">
        Login
      </Link>
    </div>
  );
}
