import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

/* ── Stord logo SVG (inline, no external dependency) ──────────── */
function StordLogo({ className = 'h-8' }) {
  return (
    <svg className={className} viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Stord">
      <text x="0" y="24" fontFamily="system-ui, -apple-system, sans-serif" fontSize="26" fontWeight="700" fill="currentColor">Stord</text>
    </svg>
  );
}

/* ── Render plain-text job description preserving line breaks ─── */
function JobDescription({ text }) {
  if (!text) return null;
  return (
    <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
      {text}
    </div>
  );
}

/* ── Apply form ───────────────────────────────────────────────── */
function ApplyForm({ token, jobTitle, onSuccess }) {
  const [form, setForm]       = useState({ first_name: '', last_name: '', email: '', linkedin_url: '' });
  const [resume, setResume]   = useState(null);
  const [error, setError]     = useState('');
  const [submitting, setSub]  = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSub(true);
    try {
      const fd = new FormData();
      fd.append('first_name',   form.first_name.trim());
      fd.append('last_name',    form.last_name.trim());
      fd.append('email',        form.email.trim());
      fd.append('linkedin_url', form.linkedin_url.trim());
      if (resume) fd.append('resume', resume);

      const res  = await fetch(`/api/public/jobs/${token}/apply`, { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      onSuccess();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSub(false);
    }
  };

  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">First Name <span className="text-red-500">*</span></label>
          <input required value={form.first_name} onChange={set('first_name')} className={inputCls} placeholder="Jane" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Last Name <span className="text-red-500">*</span></label>
          <input required value={form.last_name} onChange={set('last_name')} className={inputCls} placeholder="Smith" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Email Address <span className="text-red-500">*</span></label>
        <input required type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="jane@example.com" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn Profile <span className="text-slate-400 font-normal">(optional)</span></label>
        <input type="url" value={form.linkedin_url} onChange={set('linkedin_url')} className={inputCls} placeholder="https://linkedin.com/in/…" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Resume <span className="text-slate-400 font-normal">(PDF or Word, optional)</span></label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setResume(e.target.files?.[0] || null)}
          className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 cursor-pointer"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 px-6 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold rounded-lg transition-colors text-sm"
      >
        {submitting ? 'Submitting…' : `Apply for ${jobTitle}`}
      </button>
    </form>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function JobPosting() {
  const { token }              = useParams();
  const [job, setJob]          = useState(null);
  const [loading, setLoading]  = useState(true);
  const [notFound, setNotFound]= useState(false);
  const [applied, setApplied]  = useState(false);
  const [showForm, setShowForm]= useState(false);

  useEffect(() => {
    // Inject noindex so crawlers never index this page.
    const meta = document.createElement('meta');
    meta.name    = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  useEffect(() => {
    fetch(`/api/public/jobs/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return; }
        setJob(data);
        document.title = `${data.title} — Stord`;
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-3xl mx-auto text-violet-700">
            <StordLogo />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-4xl mb-4">404</p>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Job not found</h1>
            <p className="text-slate-500 text-sm">This link may have expired or the position is no longer posted.</p>
          </div>
        </div>
      </div>
    );
  }

  const isClosed = job.status !== 'open';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-violet-700">
            <StordLogo />
          </div>
          <span className="text-xs text-slate-400">Careers</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        {/* Job header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {job.department && (
              <span className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-100">
                {job.department}
              </span>
            )}
            {isClosed && (
              <span className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">
                Position Closed
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">{job.title}</h1>
          <p className="text-slate-500 text-sm">Stord · {job.department || 'All Departments'} · Full-time</p>
        </div>

        <div className={`grid gap-8 ${showForm && !isClosed ? 'grid-cols-1 lg:grid-cols-[1fr_380px]' : 'grid-cols-1'}`}>
          {/* Left: job description */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">About this role</h2>
            {job.job_description ? (
              <JobDescription text={job.job_description} />
            ) : (
              <p className="text-slate-400 text-sm italic">Job description coming soon.</p>
            )}

            {!isClosed && !showForm && !applied && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <button
                  onClick={() => setShowForm(true)}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Apply Now
                </button>
              </div>
            )}

            {isClosed && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <p className="text-slate-400 text-sm">This position is no longer accepting applications.</p>
              </div>
            )}
          </div>

          {/* Right: apply form (shown after clicking Apply Now) */}
          {showForm && !isClosed && !applied && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-5">Your Application</h2>
              <ApplyForm token={token} jobTitle={job.title} onSuccess={() => { setApplied(true); setShowForm(false); }} />
            </div>
          )}

          {/* Success state */}
          {applied && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Application received!</h3>
              <p className="text-slate-600 text-sm">
                Thank you for your interest in the <strong>{job.title}</strong> role at Stord.
                Our recruiting team will be in touch.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Stord, Inc. All rights reserved.</p>
          <p className="text-xs text-slate-400">Powered by GhostBuster</p>
        </div>
      </footer>
    </div>
  );
}
