/**
 * Client cho API lich / menh ly cua Huyen Minh (huyenminh.com.vn).
 *
 * API mien phi, khong can key, khong rate limit. Doi lai co nghia vu ghi nguon
 * cho nguoi doc (BR-10) va giu dung `ranh_gioi` khi thuat lai noi dung.
 *
 * Tham so cua tung endpoint KHAC NHAU:
 *   /api/ngay      -> d, m, y   (ngay DUONG lich)
 *   /api/khunggio  -> d, m, y   (ngay DUONG lich)
 *   /api/hoagiap   -> nam       (nam sinh)
 *
 * Bay da xac nhan: /api/hoagiap truyen sai ten tham so (y=, tuoi=, nam_sinh=)
 * thi API KHONG bao loi ma im lang tra ve nam hien tai. Vi vay BR-02 bat buoc
 * assert lai can_chi bang cong thuc local truoc khi dung.
 */

import { canChiFromYear } from './canchi.js';

const BASE_URL = 'https://huyenminh.com.vn/api';
const TIMEOUT_MS = 8000; // BR-12
const RETRIES = 1; // BR-12: 1 lan retry khi loi mang hoac 5xx

export class CalendarApiError extends Error {
  constructor(message, { endpoint, httpStatus = null, cause = null } = {}) {
    super(message);
    this.name = 'CalendarApiError';
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

export class CalendarTimeoutError extends CalendarApiError {
  constructor(endpoint) {
    super(`Timeout sau ${TIMEOUT_MS}ms khi goi ${endpoint}`, { endpoint });
    this.name = 'CalendarTimeoutError';
  }
}

export class CanChiAssertError extends Error {
  constructor({ birthYear, computed, apiReturned }) {
    super(`Can Chi khong khop cho nam ${birthYear}: cong thuc="${computed}", API="${apiReturned}"`);
    this.name = 'CanChiAssertError';
    this.birthYear = birthYear;
    this.computed = computed;
    this.apiReturned = apiReturned;
  }
}

/**
 * Goi mot endpoint, retry 1 lan khi loi mang hoac 5xx.
 * Timeout KHONG retry - de tong thoi gian khong vuot ngan sach BR-12.
 */
/**
 * Doc dau moi tu response loi de biet ai chan: Cloudflare WAF hay chinh API.
 * WAF tra HTML kem cf-ray/cf-mitigated; loi nghiep vu cua API tra JSON.
 */
async function describeErrorResponse(res) {
  const parts = [`HTTP ${res.status}`];
  for (const name of ['content-type', 'cf-ray', 'cf-mitigated', 'retry-after']) {
    const value = res.headers?.get?.(name);
    if (value) parts.push(`${name}=${value}`);
  }
  let snippet = '';
  try {
    snippet = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch (err) {
    snippet = `khong doc duoc body: ${err.message}`;
  }
  if (snippet) parts.push(`body="${snippet}"`);
  return parts.join(' ');
}

async function fetchJson(endpoint, params, { fetchImpl = globalThis.fetch } = {}) {
  const url = `${BASE_URL}/${endpoint}?${new URLSearchParams(params)}`;
  let lastError = null;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new CalendarTimeoutError(endpoint);
      }
      lastError = new CalendarApiError(`Loi mang khi goi ${endpoint}: ${err.message}`, {
        endpoint,
        cause: err,
      });
      continue;
    }

    if (res.status >= 500) {
      lastError = new CalendarApiError(`${endpoint} tra ve ${await describeErrorResponse(res)}`, {
        endpoint,
        httpStatus: res.status,
      });
      continue;
    }
    if (!res.ok) {
      throw new CalendarApiError(`${endpoint} tra ve ${await describeErrorResponse(res)}`, {
        endpoint,
        httpStatus: res.status,
      });
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new CalendarApiError(`${endpoint} tra ve JSON khong doc duoc`, {
        endpoint,
        cause: err,
      });
    }

    // API tra loi nghiep vu trong field `loi` voi HTTP 200
    if (body?.loi) {
      throw new CalendarApiError(`${endpoint}: ${body.loi}`, { endpoint });
    }
    return body;
  }

  throw lastError ?? new CalendarApiError(`${endpoint} that bai`, { endpoint });
}

function requireFields(body, paths, endpoint) {
  for (const path of paths) {
    let cur = body;
    for (const key of path.split('.')) {
      cur = cur?.[key];
    }
    if (cur === undefined || cur === null) {
      throw new CalendarApiError(`${endpoint} thieu field bat buoc "${path}"`, { endpoint });
    }
  }
}

/** Thong tin ngay duong lich: can chi, am lich, truc, 28 tu, gio hoang dao. */
export async function getDay({ day, month, year }, opts = {}) {
  const body = await fetchJson('ngay', { d: day, m: month, y: year }, opts);
  requireFields(
    body,
    ['can_chi.ngay', 'am_lich', 'thu', 'truc', 'nhi_thap_bat_tu', 'gio.hoang_dao', 'gio.hac_dao'],
    'ngay',
  );
  return body;
}

/** 12 canh gio + Thap Than cua tung gio theo tung nhat chu. */
export async function getHourFrames({ day, month, year }, opts = {}) {
  const body = await fetchJson('khunggio', { d: day, m: month, y: year }, opts);
  requireFields(body, ['canh_gio', 'thap_than_theo_nhat_chu'], 'khunggio');
  if (!Array.isArray(body.canh_gio) || body.canh_gio.length !== 12) {
    throw new CalendarApiError('khunggio: canh_gio phai co dung 12 phan tu', {
      endpoint: 'khunggio',
    });
  }
  return body;
}

/**
 * Nap am + menh ngu hanh theo nam sinh.
 * BR-02: assert can_chi API tra ve khop cong thuc local, lech thi nem loi.
 */
export async function getHoaGiap(birthYear, opts = {}) {
  const body = await fetchJson('hoagiap', { nam: birthYear }, opts);
  requireFields(body, ['can_chi', 'can', 'chi', 'nap_am', 'hanh_nap_am'], 'hoagiap');

  const computed = canChiFromYear(birthYear).canChi;
  if (body.can_chi !== computed) {
    throw new CanChiAssertError({
      birthYear,
      computed,
      apiReturned: body.can_chi,
    });
  }
  return body;
}

/** Cau ghi nguon + ranh gioi noi dung do chinh API cung cap. */
export function extractSourceNotice(body) {
  return {
    credit: body?.nguon?.ghi_nguon ?? 'Nguồn: Huyền Minh — huyenminh.com.vn',
    boundary: body?.nguon?.ranh_gioi ?? '',
  };
}

/** Goi song song ca 3 endpoint (BR-12). */
export async function fetchAll({ birthYear, day, month, year }, opts = {}) {
  const [hoaGiap, dayInfo, hourFrames] = await Promise.all([
    getHoaGiap(birthYear, opts),
    getDay({ day, month, year }, opts),
    getHourFrames({ day, month, year }, opts),
  ]);
  return { hoaGiap, dayInfo, hourFrames, source: extractSourceNotice(dayInfo) };
}
