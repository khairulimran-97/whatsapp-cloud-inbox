'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

const AUTH_KEY = 'app-authenticated';

export function useAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthenticated(localStorage.getItem(AUTH_KEY) === 'true');
  }, []);

  const login = useCallback(() => {
    localStorage.setItem(AUTH_KEY, 'true');
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setAuthenticated(false);
  }, []);

  return { authenticated, login, logout };
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <img src="/icon-192.png" alt="PPV Support" className="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-bold text-white">PPV Support</h1>
          <p className="mt-1 text-sm text-[#8696a0]">Enter password to continue</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8696a0]" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
              autoFocus
              className="w-full rounded-lg bg-[#1a1a1a] py-3 pl-10 pr-10 text-sm text-white placeholder-[#8696a0] outline-none ring-1 ring-[#333] focus:ring-[#2ecc71] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-white"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full rounded-lg bg-[#2ecc71] py-3 text-sm font-semibold text-white hover:bg-[#27ae60] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
