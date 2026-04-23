import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function StordLogo({ className = 'h-8' }) {
  return (
    <svg className={className} viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Stord">
      <text x="0" y="24" fontFamily="system-ui, -apple-system, sans-serif" fontSize="26" fontWeight="700" fill="currentColor">Stord</text>
    </svg>
  );
}

export default function CareersHub() {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    document.title = 'Careers — Stord';
    const meta = document.createElement('meta');
    meta.name    = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  useEffect(() => {
    fetch('/api/public/jobs')
      .then(r => r.json())
      .then(data => { setJobs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('Could not load jobs. Please try again.'); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* noindex handled server-side via robots.txt; belt-and-suspenders via helmet */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-violet-700">
            <StordLogo />
          </div>
          <span className="text-xs font-medium text-slate-500">Careers</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Open Positions</h1>
          <p className="text-slate-500 text-sm">Come build the future of supply chain with us.</p>
        </div>

        {loading && (
          <div className="text-slate-400 text-sm py-12 text-center">Loading…</div>
        )}

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="text-slate-400 text-sm py-12 text-center">No open positions right now — check back soon.</div>
        )}

        {!loading && jobs.length > 0 && (
          <ul className="space-y-3">
            {jobs.map(job => (
              <li key={job.public_token}>
                <Link
                  to={`/jobs/${job.public_token}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-violet-300 hover:shadow-sm transition-all group"
                >
                  <div>
                    <p className="font-semibold text-slate-800 group-hover:text-violet-700 transition-colors">{job.title}</p>
                    {job.department && (
                      <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>
                    )}
                  </div>
                  <span className="text-violet-500 text-sm font-medium shrink-0 ml-4">Apply →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="text-center text-xs text-slate-300 py-6">
        © {new Date().getFullYear()} Stord. All rights reserved.
      </footer>
    </div>
  );
}
