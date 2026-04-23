/**
 * Workday Recruiting REST API client.
 *
 * Auth: OAuth 2.0 Authorization Code — uses a refresh token to obtain
 * short-lived access tokens (no user interaction required at runtime).
 *
 * Required env vars:
 *   WORKDAY_CLIENT_ID       — API client ID from Workday tenant setup
 *   WORKDAY_CLIENT_SECRET   — API client secret
 *   WORKDAY_REFRESH_TOKEN   — long-lived refresh token issued by Workday admin
 *   WORKDAY_TOKEN_URL       — e.g. https://<host>/ccx/oauth2/<tenant>/token
 *   WORKDAY_API_BASE_URL    — e.g. https://<host>/ccx/api/recruiting/v2/<tenant>
 */

const fs   = require('fs');
const path = require('path');

// ── Token cache (in-process) ─────────────────────────────────────────────────

let _cachedToken  = null;
let _tokenExpiry  = 0;

async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 30_000) {
    return _cachedToken;
  }

  const { WORKDAY_CLIENT_ID, WORKDAY_CLIENT_SECRET, WORKDAY_REFRESH_TOKEN, WORKDAY_TOKEN_URL } = process.env;
  if (!WORKDAY_CLIENT_ID || !WORKDAY_CLIENT_SECRET || !WORKDAY_REFRESH_TOKEN || !WORKDAY_TOKEN_URL) {
    throw new Error('Workday env vars not configured (WORKDAY_CLIENT_ID, WORKDAY_CLIENT_SECRET, WORKDAY_REFRESH_TOKEN, WORKDAY_TOKEN_URL)');
  }

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: WORKDAY_REFRESH_TOKEN,
    client_id:     WORKDAY_CLIENT_ID,
    client_secret: WORKDAY_CLIENT_SECRET,
  });

  const res = await fetch(WORKDAY_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Workday token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedToken = data.access_token;
  // expires_in is in seconds; fall back to 1 hour if not present
  _tokenExpiry = Date.now() + ((data.expires_in ?? 3600) * 1000);
  return _cachedToken;
}

// ── Base request helper ──────────────────────────────────────────────────────

async function wdFetch(urlPath, opts = {}) {
  const base = process.env.WORKDAY_API_BASE_URL;
  if (!base) throw new Error('WORKDAY_API_BASE_URL is not configured');

  const token = await getToken();
  const url   = `${base.replace(/\/$/, '')}/${urlPath.replace(/^\//, '')}`;

  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Workday API error ${res.status} ${res.statusText}: ${text}`);
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {};
  return res.json();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Test connectivity. Returns { ok: true, tenant: '...' } or throws.
 */
async function testConnection() {
  await getToken();
  // Lightweight ping — just validate we can get a token; no API call needed
  // to avoid requiring specific Workday scopes during a status check.
  return { ok: true };
}

/**
 * Look up a candidate in Workday by email address.
 * Returns the first matching candidateProfile object, or null.
 */
async function findCandidateByEmail(email) {
  const data = await wdFetch(`candidateProfiles?email=${encodeURIComponent(email)}&limit=1`);
  const items = data?.data ?? data?.candidateProfiles ?? [];
  return items.length > 0 ? items[0] : null;
}

/**
 * Create a new candidate profile in Workday.
 *
 * @param {object} candidate  — row from the candidates table (with first_name, last_name, email, linkedin_url)
 * @returns {string}          — Workday candidate ID
 */
async function createCandidate(candidate) {
  const body = {
    applicant: {
      firstName: candidate.first_name || candidate.name || '',
      lastName:  candidate.last_name  || '',
      email:     candidate.email      || '',
    },
  };

  if (candidate.linkedin_url) {
    body.applicant.links = [{ url: candidate.linkedin_url, linkType: { id: 'LinkedIn' } }];
  }

  const data = await wdFetch('candidateProfiles', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  // Workday typically returns { id: '...', ... } at the root or nested
  const wdId = data?.id ?? data?.candidateProfile?.id ?? data?.data?.id;
  if (!wdId) throw new Error('Workday did not return a candidate ID in the response');
  return wdId;
}

/**
 * Upload a resume file to an existing Workday candidate profile.
 *
 * @param {string} wdCandidateId — Workday candidate profile ID
 * @param {string} filePath      — absolute path to the resume file on disk
 * @param {string} originalName  — original filename (e.g. "Jane_Doe_Resume.pdf")
 */
async function uploadResume(wdCandidateId, filePath, originalName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Resume file not found at path: ${filePath}`);
  }

  const token = await getToken();
  const base  = process.env.WORKDAY_API_BASE_URL.replace(/\/$/, '');
  const url   = `${base}/candidateProfiles/${wdCandidateId}/documents`;

  const fileBuffer = fs.readFileSync(filePath);
  const ext        = path.extname(originalName).toLowerCase();
  const mimeType   = ext === '.pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Workday expects multipart/form-data with the file under the key "file"
  // and a JSON metadata part. We build a raw multipart body.
  const boundary = `--WDBoundary${Date.now()}`;
  const CRLF     = '\r\n';

  const metaPart = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="descriptor"',
    'Content-Type: application/json',
    '',
    JSON.stringify({ fileName: originalName, fileType: { id: 'Resume' } }),
  ].join(CRLF);

  const filePart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${originalName}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join(CRLF);

  const closing = `${CRLF}--${boundary}--`;

  const metaBuf = Buffer.from(metaPart + CRLF + CRLF + filePart, 'utf8');
  const endBuf  = Buffer.from(closing, 'utf8');
  const combined = Buffer.concat([metaBuf, fileBuffer, endBuf]);

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: combined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resume upload failed (${res.status}): ${text}`);
  }

  return true;
}

/**
 * Create a job application linking a Workday candidate to a Workday requisition.
 *
 * @param {string} wdCandidateId — Workday candidate profile ID
 * @param {string} wdReqId       — Workday job requisition ID (e.g. "JR000001")
 * @returns {string}             — Workday job application ID
 */
async function createJobApplication(wdCandidateId, wdReqId) {
  const body = {
    candidateProfile: { id: wdCandidateId },
    jobRequisition:   { id: wdReqId },
    // source indicates this was submitted via API integration
    source:           { id: 'Agency' },
  };

  const data = await wdFetch('jobApplications', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const appId = data?.id ?? data?.jobApplication?.id ?? data?.data?.id;
  if (!appId) throw new Error('Workday did not return a job application ID in the response');
  return appId;
}

module.exports = { testConnection, findCandidateByEmail, createCandidate, uploadResume, createJobApplication };
