import React, { useState } from 'react';
import { api } from '../api';

export default function HMLogin({ onAuthenticated }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.hmLogin(pin);
      if (res.success) {
        onAuthenticated();
      } else {
        setError(res.error || 'Invalid PIN');
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
          <h2 className="text-base font-semibold text-white mb-1">Sign in</h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter the access PIN provided by your recruiter.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Access PIN
              </label>
              <input
                autoFocus
                type="password"
                required
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Enter PIN"
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
              disabled={loading || !pin.trim()}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
