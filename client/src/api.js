const BASE = '/api';

async function req(url, opts = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

export const api = {
  // ── Candidates ──────────────────────────────────────────────
  getCandidates:      (stageId) => req(`/candidates${stageId ? `?stage_id=${stageId}` : ''}`),
  getReminders:       ()        => req('/candidates/reminders'),
  getCandidate:       (id)      => req(`/candidates/${id}`),
  createCandidate:    (data)    => req('/candidates',      { method: 'POST',   body: JSON.stringify(data) }),
  updateCandidate:    (id, data)=> req(`/candidates/${id}`,{ method: 'PUT',    body: JSON.stringify(data) }),
  deleteCandidate:    (id)      => req(`/candidates/${id}`,{ method: 'DELETE' }),
  acknowledgeCandidate:(id, data = {}) => req(`/candidates/${id}/acknowledge`, { method: 'POST', body: JSON.stringify(data) }),

  // Resume upload / delete / parse (multipart — cannot use the json req() helper)
  uploadResume: (id, file) => {
    const fd = new FormData();
    fd.append('resume', file);
    return fetch(`${BASE}/candidates/${id}/resume`, { method: 'POST', body: fd }).then(r => r.json());
  },
  deleteResume: (id) => req(`/candidates/${id}/resume`, { method: 'DELETE' }),
  parseResume: (file) => {
    const fd = new FormData();
    fd.append('resume', file);
    return fetch(`${BASE}/candidates/parse-resume`, { method: 'POST', body: fd }).then(r => r.json());
  },

  // Candidate ↔ Req junction
  getCandidateReqs:   (cid)     => req(`/candidates/${cid}/reqs`),
  setCandidateReqs:   (cid, ids)=> req(`/candidates/${cid}/reqs`, { method: 'PUT', body: JSON.stringify({ req_ids: ids }) }),

  // ── Stages ──────────────────────────────────────────────────
  getStages:   ()        => req('/stages'),
  createStage: (data)    => req('/stages',      { method: 'POST', body: JSON.stringify(data) }),
  updateStage: (id, data)=> req(`/stages/${id}`,{ method: 'PUT',  body: JSON.stringify(data) }),
  deleteStage: (id)      => req(`/stages/${id}`,{ method: 'DELETE' }),

  // ── Requisitions ─────────────────────────────────────────────
  getReqs:    ()        => req('/reqs'),
  createReq:  (data)    => req('/reqs',      { method: 'POST', body: JSON.stringify(data) }),
  updateReq:  (id, data)=> req(`/reqs/${id}`,{ method: 'PUT',  body: JSON.stringify(data) }),
  deleteReq:  (id)      => req(`/reqs/${id}`,{ method: 'DELETE' }),
};
