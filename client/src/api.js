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

  // HM view — append a note without a login session
  addHmNote: (id, note, author) => req(`/candidates/${id}/hm-note`, {
    method: 'PATCH',
    body: JSON.stringify({ note, author }),
  }),

  // HM view — forward or decline a candidate (no auth required)
  hmDecision: (id, decision) => req(`/candidates/${id}/hm-decision`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  }),

  // Candidate ↔ Req junction
  getCandidateReqs:   (cid)     => req(`/candidates/${cid}/reqs`),
  setCandidateReqs:   (cid, ids)=> req(`/candidates/${cid}/reqs`, { method: 'PUT', body: JSON.stringify({ req_ids: ids }) }),

  // ── Stages ──────────────────────────────────────────────────
  getStages:   ()        => req('/stages'),
  createStage: (data)    => req('/stages',      { method: 'POST', body: JSON.stringify(data) }),
  updateStage: (id, data)=> req(`/stages/${id}`,{ method: 'PUT',  body: JSON.stringify(data) }),
  deleteStage: (id)      => req(`/stages/${id}`,{ method: 'DELETE' }),

  // ── Video screen notes ──────────────────────────────────────
  getVideoNotes:  (candId)       => req(`/candidates/${candId}/video-notes`),
  addVideoNote:   (candId, data) => req(`/candidates/${candId}/video-notes`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Candidate scores ──────────────────────────────────────
  getCandidateScores: (candId, reqId) => req(`/candidates/${candId}/scores?req_id=${reqId}`),
  saveCandidateScores:(candId, data)  => req(`/candidates/${candId}/scores`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── Requisitions ─────────────────────────────────────────────
  getReqs:    ()        => req('/reqs'),
  createReq:  (data)    => req('/reqs',      { method: 'POST', body: JSON.stringify(data) }),
  updateReq:  (id, data)=> req(`/reqs/${id}`,{ method: 'PUT',  body: JSON.stringify(data) }),
  deleteReq:  (id)      => req(`/reqs/${id}`,{ method: 'DELETE' }),

  // ── Scorecard criteria ─────────────────────────────────────
  getScorecard:     (reqId)            => req(`/reqs/${reqId}/scorecard`),
  addCriterion:     (reqId, data)      => req(`/reqs/${reqId}/scorecard`, { method: 'POST', body: JSON.stringify(data) }),
  updateCriterion:  (reqId, cid, data) => req(`/reqs/${reqId}/scorecard/${cid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCriterion:  (reqId, cid)       => req(`/reqs/${reqId}/scorecard/${cid}`, { method: 'DELETE' }),

  // ── Users (admin) ────────────────────────────────────────────
  getUsers:    ()        => req('/users'),
  createUser:  (data)    => req('/users',      { method: 'POST',   body: JSON.stringify(data) }),
  deleteUser:  (id)      => req(`/users/${id}`,{ method: 'DELETE' }),

  // ── Notifications ─────────────────────────────────────────────
  getNotifications:  ()    => req('/notifications'),
  getUnreadCount:    ()    => req('/notifications/unread-count'),
  markRead:          (id)  => req(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead:       ()    => req('/notifications/read-all',   { method: 'PATCH' }),

  // ── HM portal auth ────────────────────────────────────────────
  hmMe:     ()      => req('/auth/hm-me'),
  hmLogin:  (pin)   => req('/auth/hm-login',  { method: 'POST', body: JSON.stringify({ pin }) }),
  hmLogout: ()      => req('/auth/hm-logout', { method: 'POST' }),

  // ── Settings ──────────────────────────────────────────────────
  getSettings: ()    => req('/settings'),
  setHmPin:    (pin) => req('/settings/hm-pin', { method: 'PUT',    body: JSON.stringify({ pin }) }),
  deleteHmPin: ()    => req('/settings/hm-pin', { method: 'DELETE' }),
};
