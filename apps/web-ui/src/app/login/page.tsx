'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <div className="mx-auto flex min-h-screen max-w-lg items-center">
      <div className="w-full rounded-lg border bg-card p-6">
        <h1 className="mb-1 text-xl font-semibold">Login</h1>
        <p className="mb-4 text-sm text-muted-foreground">Dev auth mode for local testing.</p>
        <div className="space-y-3">
          <Input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            placeholder="OIDC sub"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <Button onClick={login}>
            Dev Login
          </Button>
        </div>
      </div>
    </div>
  );
}
