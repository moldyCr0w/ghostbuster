import React, { useState } from 'react';
import { api } from '../api';

export default function HMLogin({ onAuthenticated }) {
  // step: 'email' | 'pin'
  const [step, setStep]       = useState('email');
  const [email, setEmail]     = useState('');
  const [pin, setPin]         = useState('');
  const [devPin, setDevPin]   = useState('');   // shown when server returns pin directly (no email service yet)
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1 — request a PIN for this email
  const handleRequestPin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.hmRequest(email.trim().toLowerCase());
      if (res.error) {
        setError(res.error);
      } else {
        // In production the PIN would be emailed. For now the server returns it directly
        // so recruiters can share it over Slack / verbally.
        if (res.pin) setDevPin(res.pin);
        setStep('pin');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify the PIN
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.hmLogin(email.trim().toLowerCase(), pin.trim());
      if (res.success) {
        onAuthenticated();
      } else {
        setError(res.error || 'Invalid or expired PIN');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">&#128123;</div>
          <h1 className="text-2xl font-bold text-white">GhostBuster</h1>
          <p className="text-slate-400 text-sm mt-1">Hiring Manager Portal</p>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl p-8">

          {step === 'email' ? (
            /* ── Step 1: enter email ── */
            <>
              <h2 className="text-base font-semibold text-white mb-1">Sign in</h2>
              <p className="text-slate-400 text-sm mb-6">
                Enter your work email and we'll generate a one-time PIN.
              </p>
              <form onSubmit={handleRequestPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Work Email
                  </label>
                  <input
                    autoFocus
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-xs bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send PIN'}
                </button>
              </form>
            </>
          ) : (
            /* ── Step 2: enter PIN ── */
            <>
              <h2 className="text-base font-semibold text-white mb-1">Enter your PIN</h2>
              <p className="text-slate-400 text-sm mb-2">
                A 6-digit PIN was generated for{' '}
                <span className="text-slate-200 font-medium">{email}</span>.
              </p>
              <p className="text-slate-500 text-xs mb-5">
                Your recruiter will share it with you — it expires in 10 minutes.
              </p>

              {/* Dev/demo callout: PIN displayed inline since there's no email service yet */}
              {devPin && (
                <div className="mb-5 p-3 bg-amber-900/40 border border-amber-700 rounded-lg">
                  <p className="text-xs text-amber-400 font-medium mb-1">One-time PIN (share securely)</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-amber-300">{devPin}</p>
                </div>
              )}

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    6-Digit PIN
                  </label>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono tracking-widest text-center text-lg"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-xs bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || pin.length < 6}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setPin(''); setDevPin(''); setError(''); }}
                  className="w-full py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors"
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
