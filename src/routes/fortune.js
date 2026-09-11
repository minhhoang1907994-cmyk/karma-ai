/**
 * POST /api/fortune - endpoint duy nhat sinh ket qua 2 phan.
 *
 * Luong theo spec section 7: validate -> goi 3 endpoint lich song song ->
 * assert Can Chi -> tinh local -> Gemini text -> 2 anh song song -> tra 200.
 */

import express from 'express';
import { canChiFromYear } from '../lib/canchi.js';
import {
  fetchAll,
  CalendarTimeoutError,
  CalendarApiError,
  CanChiAssertError,
} from '../lib/calendar.js';
import { buildComputedData, AREA_KEYS } from '../lib/compute.js';
import {
  generateText,
  generateImages,
  buildImagePrompt,
  buildVideoPrompt,
  GeminiQuotaError,
  GeminiTimeoutError,
  imageMode,
} from '../lib/gemini.js';

/** BR-18: nguyen van, hien duoi ket qua truoc credit Huyen Minh. */
const DISCLAIMER =
  'Nội dung mang tính tham khảo, thuộc văn hóa dân gian — không phải lời khuyên y tế, tài chính hay pháp lý.';

const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2100;

function fail(res, httpStatus, code, message, extra = {}) {
  return res.status(httpStatus).json({ error: { code, message, ...extra } });
}

/** Validate 3 scalar dau vao. Tra { ok, value } hoac { ok: false, message }. */
export function validateRequest(body) {
  const birthYear = Number(body?.birthYear);
  if (!Number.isInteger(birthYear) || birthYear < MIN_BIRTH_YEAR || birthYear > MAX_BIRTH_YEAR) {
    return { ok: false, message: `birthYear phải là số nguyên trong khoảng ${MIN_BIRTH_YEAR}–${MAX_BIRTH_YEAR}` };
  }

  const gender = body?.gender;
  if (gender !== 'male' && gender !== 'female') {
    return { ok: false, message: 'gender phải là "male" hoặc "female"' };
  }

  const date = body?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: 'date phải có dạng YYYY-MM-DD' };
  }
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return { ok: false, message: `date "${date}" không phải ngày tồn tại trên lịch` };
  }

  return { ok: true, value: { birthYear, gender, date, day: d, month: m, year: y } };
}

/**
 * Ghep 2 phan output tu ComputedData + van ban Gemini + 2 anh.
 * BR-13: ranh gioi phan la co dinh - part1 = 7 muc ve ngay, part2 = tu vi 4 mang.
 * Khong bao gio dao hay gop muc giua hai phan.
 */
function assembleParts({ computed, text, images }) {
  const menh = computed.person.menh;
  const verdict = computed.verdict;

  const prompts = [false, true].map((isPart2) => {
    const src = isPart2 ? text.part2 : text.part1;
    return {
      imagePrompt: buildImagePrompt({
        menh,
        title: src.imageTitle,
        bullets: src.imageBullets,
        isPart2,
        verdict,
      }),
      video: buildVideoPrompt({
        menh,
        mood: src.videoMood,
        voice: src.voice,
        isPart2,
        verdict,
      }),
    };
  });

  const areas = {};
  for (const key of AREA_KEYS) {
    const computedArea = computed.fourAreas[key];
    areas[key] = {
      source: computedArea.source,
      tone: computedArea.tone,
      text: computedArea.tone === 'neutral'
        ? computedArea.neutralText
        : (text.part2.areaTexts?.[key] ?? ''),
    };
  }

  return {
    part1: {
      fullText: text.part1.fullText,
      imagePrompt: prompts[0].imagePrompt,
      videoPrompt: prompts[0].video.english,
      videoPromptVi: prompts[0].video.vietnamese,
      image: images[0],
    },
    part2: {
      fullText: text.part2.fullText,
      closingLine: text.part2.closingLine,
      areas,
      imagePrompt: prompts[1].imagePrompt,
      videoPrompt: prompts[1].video.english,
      videoPromptVi: prompts[1].video.vietnamese,
      image: images[1],
    },
  };
}

export function createFortuneRouter({ deps = {} } = {}) {
  const router = express.Router();
  const calendar = deps.fetchAll ?? fetchAll;
  const text = deps.generateText ?? generateText;
  const imaging = deps.generateImages ?? generateImages;

  router.post('/fortune', async (req, res) => {
    const requestId = Math.random().toString(36).slice(2, 10);

    const validation = validateRequest(req.body);
    if (!validation.ok) {
      console.warn(`[${requestId}] VALIDATION_ERROR: ${validation.message}`);
      return fail(res, 400, 'VALIDATION_ERROR', 'Dữ liệu đầu vào không hợp lệ');
    }
    const { birthYear, gender, date, day, month, year } = validation.value;
    console.info(`[${requestId}] request birthYear=${birthYear} gender=${gender} date=${date}`);

    // 1) Du lieu lich - 3 endpoint song song
    let api;
    try {
      const t0 = Date.now();
      api = await calendar({ birthYear, day, month, year });
      console.info(`[${requestId}] calendar ok in ${Date.now() - t0}ms`);
    } catch (err) {
      if (err instanceof CanChiAssertError) {
        console.error(
          `[${requestId}] CANCHI_ASSERT_FAILED birthYear=${err.birthYear} computed=${err.computed} api=${err.apiReturned}`,
        );
        return fail(res, 422, 'CANCHI_ASSERT_FAILED', 'Không xác nhận được Can Chi năm sinh');
      }
      if (err instanceof CalendarTimeoutError) {
        console.error(`[${requestId}] UPSTREAM_TIMEOUT ${err.endpoint}`);
        return fail(res, 504, 'UPSTREAM_TIMEOUT', 'Nguồn dữ liệu phản hồi quá chậm');
      }
      if (err instanceof CalendarApiError) {
        console.error(`[${requestId}] CALENDAR_API_FAILED ${err.endpoint}: ${err.message}`);
        return fail(res, 502, 'CALENDAR_API_FAILED', 'Không lấy được dữ liệu lịch');
      }
      console.error(`[${requestId}] CALENDAR_API_FAILED khong ro: ${err.message}`);
      return fail(res, 502, 'CALENDAR_API_FAILED', 'Không lấy được dữ liệu lịch');
    }

    // 2) Tinh toan local - moi ket luan quyet dinh o day
    let computed;
    try {
      computed = buildComputedData({ birthYear, gender, date, ...api });
    } catch (err) {
      console.error(`[${requestId}] CALENDAR_API_FAILED khi tinh toan: ${err.message}`);
      return fail(res, 502, 'CALENDAR_API_FAILED', 'Không lấy được dữ liệu lịch');
    }

    // 3) Gemini text - chi dien dat
    let written;
    try {
      const t0 = Date.now();
      written = await text(computed, { boundary: api.source.boundary });
      console.info(`[${requestId}] text ok in ${Date.now() - t0}ms`);
    } catch (err) {
      if (err instanceof GeminiQuotaError) {
        console.error(`[${requestId}] UPSTREAM_QUOTA_EXCEEDED`);
        return fail(res, 429, 'UPSTREAM_QUOTA_EXCEEDED', 'Quota Gemini đã cạn, thử lại sau', {
          retryAfterSeconds: err.retryAfterSeconds ?? null,
        });
      }
      if (err instanceof GeminiTimeoutError) {
        console.error(`[${requestId}] UPSTREAM_TIMEOUT gemini text`);
        return fail(res, 504, 'UPSTREAM_TIMEOUT', 'Nguồn dữ liệu phản hồi quá chậm');
      }
      console.error(`[${requestId}] TEXT_GENERATION_FAILED: ${err.message}`);
      return fail(res, 502, 'TEXT_GENERATION_FAILED', 'Không sinh được nội dung luận giải');
    }

    // 4) Hai anh song song - loi anh khong lam fail request (BR-11)
    const menh = computed.person.menh;
    const imagePrompts = [false, true].map((isPart2) => {
      const src = isPart2 ? written.part2 : written.part1;
      return buildImagePrompt({
        menh,
        title: src.imageTitle,
        bullets: src.imageBullets,
        isPart2,
        verdict: computed.verdict,
      });
    });

    const t0 = Date.now();
    const images = await imaging(imagePrompts);
    images.forEach((img, i) => {
      if (img.status === 'fallback') {
        console.warn(`[${requestId}] image fallback part${i + 1}: ${img.reason}`);
      }
    });
    console.info(`[${requestId}] images (mode=${imageMode()}) done in ${Date.now() - t0}ms`);

    const parts = assembleParts({ computed, text: written, images });

    return res.json({
      data: {
        meta: {
          person: {
            birthYear,
            canChi: computed.person.canChi,
            napAm: computed.person.napAm,
            menh: computed.person.menh,
            gender,
          },
          day: {
            solar: computed.day.solar,
            lunar: computed.day.lunar,
            weekday: computed.day.weekday,
            canChi: computed.day.canChi,
            napAm: computed.day.napAm,
          },
          dayThapThan: computed.relation.dayThapThan,
          dayTangCanThapThan: computed.relation.tangCanThapThan.map((t) => t.thapThan),
          bestHours: computed.bestHours,
          bestHoursFallback: computed.bestHoursFallback,
          verdictScore: computed.verdictScore,
          verdict: computed.verdict,
          // BR-04: bat buoc noi ro Tier A la ban gian luoc
          simplifiedMethodNote:
            `Thập Thần lấy gốc là Can năm sinh "${computed.person.can}" — bản giản lược, không phải nhật chủ Bát Tự chuẩn.`,
          imageMode: imageMode(),
          credit: api.source.credit,
          disclaimer: DISCLAIMER,
        },
        ...parts,
      },
    });
  });

  /** Tra Can Chi tu nam sinh - de form hien read-only ngay khi chon nam. */
  router.get('/canchi/:year', (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Dữ liệu đầu vào không hợp lệ');
    }
    return res.json({ data: canChiFromYear(year) });
  });

  return router;
}
