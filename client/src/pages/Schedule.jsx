import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

function fmtDayKey(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export default function Schedule() {
  const { token } = useParams();

  const [info, setInfo]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [confirming, setConfirming] = useState(null); // ISO slot
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [booking, setBooking]       = useState(false);
  const [bookError, setBookError]   = useState('');
  const [booked, setBooked]         = useState(null); // { meet_link, event_start }

  useEffect(() => {
    fetch(`/api/schedule/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else { setInfo(data); }
      })
      .catch(() => setError('Failed to load scheduling link.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleBook = async () => {
    setBookError('');
    setBooking(true);
    try {
      const res = await fetch(`/api/schedule/${token}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_start: confirming, candidate_name: name, candidate_email: email }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setBookError(data.error || 'Booking failed. Please try again.'); }
      else { setBooked(data); }
    } catch { setBookError('Network error. Please try again.'); }
    setBooking(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Link not found</h1>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Already booked screen
  if (info.status === 'booked' || booked) {
    const es = booked?.event_start || info.event_start;
    const ml = booked?.meet_link   || info.meet_link;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <p className="text-5xl mb-4">🎉</p>
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            {booked ? "You're confirmed!" : "Interview already scheduled"}
          </h1>
          {es && (
            <p className="text-slate-600 text-sm mb-4">
              {fmtDate(es)} at {fmtTime(es)}
            </p>
          )}
          {ml && (
            <a
              href={ml}
              target="_blank"
              rel="noreferrer"
              className="inline-block w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Join Google Meet
            </a>
          )}
        </div>
      </div>
    );
  }

  // Group slots by day
  const slots = info.slots || [];
  const byDay = {};
  slots.forEach(s => {
    const day = fmtDayKey(s);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s);
  });
  const days = Object.keys(byDay).sort();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800">
            {info.interview_title || 'Schedule Your Interview'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {info.duration_mins} min · Pick a time that works for you
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">

          {slots.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">
              No available slots at the moment. Please contact your recruiter.
            </p>
          )}

          {slots.length > 0 && !confirming && (
            <>
              {/* Day selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Select a day</p>
                <div className="flex flex-wrap gap-2">
                  {days.map(day => (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        selectedDay === day
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time slots */}
              {selectedDay && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                    {new Date(selectedDay + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(byDay[selectedDay] || []).map(slot => (
                      <button
                        key={slot}
                        onClick={() => setConfirming(slot)}
                        className="py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-sm font-medium rounded-xl transition-colors"
                      >
                        {fmtTime(slot)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Confirmation panel */}
          {confirming && (
            <div className="space-y-3">
              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-blue-800">{fmtDate(confirming)}</p>
                <p className="text-sm text-blue-700">{fmtTime(confirming)} · {info.duration_mins} min</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Your email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {bookError && <p className="text-xs text-red-600">{bookError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleBook}
                  disabled={booking || !name.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {booking ? 'Confirming…' : 'Confirm Interview'}
                </button>
                <button
                  onClick={() => { setConfirming(null); setBookError(''); }}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
