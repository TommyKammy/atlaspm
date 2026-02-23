'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [sub, setSub] = useState('dev-user-1');
  const [email, setEmail] = useState('dev@example.com');

  const login = async () => {
    const endpoint = process.env.NEXT_PUBLIC_DEV_TOKEN_ENDPOINT;
    const enabled = process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED === 'true';
    if (!enabled || !endpoint) return;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sub, email, name: sub }),
    });
    const data = await res.json();
    setToken(data.token);
    router.push('/');
  };

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="mb-4 text-2xl font-semibold">Login</h1>
      <div className="space-y-3">
        <input
          className="w-full rounded border p-2"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          placeholder="OIDC sub"
        />
        <input
          className="w-full rounded border p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={login}>
          Dev Login
        </button>
      </div>
    </div>
  );
}
