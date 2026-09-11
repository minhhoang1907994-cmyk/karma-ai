/**
 * Client cho Google AI (Gemini).
 *
 * Hai vai tro tach biet:
 *   - Text  (gemini-2.5-flash, CO free tier): dien dat so lieu da tinh thanh van.
 *     Khong tu ket luan - moi verdict, gio tot, 4 mang deu do compute.js quyet dinh.
 *   - Image (gemini-2.5-flash-image, KHONG co free tier): sinh 2 anh 9:16.
 *     Loi anh KHONG lam fail request - degrade thanh fallback (BR-11).
 */

import { AREA_KEYS, AREA_LABELS } from './compute.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const TEXT_TIMEOUT_MS = 30000; // BR-12
const IMAGE_TIMEOUT_MS = 45000; // BR-12
const TEXT_RETRIES = 1; // BR-12
const TEXT_BACKOFF_MS = 2000; // BR-12

/** Bang mau + bieu tuong theo menh, lay tu file nguon. */
const MENH_STYLE = {
  'Kim': {
    colors: 'white, metallic gold, silver',
    symbols: 'a sword, a bronze bell, metallic clouds, glinting metal light',
    trigrams: 'Càn and Đoài',
    colorsVi: 'trắng, vàng ánh kim, bạc',
  },
  'Mộc': {
    colors: 'leaf green, jade green',
    symbols: 'an ancient tree, a bamboo grove, green leaves, exposed roots',
    trigrams: 'Chấn and Tốn',
    colorsVi: 'xanh lá, xanh ngọc',
  },
  'Thủy': {
    colors: 'deep blue, black',
    symbols: 'ocean waves, a waterfall, drifting mist, still ponds',
    trigrams: 'Khảm',
    colorsVi: 'xanh dương đậm, đen',
  },
  'Hỏa': {
    colors: 'red, orange, glowing pink',
    symbols: 'flames, the sun, a phoenix, dawn light',
    trigrams: 'Ly',
    colorsVi: 'đỏ, cam, hồng rực',
  },
  'Thổ': {
    colors: 'earth yellow, brown',
    symbols: 'hills and mountains, tilled fields, stone, desert dunes',
    trigrams: 'Cấn and Khôn',
    colorsVi: 'vàng đất, nâu',
  },
};

/**
 * Hồ sơ hình ảnh cho 12 con giáp. Không suy con vật từ mệnh: ví dụ mệnh Hỏa
 * có phượng hoàng nhưng Giáp Tuất vẫn phải hiển thị chó.
 */
const ZODIAC_ART = {
  'Tý': { animal: 'Rat', scene: 'a graceful jade rat beside grain and moonlit water' },
  'Sửu': { animal: 'Ox', scene: 'a calm ox among misty rice terraces' },
  'Dần': { animal: 'Tiger', scene: 'a dignified tiger in a bamboo-and-mountain landscape' },
  'Mão': { animal: 'Cat', scene: 'an elegant Vietnamese zodiac cat among plum blossoms' },
  'Thìn': { animal: 'Dragon', scene: 'a benevolent Eastern dragon moving through auspicious clouds' },
  'Tỵ': { animal: 'Snake', scene: 'a refined snake coiled near orchids and river stones' },
  'Ngọ': { animal: 'Horse', scene: 'a spirited horse on a dawn-lit hill' },
  'Mùi': { animal: 'Goat', scene: 'a gentle mountain goat among soft clouds and wildflowers' },
  'Thân': { animal: 'Monkey', scene: 'a lively monkey on an ancient peach-tree branch' },
  'Dậu': { animal: 'Rooster', scene: 'a proud rooster beside peonies at sunrise' },
  'Tuất': { animal: 'Dog', scene: 'a loyal Vietnamese village dog beside a lantern-lit gate' },
  'Hợi': { animal: 'Pig', scene: 'a peaceful pig among lotus leaves and warm lantern light' },
};

/** Tra về mô tả chuẩn của con giáp để prompt không bị lái sang biểu tượng ngũ hành. */
export function zodiacVisualFor(chi) {
  return ZODIAC_ART[chi] ?? { animal: 'Vietnamese zodiac animal', scene: 'a subtle Vietnamese zodiac animal motif' };
}

export class GeminiError extends Error {
  constructor(message, { httpStatus = null, retryAfterSeconds = null, cause = null } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
    this.cause = cause;
  }
}

export class GeminiQuotaError extends GeminiError {
  constructor(retryAfterSeconds) {
    super('Gemini tra ve 429 sau khi het retry', { httpStatus: 429, retryAfterSeconds });
    this.name = 'GeminiQuotaError';
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(ms) {
    super(`Gemini khong phan hoi trong ${ms}ms`);
    this.name = 'GeminiTimeoutError';
  }
}

function config() {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  };
}

/**
 * BR-19: che do sinh anh.
 *   'prompt' (MAC DINH) - khong goi API anh, chi tra prompt de nguoi dung tu dan
 *                         vao Gemini app. Mien phi hoan toan.
 *   'api'               - goi model sinh anh (CAN bat billing, khong co free tier).
 */
export function imageMode() {
  return process.env.IMAGE_MODE === 'api' ? 'api' : 'prompt';
}

/** Doc `retry-after` hoac RetryInfo trong body loi cua Google API. */
function parseRetryAfter(res, body) {
  const header = res?.headers?.get?.('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header);
  const details = body?.error?.details ?? [];
  for (const d of details) {
    const delay = d?.retryDelay;
    if (typeof delay === 'string') {
      const n = Number.parseFloat(delay.replace('s', ''));
      if (Number.isFinite(n)) return Math.ceil(n);
    }
  }
  return null;
}

async function callModel({ model, body, timeoutMs, retries, fetchImpl = globalThis.fetch }) {
  const { apiKey } = config();
  if (!apiKey) throw new GeminiError('Thieu bien moi truong GEMINI_API_KEY');

  const url = `${API_BASE}/${model}:generateContent`;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, TEXT_BACKOFF_MS));

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new GeminiTimeoutError(timeoutMs);
      }
      lastError = new GeminiError(`Loi mang khi goi Gemini: ${err.message}`, { cause: err });
      continue;
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (res.status === 429) {
      lastError = new GeminiQuotaError(parseRetryAfter(res, payload));
      continue;
    }
    if (res.status >= 500) {
      lastError = new GeminiError(`Gemini tra ve HTTP ${res.status}`, { httpStatus: res.status });
      continue;
    }
    if (!res.ok) {
      throw new GeminiError(
        `Gemini tra ve HTTP ${res.status}: ${payload?.error?.message ?? 'khong ro'}`,
        { httpStatus: res.status },
      );
    }
    return payload;
  }

  throw lastError ?? new GeminiError('Goi Gemini that bai');
}

/** Schema JSON bat buoc cho phan hoi text - de mo hinh khong tra ve van tu do. */
const TEXT_SCHEMA = {
  type: 'object',
  properties: {
    part1: {
      type: 'object',
      properties: {
        fullText: { type: 'string' },
        imageTitle: { type: 'string' },
        imageBullets: { type: 'array', items: { type: 'string' } },
        voice: { type: 'string' },
        videoMood: { type: 'string' },
      },
      required: ['fullText', 'imageTitle', 'imageBullets', 'voice', 'videoMood'],
    },
    part2: {
      type: 'object',
      properties: {
        fullText: { type: 'string' },
        imageTitle: { type: 'string' },
        imageBullets: { type: 'array', items: { type: 'string' } },
        voice: { type: 'string' },
        videoMood: { type: 'string' },
        areaTexts: {
          type: 'object',
          properties: {
            taiLoc: { type: 'string' },
            tinhCam: { type: 'string' },
            sucKhoe: { type: 'string' },
            congViec: { type: 'string' },
          },
          required: ['taiLoc', 'tinhCam', 'sucKhoe', 'congViec'],
        },
        closingLine: { type: 'string' },
      },
      required: ['fullText', 'imageTitle', 'imageBullets', 'voice', 'videoMood', 'areaTexts', 'closingLine'],
    },
  },
  required: ['part1', 'part2'],
};

function buildSystemPrompt(boundary) {
  return [
    'Bạn là người diễn đạt nội dung phong thủy — không phải người tính toán.',
    'Toàn bộ số liệu, kết luận cát/hung, giờ tốt và phân tích 4 mảng đã được tính sẵn và đưa cho bạn.',
    'Nhiệm vụ duy nhất: diễn đạt chúng thành văn tiếng Việt ấm áp, huyền bí, chiêm nghiệm.',
    '',
    'TUYỆT ĐỐI KHÔNG:',
    '- Thay đổi, làm tròn, hay tự suy ra bất kỳ con số, tên giờ, tên Can Chi, tên Thập Thần nào.',
    '- Tự kết luận ngày tốt hay xấu khác với verdict đã cho.',
    '- Bổ sung hướng xuất hành — dữ liệu này không tồn tại (BR-14).',
    '- Viết nội dung cho mảng nào có tone "neutral"; dùng đúng câu neutralText đã cho.',
    '',
    'Ranh giới nội dung do nguồn dữ liệu quy định (bắt buộc tuân thủ):',
    boundary || 'Nội dung mang tính tham khảo. Không phán kết cục, không dự đoán tuổi thọ, bệnh tật, ly hôn hay phá sản.',
    '',
    'Quy tắc hình thức:',
    '- imageBullets: mỗi bullet TỐI ĐA 8 từ, phải giữ nguyên con số và tên riêng cụ thể.',
    '  part1 có đúng 7 bullet (mục 1..7). part2 có đúng 5 bullet (4 mảng + câu chốt).',
    '- voice: 20–30 từ tiếng Việt, đọc vừa 10 giây.',
    '- videoMood: mô tả không khí bằng TIẾNG ANH, một câu ngắn.',
    '- fullText: văn xuôi tiếng Việt đầy đủ, có thể dài, chia đoạn rõ ràng.',
  ].join('\n');
}

/** BR-13: part1 mang dung 7 muc ve ngay, part2 mang tu vi 4 mang. BR-14: muc (6) la gio tot nhat. */
function buildUserPrompt(c) {
  const areaLines = AREA_KEYS.map((k) => {
    const a = c.fourAreas[k];
    if (a.tone === 'neutral') {
      return `- ${AREA_LABELS[k]}: tone=neutral. Dùng ĐÚNG câu này, không thêm gì: "${a.neutralText}"`;
    }
    return `- ${AREA_LABELS[k]}: tone=active, Thập Thần nguồn="${a.source}" (${a.origin}), viết ${a.sentences} câu`;
  }).join('\n');

  const comp = c.day.chiCompatibility;
  return [
    `NGƯỜI XEM: sinh năm ${c.person.birthYear}, ${c.person.gender === 'male' ? 'nam' : 'nữ'}, tuổi ${c.person.canChi}, nạp âm ${c.person.napAm}, mệnh ${c.person.menh}.`,
    `(Lưu ý: Thập Thần ở đây lấy gốc là Can năm sinh "${c.person.can}" — đây là bản giản lược, không phải nhật chủ Bát Tự chuẩn.)`,
    '',
    `NGÀY XEM: ${c.day.solar} (${c.day.weekday}), âm lịch ${c.day.lunar}, ngày ${c.day.canChi}.`,
    '',
    'PHẦN 1 — 7 mục về NGÀY (viết đủ 7 mục, đúng thứ tự):',
    `(1) Giờ hoàng đạo: ${c.day.gioHoangDao.map((g) => `${g.gio} ${g.khung}`).join(', ')}.`,
    `    Giờ hắc đạo: ${c.day.gioHacDao.map((g) => `${g.gio} ${g.khung}`).join(', ')}.`,
    `(2) Ngũ hành ngày: Can ${c.day.can} (${c.day.canChiRelation?.canHanh}) và Chi ${c.day.chi} (${c.day.canChiRelation?.chiHanh}) — quan hệ: ${c.day.canChiRelation?.relation}.`,
    `(3) Nạp âm ngày: ${c.day.napAm} (hành ${c.day.hanhNapAm}). Hành sinh cho nạp âm này (hợp): ${c.day.napAmAffinity?.hop}. Hành khắc nạp âm này (kỵ): ${c.day.napAmAffinity?.ky}.`,
    `(4) Chi ngày ${c.day.chi}: tam hợp với ${comp?.tamHop.join(', ')}; lục hợp với ${comp?.lucHop}; xung với ${comp?.xung}; hại với ${comp?.hai}; phá với ${comp?.pha}; hình với ${comp?.hinh.join(', ') || 'không'}.`,
    `(5) Trực ${c.day.truc?.ten} (${c.day.truc?.muc}) — nên: ${c.day.truc?.nen}; kỵ: ${c.day.truc?.ky}.`,
    `    Sao ${c.day.nhiThapBatTu?.ten} (${c.day.nhiThapBatTu?.tot_xau}) — nên: ${c.day.nhiThapBatTu?.nen}; kỵ: ${c.day.nhiThapBatTu?.ky}.`,
    `(6) Giờ tốt nhất trong ngày: ${c.bestHours.map((h) => `${h.gio} ${h.khung} (${h.thapThan})`).join(', ')}${c.bestHoursFallback ? ' [không có Thập Thần thuận lợi trong giờ hoàng đạo — đây là toàn bộ giờ hoàng đạo]' : ''}.`,
    `(7) Kết luận tổng quan: ${c.verdict}. (Điểm nội bộ ${c.verdictScore}, không nhắc con số này trong văn bản.)`,
    '',
    'PHẦN 2 — Tử vi hôm nay theo 4 mảng:',
    `Thập Thần của Can ngày so với gốc: ${c.relation.dayThapThan}.`,
    `Thập Thần từ tàng can của Chi ngày: ${c.relation.tangCanThapThan.map((t) => `${t.can}=${t.thapThan}${t.banKhi ? ' (bản khí)' : ''}`).join(', ')}.`,
    `Quan hệ Chi năm sinh ↔ Chi ngày: ${c.relation.chiRelation}. Quan hệ nạp âm: ${c.relation.napAmRelation}.`,
    '',
    'Bốn mảng, viết theo đúng thứ tự công việc → tài lộc → tình cảm → sức khỏe trong fullText,',
    'nhưng điền areaTexts theo đúng key:',
    areaLines,
    '',
    'Cuối phần 2 viết closingLine: câu chốt vận mệnh 1–2 câu, giọng thơ mộng, khớp với verdict đã cho.',
  ].join('\n');
}

/** Goi Gemini text 1 lan, validate JSON tra ve. Retry 1 lan neu shape sai (spec 9.1). */
export async function generateText(computed, { boundary = '', fetchImpl } = {}) {
  const { textModel } = config();
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(boundary) }] },
    contents: [{ role: 'user', parts: [{ text: buildUserPrompt(computed) }] }],
    generationConfig: {
      temperature: 0.85,
      responseMimeType: 'application/json',
      responseSchema: TEXT_SCHEMA,
    },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = await callModel({
      model: textModel,
      body,
      timeoutMs: TEXT_TIMEOUT_MS,
      retries: TEXT_RETRIES,
      fetchImpl,
    });

    const raw = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed?.part1?.fullText && parsed?.part2?.fullText && parsed?.part2?.areaTexts) {
      return parsed;
    }
  }
  throw new GeminiError('Gemini tra ve JSON sai shape sau 2 lan thu');
}

/** Ghep prompt tao anh tu bullet do Gemini viet + bang mau theo menh. */
export function buildImagePrompt({ menh, person, day, title, bullets, isPart2, verdict }) {
  const style = MENH_STYLE[menh] ?? MENH_STYLE['Thổ'];
  const zodiac = zodiacVisualFor(person?.chi);
  const birthYear = person?.birthYear ?? '';
  const canChi = person?.canChi ?? '';
  const napAm = person?.napAm ?? '';
  const gender = person?.gender === 'female' ? 'Nữ' : person?.gender === 'male' ? 'Nam' : '';
  const solarDate = day?.solar ?? '';
  const tone = !isPart2
    ? 'soft, calm, quiet — the feeling of a day just beginning'
    : verdict === 'CÁT'
      ? 'bright and radiant, harmonious and uplifting'
      : verdict === 'CẦN THẬN TRỌNG'
        ? 'a faint grey cautionary tint, still beautiful, never bleak'
        : 'balanced between light and shadow';

  return [
    `Create a complete Vietnamese fortune-card design, 9:16 portrait. Background: ${style.symbols}, in ${style.colors}, painted in modern Eastern ink-wash style, with a faint bagua wheel (${style.trigrams} trigrams) in the background. Soft cinematic lighting matching the ${menh} element mood.`,
    '',
    'ZODIAC IDENTITY — NON-NEGOTIABLE: this reading is for ' +
      `"${canChi}" (birth year ${birthYear}), whose zodiac animal is a ${zodiac.animal}. ` +
      `Show exactly one clearly recognizable ${zodiac.animal}: ${zodiac.scene}. ` +
      `The animal must be visible in the background, preferably in the lower third or peeking from both sides of the panel. Never replace it with a bird, phoenix, dragon, or any other zodiac animal. Do not show a second animal.`,
    '',
    'CARD COMPOSITION: add an elegant tarot-card frame around the full artwork: a thin antique-gold double border, delicate Eastern cloud and bagua ornaments in the four corners, rounded card corners, and a subtle paper texture. The frame must look intentional and premium, not like a plain poster.',
    '',
    'At the top, above the content panel, add a clear Vietnamese title area: an original circular Karma AI emblem (a small gold K monogram formed from a yin-yang-inspired swirl, not a logo of any existing brand) followed by the wordmark "KARMA AI", then the title below. This brand mark is intentional app branding, not a watermark.',
    `Title to render: "${title}".`,
    '',
    `Directly below the title, add a compact input/context ribbon so the card visibly relates to its owner: "${canChi} ${birthYear} (${gender})  |  Ngày xem: ${solarDate}" and a smaller line "${napAm} · Mệnh ${menh}". Render these inputs in clean, readable Vietnamese.`,
    '',
    'Overlay a light smoky-gray, semi-transparent content panel across the center. It must be WIDE: 88% of the canvas width with only 6% side margins, so Vietnamese bullets have long lines and do not wrap unnecessarily. Leave generous inner padding. Use high-contrast charcoal text, a clear heading hierarchy, and short one-line bullets where possible. Make every Vietnamese diacritic legible. Do not make the central panel narrow, tall, or cramped.',
    '',
    'Content inside the gray panel:',
    ...bullets.map((b) => `• ${b}`),
    '',
    `Overall mood: ${tone}. High detail, professional mobile-app infographic aesthetic. No watermark, no unrelated text, no incorrect zodiac animal.`,
  ].join('\n');
}

/** Ghep prompt hieu ung video cho Google Flow (Veo), co nhung loi voice (BR-15). */
export function buildVideoPrompt({ menh, mood, voice, isPart2, verdict }) {
  const style = MENH_STYLE[menh] ?? MENH_STYLE['Thổ'];
  const camera = !isPart2
    ? 'Subtle cinematic slow zoom-in'
    : verdict === 'CÁT'
      ? 'Gentle radiant light bloom spreading from behind the text card, camera holds mostly static with a very slight push-in'
      : 'Very slow drift across the frame, camera almost static';

  const english = [
    `${camera} on an Eastern ink-wash background of ${style.symbols}, in ${style.colors}. Soft particles drift in the background layer only, never across the text panel.`,
    'The Vietnamese text overlay card stays perfectly sharp, static and fully readable at all times — do not blur, warp, or animate the text.',
    `${mood} 10 second duration.`,
    '',
    'Voiceover (Vietnamese, warm low voice, slow pace, subtle traditional zither and bamboo flute underneath):',
    `"${voice}"`,
  ].join('\n');

  const vietnamese = [
    `${!isPart2 ? 'Zoom vào rất chậm' : verdict === 'CÁT' ? 'Ánh sáng lan toả từ sau khung chữ, camera gần như tĩnh, đẩy vào rất nhẹ' : 'Trôi ngang rất chậm, camera gần như tĩnh'} trên nền tranh thủy mặc ${style.colorsVi}.`,
    'Hạt sáng chỉ bay ở lớp nền, không đè lên khung chữ. Chữ tiếng Việt phải giữ nguyên nét, tĩnh và đọc được rõ suốt 10 giây.',
    'Lời đọc tiếng Việt đã nhúng trong prompt, giọng trầm ấm, chậm, nền nhạc đàn tranh và sáo trúc.',
  ].join(' ');

  return { english, vietnamese };
}

/**
 * BR-11: sinh 1 anh. Moi that bai -> tra { status: 'fallback', reason } chu khong nem loi.
 */
export async function generateImage(prompt, { fetchImpl } = {}) {
  const { imageModel } = config();
  try {
    const payload = await callModel({
      model: imageModel,
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      },
      timeoutMs: IMAGE_TIMEOUT_MS,
      retries: 0, // BR-12: anh khong retry, fallback ngay
      fetchImpl,
    });

    const parts = payload?.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline) {
      return { status: 'fallback', reason: 'NO_IMAGE_IN_RESPONSE', dataBase64: null };
    }
    return {
      status: 'generated',
      mimeType: inline.mimeType ?? 'image/png',
      dataBase64: inline.data,
    };
  } catch (err) {
    const reason = err instanceof GeminiQuotaError
      ? 'IMAGE_QUOTA_EXCEEDED'
      : err instanceof GeminiTimeoutError
        ? 'IMAGE_TIMEOUT'
        : err?.httpStatus
          ? `IMAGE_HTTP_${err.httpStatus}`
          : 'IMAGE_CALL_FAILED';
    return { status: 'fallback', reason, dataBase64: null };
  }
}

/**
 * BR-19 + BR-12: o che do 'prompt' khong goi API anh chut nao.
 * O che do 'api' thi hai anh goi song song.
 */
export async function generateImages([prompt1, prompt2], opts = {}) {
  if (imageMode() === 'prompt') {
    const skipped = () => ({ status: 'prompt_only', reason: null, dataBase64: null });
    return [skipped(), skipped()];
  }
  return Promise.all([generateImage(prompt1, opts), generateImage(prompt2, opts)]);
}
