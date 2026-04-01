import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate          = useNavigate();
  const { setUser }       = useAuth();

  const [step, setStep]   = useState('email'); // 'email' | 'pin'
  const [email, setEmail] = useState('');
  const [pin, setPin]     = useState('');
  const [devPin, setDevPin] = useState('');   // shown on-screen until email is wired up
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestPin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      setDevPin(data.pin); // displayed until email delivery is wired up
      setStep('pin');
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  const verifyPin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid PIN'); return; }
      setUser(data.user);
      navigate('/', { replace: true });
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👻</div>
          <h1 className="text-2xl font-bold text-slate-800">GhostBuster</h1>
          <p className="text-slate-400 text-sm mt-1">Hiring Funnel Reminders</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {step === 'email' ? (
            <>
              <h2 className="text-base font-semibold text-slate-700 mb-1">Sign in</h2>
              <p className="text-slate-400 text-sm mb-6">
                Enter your work email and we'll send you a one-time PIN.
              </p>
              <form onSubmit={requestPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Email address</label>
                  <input
                    autoFocus
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {error && <p className="text-red-600 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send PIN'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-700 mb-1">Enter your PIN</h2>
              <p className="text-slate-400 text-sm mb-2">
                A 6-digit PIN was generated for <strong className="text-slate-600">{email}</strong>.
              </p>

              {/* Dev mode: show the PIN on screen until email is wired up */}
              {devPin && (
                <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-700 mb-0.5">Dev mode — PIN delivered here</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-amber-800">{devPin}</p>
                  <p className="text-xs text-amber-600 mt-1">Expires in 10 minutes. In production this would be emailed.</p>
                </div>
              )}

              <form onSubmit={verifyPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">6-digit PIN</label>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {error && <p className="text-red-600 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || pin.length !== 6}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setPin(''); setDevPin(''); setError(''); }}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ← Use a different email
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
