import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComputedData, computeVerdict, computeBestHours, groundAreas,
  mapThapThanToAreas, napAmAffinity, AREA_KEYS, FAVORABLE_THAP_THAN,
} from '../src/lib/compute.js';
import { validateRequest } from '../src/routes/fortune.js';
import { createApp } from '../src/server.js';
import { buildImagePrompt, zodiacVisualFor } from '../src/lib/gemini.js';

/* ---------- Fixture: payload thuc te da chup tu API Huyen Minh ---------- */

const HOA_GIAP_1994 = {
  can_chi: 'Giáp Tuất', can: 'Giáp', chi: 'Tuất',
  nap_am: 'Sơn Đầu Hỏa', hanh_nap_am: 'Hỏa',
};

/** 11/09/2026 - ngay Mau Ty (worked example A) */
const DAY_A = {
  duong_lich: '11/09/2026', am_lich: '1/8/2026', thu: 'Thứ Sáu',
  can_chi: { ngay: 'Mậu Tý', thang: 'Đinh Dậu', nam: 'Bính Ngọ' },
  truc: { ten: 'Bình', muc: 'tốt', nen: 'cưới hỏi, sửa nhà', ky: '—' },
  nhi_thap_bat_tu: { ten: 'Lâu Kim Cẩu', sao: 'Lâu', tot_xau: 'tốt', nen: 'cưới hỏi', ky: '—' },
  gio: {
    hoang_dao: [
      { gio: 'Tý', khung: '23h-1h' }, { gio: 'Sửu', khung: '1h-3h' },
      { gio: 'Mão', khung: '5h-7h' }, { gio: 'Ngọ', khung: '11h-13h' },
      { gio: 'Thân', khung: '15h-17h' }, { gio: 'Dậu', khung: '17h-19h' },
    ],
    hac_dao: [
      { gio: 'Dần', khung: '3h-5h' }, { gio: 'Thìn', khung: '7h-9h' },
      { gio: 'Tỵ', khung: '9h-11h' }, { gio: 'Mùi', khung: '13h-15h' },
      { gio: 'Tuất', khung: '19h-21h' }, { gio: 'Hợi', khung: '21h-23h' },
    ],
  },
};

const CHI_ORDER = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const KHUNG = ['23h-1h', '1h-3h', '3h-5h', '5h-7h', '7h-9h', '9h-11h', '11h-13h', '13h-15h', '15h-17h', '17h-19h', '19h-21h', '21h-23h'];

function hourFramesFor(dayInfo, thapThanGiap) {
  const auspicious = new Set(dayInfo.gio.hoang_dao.map((g) => g.gio));
  return {
    canh_gio: CHI_ORDER.map((chi, i) => ({
      chi, khung: KHUNG[i], can_chi: `? ${chi}`, hoang_dao: auspicious.has(chi), hanh: 'Thủy',
    })),
    thap_than_theo_nhat_chu: { 'Giáp': thapThanGiap },
  };
}

/** Thap Than 12 gio ngay Mau Ty voi goc Giap - chup tu /api/khunggio */
const TT_GIAP_DAY_A = [
  'Thiên Ấn', 'Chính Ấn', 'Tỷ Kiên', 'Kiếp Tài', 'Thực Thần', 'Thương Quan',
  'Thiên Tài', 'Chính Tài', 'Thất Sát', 'Chính Quan', 'Thiên Ấn', 'Chính Ấn',
];

/** 21/09/2026 - ngay Mau Tuat (worked example B) */
const DAY_B = {
  duong_lich: '21/09/2026', am_lich: '11/8/2026', thu: 'Thứ Hai',
  can_chi: { ngay: 'Mậu Tuất', thang: 'Đinh Dậu', nam: 'Bính Ngọ' },
  truc: { ten: 'Trừ', muc: 'tốt', nen: 'giải trừ', ky: '—' },
  nhi_thap_bat_tu: { ten: 'Trương Nguyệt Lộc', sao: 'Trương', tot_xau: 'tốt', nen: 'mọi việc', ky: '—' },
  gio: {
    hoang_dao: [
      { gio: 'Dần', khung: '3h-5h' }, { gio: 'Thìn', khung: '7h-9h' },
      { gio: 'Tỵ', khung: '9h-11h' }, { gio: 'Thân', khung: '15h-17h' },
      { gio: 'Dậu', khung: '17h-19h' }, { gio: 'Hợi', khung: '21h-23h' },
    ],
    hac_dao: [
      { gio: 'Tý', khung: '23h-1h' }, { gio: 'Sửu', khung: '1h-3h' },
      { gio: 'Mão', khung: '5h-7h' }, { gio: 'Ngọ', khung: '11h-13h' },
      { gio: 'Mùi', khung: '13h-15h' }, { gio: 'Tuất', khung: '19h-21h' },
    ],
  },
};

const TT_GIAP_DAY_B = [
  'Kiếp Tài', 'Tỷ Kiên', 'Thực Thần', 'Thương Quan', 'Thiên Tài', 'Chính Tài',
  'Thất Sát', 'Chính Quan', 'Thiên Ấn', 'Chính Ấn', 'Kiếp Tài', 'Tỷ Kiên',
];

const computeFor = (dayInfo, tt, gender = 'male', date = '2026-09-11') =>
  buildComputedData({
    birthYear: 1994, gender, date,
    hoaGiap: HOA_GIAP_1994,
    dayInfo,
    hourFrames: hourFramesFor(dayInfo, tt),
  });

test('prompt ảnh giữ đúng con giáp và bố cục thẻ cho Giáp Tuất 1994', () => {
  const prompt = buildImagePrompt({
    menh: 'Hỏa',
    person: {
      birthYear: 1994,
      canChi: 'Giáp Tuất',
      chi: 'Tuất',
      napAm: 'Sơn Đầu Hỏa',
      gender: 'male',
    },
    day: { solar: '21/09/2026' },
    title: 'Vận mệnh hôm nay',
    bullets: ['Giờ tốt: Tý', 'Giữ tâm an'],
    isPart2: false,
    verdict: 'TRUNG BÌNH',
  });

  assert.equal(zodiacVisualFor('Tuất').animal, 'Dog');
  assert.match(prompt, /Giáp Tuất/);
  assert.match(prompt, /birth year 1994/);
  assert.match(prompt, /zodiac animal is a Dog/);
  assert.match(prompt, /Never replace it with a bird/);
  assert.match(prompt, /88% of the canvas width/);
  assert.match(prompt, /tarot-card frame/);
  assert.match(prompt, /KARMA AI/);
  assert.match(prompt, /Sơn Đầu Hỏa/);
  assert.match(prompt, /Ngày xem: 21\/09\/2026/);
});

/* ---------- BR-09: hai worked example trong spec ---------- */

test('BR-09 worked example A: 11/9/2026 -> score 2, TRUNG BINH', () => {
  const c = computeFor(DAY_A, TT_GIAP_DAY_A);
  assert.equal(c.person.canChi, 'Giáp Tuất');
  assert.equal(c.person.napAm, 'Sơn Đầu Hỏa');
  assert.equal(c.person.menh, 'Hỏa');
  assert.equal(c.day.canChi, 'Mậu Tý');
  assert.equal(c.day.napAm, 'Tích Lịch Hỏa');
  assert.equal(c.day.hanhNapAm, 'Hỏa');
  assert.equal(c.relation.napAmRelation, 'identical');
  assert.equal(c.relation.chiRelation, 'none');
  assert.equal(c.relation.dayThapThan, 'Thiên Tài');
  assert.deepEqual(c.relation.tangCanThapThan.map((t) => t.thapThan), ['Chính Ấn']);
  assert.equal(c.verdictScore, 2);
  assert.equal(c.verdict, 'TRUNG BÌNH');
});

test('BR-08 worked example A: bestHours = Suu, Ngo, Dau', () => {
  const c = computeFor(DAY_A, TT_GIAP_DAY_A);
  assert.deepEqual(c.bestHours.map((h) => h.gio), ['Sửu', 'Ngọ', 'Dậu']);
  assert.deepEqual(c.bestHours.map((h) => h.thapThan), ['Chính Ấn', 'Thiên Tài', 'Chính Quan']);
  assert.equal(c.bestHoursFallback, false);
});

test('BR-09 worked example B: 21/9/2026 -> score 4, CAT', () => {
  const c = computeFor(DAY_B, TT_GIAP_DAY_B, 'male', '2026-09-21');
  assert.equal(c.day.canChi, 'Mậu Tuất');
  assert.equal(c.day.napAm, 'Bình Địa Mộc');
  assert.equal(c.relation.napAmRelation, 'day_generates_person');
  // BR-06: Chi nam sinh Tuat trung Chi ngay Tuat, Tuat khong phai tu hinh -> none
  assert.equal(c.relation.chiRelation, 'none');
  assert.deepEqual(
    c.relation.tangCanThapThan.map((t) => t.thapThan),
    ['Thiên Tài', 'Chính Quan', 'Thương Quan'],
  );
  assert.equal(c.verdictScore, 4);
  assert.equal(c.verdict, 'CÁT');
});

test('BR-16 example B: ca 4 mang deu active', () => {
  const c = computeFor(DAY_B, TT_GIAP_DAY_B, 'male', '2026-09-21');
  for (const k of AREA_KEYS) {
    assert.equal(c.fourAreas[k].tone, 'active', k);
    assert.ok(c.fourAreas[k].source, k);
  }
  assert.equal(c.fourAreas.taiLoc.source, 'Thiên Tài');
  assert.equal(c.fourAreas.tinhCam.source, 'Thiên Tài');
  assert.equal(c.fourAreas.congViec.source, 'Chính Quan');
  assert.equal(c.fourAreas.sucKhoe.source, 'Thương Quan');
});

/* ---------- BR-05: gioi tinh doi nguon mang tinh cam ---------- */

test('BR-05: nam xem tinh cam qua Tai, nu xem qua Quan', () => {
  assert.deepEqual(mapThapThanToAreas('Thiên Tài', 'male'), { primary: 'taiLoc', secondary: 'tinhCam' });
  assert.deepEqual(mapThapThanToAreas('Thiên Tài', 'female'), { primary: 'taiLoc', secondary: null });
  assert.deepEqual(mapThapThanToAreas('Chính Quan', 'female'), { primary: 'congViec', secondary: 'tinhCam' });
  assert.deepEqual(mapThapThanToAreas('Chính Quan', 'male'), { primary: 'congViec', secondary: null });
});

test('BR-05: moi mang tra ve deu thuoc dung 4 key hop le', () => {
  const tenGods = [
    'Tỷ Kiên', 'Kiếp Tài', 'Thực Thần', 'Thương Quan', 'Chính Tài',
    'Thiên Tài', 'Chính Quan', 'Thất Sát', 'Chính Ấn', 'Thiên Ấn',
  ];
  for (const tt of tenGods) for (const g of ['male', 'female']) {
    const { primary, secondary } = mapThapThanToAreas(tt, g);
    assert.ok(AREA_KEYS.includes(primary), `${tt}/${g} primary=${primary}`);
    if (secondary !== null) assert.ok(AREA_KEYS.includes(secondary), `${tt}/${g} secondary=${secondary}`);
  }
});

test('BR-05 + BR-16: ca 4 mang luon co mat du Thap Than chi phu 1 mang', () => {
  const areas = groundAreas({
    dayThapThan: 'Tỷ Kiên', // chi phu congViec
    tangCanThapThan: [{ can: 'Giáp', banKhi: true, thapThan: 'Tỷ Kiên' }],
    gender: 'male',
    dayCanChi: 'Giáp Dần',
  });
  assert.deepEqual(Object.keys(areas).sort(), [...AREA_KEYS].sort());
  assert.equal(areas.congViec.tone, 'active');
  for (const k of ['taiLoc', 'tinhCam', 'sucKhoe']) {
    assert.equal(areas[k].tone, 'neutral', k);
    assert.equal(areas[k].source, null, k);
    assert.match(areas[k].neutralText, /không có yếu tố nổi bật trong ngày Giáp Dần/);
  }
});

test('BR-16: ban khi duoc 3 cau, tang can phu duoc 1 cau', () => {
  const areas = groundAreas({
    dayThapThan: 'Thiên Tài',
    tangCanThapThan: [
      { can: 'Mậu', banKhi: true, thapThan: 'Thiên Tài' },
      { can: 'Tân', banKhi: false, thapThan: 'Chính Quan' },
      { can: 'Đinh', banKhi: false, thapThan: 'Thương Quan' },
    ],
    gender: 'male',
    dayCanChi: 'Mậu Tuất',
  });
  assert.equal(areas.taiLoc.origin, 'day_stem');
  assert.equal(areas.taiLoc.sentences, 3);
  assert.equal(areas.congViec.origin, 'tang_can');
  assert.equal(areas.congViec.sentences, 1);
  assert.equal(areas.sucKhoe.origin, 'tang_can');
  assert.equal(areas.sucKhoe.sentences, 1);
});

/* ---------- BR-08 / BR-09 bien ---------- */

test('BR-08: giao rong -> fallback ve toan bo gio hoang dao', () => {
  const canhGio = CHI_ORDER.map((chi, i) => ({ chi, khung: KHUNG[i], hoang_dao: i < 3 }));
  const hourThapThan = new Array(12).fill('Thất Sát'); // khong co gi thuan loi
  const r = computeBestHours({ canhGio, hourThapThan });
  assert.equal(r.bestHoursFallback, true);
  assert.equal(r.bestHours.length, 3);
});

test('BR-08: tap thuan loi dung 6 Thap Than', () => {
  assert.equal(FAVORABLE_THAP_THAN.size, 6);
  for (const tt of ['Chính Quan', 'Chính Ấn', 'Chính Tài', 'Thực Thần', 'Tỷ Kiên', 'Thiên Tài']) {
    assert.ok(FAVORABLE_THAP_THAN.has(tt), tt);
  }
  for (const tt of ['Thất Sát', 'Kiêu Thần', 'Kiếp Tài', 'Thương Quan']) {
    assert.ok(!FAVORABLE_THAP_THAN.has(tt), tt);
  }
});

test('BR-09: nguong CAT / TRUNG BINH / CAN THAN TRONG', () => {
  const worst = computeVerdict({
    napAmRel: 'day_controls_person', chiRel: 'luc_xung', trucMuc: 'xấu', saoTotXau: 'xấu',
  });
  assert.equal(worst.verdictScore, -6);
  assert.equal(worst.verdict, 'CẦN THẬN TRỌNG');

  const best = computeVerdict({
    napAmRel: 'day_generates_person', chiRel: 'tam_hop', trucMuc: 'tốt', saoTotXau: 'tốt',
  });
  assert.equal(best.verdictScore, 6);
  assert.equal(best.verdict, 'CÁT');

  assert.equal(computeVerdict({ napAmRel: 'identical', chiRel: 'none' }).verdict, 'TRUNG BÌNH');
  // tu hinh tru 1 diem
  assert.equal(computeVerdict({ napAmRel: 'identical', chiRel: 'tu_hinh' }).verdictScore, -1);
  // ranh gioi: 3 -> CAT, 2 -> TRUNG BINH, -2 -> CAN THAN TRONG
  assert.equal(computeVerdict({ napAmRel: 'day_generates_person', chiRel: 'none', trucMuc: 'tốt' }).verdict, 'CÁT');
  assert.equal(computeVerdict({ napAmRel: 'day_generates_person', chiRel: 'none' }).verdict, 'TRUNG BÌNH');
  assert.equal(computeVerdict({ napAmRel: 'person_controls_day', chiRel: 'none', trucMuc: 'xấu' }).verdict, 'CẦN THẬN TRỌNG');
});

test('napAmAffinity: hanh sinh va hanh khac nap am ngay', () => {
  assert.deepEqual(napAmAffinity('Hỏa'), { hop: 'Mộc', ky: 'Thủy', dayNapAmHanh: 'Hỏa' });
  assert.deepEqual(napAmAffinity('Kim'), { hop: 'Thổ', ky: 'Hỏa', dayNapAmHanh: 'Kim' });
  assert.equal(napAmAffinity('khong hop le'), null);
});

test('buildComputedData nem loi khi Can Chi ngay khong tra duoc nap am', () => {
  assert.throws(
    () => buildComputedData({
      birthYear: 1994, gender: 'male', date: '2026-09-11',
      hoaGiap: HOA_GIAP_1994,
      dayInfo: { ...DAY_A, can_chi: { ...DAY_A.can_chi, ngay: 'Giáp Sửu' } }, // cap khong ton tai
      hourFrames: hourFramesFor(DAY_A, TT_GIAP_DAY_A),
    }),
    /nap am/,
  );
});

/* ---------- Validation ---------- */

test('validateRequest: bien cua birthYear', () => {
  assert.equal(validateRequest({ birthYear: 1899, gender: 'male', date: '2026-09-11' }).ok, false);
  assert.equal(validateRequest({ birthYear: 2101, gender: 'male', date: '2026-09-11' }).ok, false);
  assert.equal(validateRequest({ birthYear: 1900, gender: 'male', date: '2026-09-11' }).ok, true);
  assert.equal(validateRequest({ birthYear: 2100, gender: 'male', date: '2026-09-11' }).ok, true);
  assert.equal(validateRequest({ birthYear: 1994.5, gender: 'male', date: '2026-09-11' }).ok, false);
  assert.equal(validateRequest({ birthYear: '1994; DROP TABLE', gender: 'male', date: '2026-09-11' }).ok, false);
});

test('validateRequest: gender va date', () => {
  assert.equal(validateRequest({ birthYear: 1994, gender: 'other', date: '2026-09-11' }).ok, false);
  assert.equal(validateRequest({ birthYear: 1994, gender: 'male', date: '11/09/2026' }).ok, false);
  assert.equal(validateRequest({ birthYear: 1994, gender: 'male', date: '2026-02-30' }).ok, false);
  assert.equal(validateRequest({ birthYear: 1994, gender: 'male', date: '2026-13-01' }).ok, false);
  assert.equal(validateRequest({ birthYear: 1994, gender: 'male', date: '2024-02-29' }).ok, true);
  assert.equal(validateRequest({ birthYear: 1994, gender: 'female', date: '2099-12-31' }).ok, true);
  assert.equal(validateRequest(null).ok, false);
});

/* ---------- Endpoint voi stub, khong goi mang ---------- */

const fakeText = async () => ({
  part1: {
    fullText: 'Phan 1', imageTitle: 'T1',
    imageBullets: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    voice: 'voice 1', videoMood: 'Calm mood.',
  },
  part2: {
    fullText: 'Phan 2', imageTitle: 'T2',
    imageBullets: ['a', 'b', 'c', 'd', 'e'],
    voice: 'voice 2', videoMood: 'Bright mood.',
    areaTexts: { taiLoc: 'tl', tinhCam: 'tc', sucKhoe: 'sk', congViec: 'cv' },
    closingLine: 'cau chot',
  },
});

const fakeCalendar = async () => ({
  hoaGiap: HOA_GIAP_1994,
  dayInfo: DAY_B,
  hourFrames: hourFramesFor(DAY_B, TT_GIAP_DAY_B),
  source: { credit: 'Nguồn: Huyền Minh — huyenminh.com.vn', boundary: 'ranh gioi test' },
});

async function withServer(deps, fn) {
  const server = createApp({ deps }).listen(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

const post = (base, body) => fetch(`${base}/api/fortune`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('POST /api/fortune: happy path tra du 2 phan x 3 khoi', async () => {
  await withServer(
    {
      fetchAll: fakeCalendar,
      generateText: fakeText,
      generateImages: async () => ([
        { status: 'generated', mimeType: 'image/png', dataBase64: 'AAA' },
        { status: 'generated', mimeType: 'image/png', dataBase64: 'BBB' },
      ]),
    },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 200);
      const { data } = await res.json();

      assert.equal(data.meta.verdict, 'CÁT');
      assert.equal(data.meta.verdictScore, 4);
      assert.deepEqual(data.meta.dayTangCanThapThan, ['Thiên Tài', 'Chính Quan', 'Thương Quan']);
      assert.equal(data.meta.bestHoursFallback, false);
      assert.ok(data.meta.credit.includes('huyenminh.com.vn'));
      assert.ok(data.meta.disclaimer.includes('văn hóa dân gian'));
      assert.match(data.meta.simplifiedMethodNote, /bản giản lược/);

      for (const p of [data.part1, data.part2]) {
        assert.ok(p.fullText);
        assert.ok(p.imagePrompt.includes('9:16'));
        assert.ok(p.videoPrompt.includes('10 second duration'));
        assert.ok(p.videoPrompt.includes('Voiceover'));
        assert.ok(p.videoPromptVi.length > 0);
        assert.equal(p.image.status, 'generated');
      }
      // 4 mang co mat day du trong part2
      assert.deepEqual(Object.keys(data.part2.areas).sort(), [...AREA_KEYS].sort());
      for (const k of AREA_KEYS) assert.ok(data.part2.areas[k].text, k);
    },
  );
});

test('BR-11: anh loi -> van 200, status fallback, prompt khong rong', async () => {
  await withServer(
    {
      fetchAll: fakeCalendar,
      generateText: fakeText,
      generateImages: async () => ([
        { status: 'generated', mimeType: 'image/png', dataBase64: 'AAA' },
        { status: 'fallback', reason: 'IMAGE_QUOTA_EXCEEDED', dataBase64: null },
      ]),
    },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 200);
      const { data } = await res.json();
      assert.equal(data.part1.image.status, 'generated');
      assert.equal(data.part2.image.status, 'fallback');
      assert.equal(data.part2.image.reason, 'IMAGE_QUOTA_EXCEEDED');
      assert.ok(data.part2.imagePrompt.length > 100);
      assert.ok(data.part2.fullText);
    },
  );
});

test('BR-02: assert Can Chi lech -> 422', async () => {
  const { CanChiAssertError } = await import('../src/lib/calendar.js');
  await withServer(
    {
      fetchAll: async () => {
        throw new CanChiAssertError({ birthYear: 1994, computed: 'Giáp Tuất', apiReturned: 'Bính Ngọ' });
      },
      generateText: fakeText,
      generateImages: async () => [],
    },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 422);
      const body = await res.json();
      assert.equal(body.error.code, 'CANCHI_ASSERT_FAILED');
    },
  );
});

test('loi lich: timeout -> 504, loi khac -> 502', async () => {
  const { CalendarTimeoutError, CalendarApiError } = await import('../src/lib/calendar.js');
  await withServer(
    { fetchAll: async () => { throw new CalendarTimeoutError('ngay'); }, generateText: fakeText, generateImages: async () => [] },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 504);
      assert.equal((await res.json()).error.code, 'UPSTREAM_TIMEOUT');
    },
  );
  await withServer(
    { fetchAll: async () => { throw new CalendarApiError('down', { endpoint: 'ngay', httpStatus: 503 }); }, generateText: fakeText, generateImages: async () => [] },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 502);
      assert.equal((await res.json()).error.code, 'CALENDAR_API_FAILED');
    },
  );
});

test('text loi: quota -> 429 UPSTREAM_QUOTA_EXCEEDED, shape loi -> 502', async () => {
  const { GeminiQuotaError } = await import('../src/lib/gemini.js');
  await withServer(
    { fetchAll: fakeCalendar, generateText: async () => { throw new GeminiQuotaError(37); }, generateImages: async () => [] },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 429);
      const body = await res.json();
      assert.equal(body.error.code, 'UPSTREAM_QUOTA_EXCEEDED');
      assert.equal(body.error.retryAfterSeconds, 37);
    },
  );
  await withServer(
    { fetchAll: fakeCalendar, generateText: async () => { throw new Error('JSON sai shape'); }, generateImages: async () => [] },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 502);
      assert.equal((await res.json()).error.code, 'TEXT_GENERATION_FAILED');
    },
  );
});

test('BR-17: request thu 11 trong 1 phut -> 429 RATE_LIMITED co retryAfterSeconds', async () => {
  await withServer(
    { fetchAll: fakeCalendar, generateText: fakeText, generateImages: async () => ([
      { status: 'fallback', reason: 'x', dataBase64: null },
      { status: 'fallback', reason: 'x', dataBase64: null },
    ]) },
    async (base) => {
      let last;
      for (let i = 0; i < 11; i += 1) {
        last = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      }
      assert.equal(last.status, 429);
      const body = await last.json();
      assert.equal(body.error.code, 'RATE_LIMITED');
      assert.ok(body.error.retryAfterSeconds >= 1);
      assert.ok(last.headers.get('retry-after'));
    },
  );
});

test('BR-19: mac dinh IMAGE_MODE=prompt -> khong goi API anh, tra prompt_only', async () => {
  const { generateImages, imageMode } = await import('../src/lib/gemini.js');
  delete process.env.IMAGE_MODE;
  assert.equal(imageMode(), 'prompt');

  let called = 0;
  const spyFetch = async () => { called += 1; throw new Error('khong duoc goi'); };
  const images = await generateImages(['p1', 'p2'], { fetchImpl: spyFetch });
  assert.equal(called, 0, 'che do prompt KHONG duoc goi API anh');
  assert.deepEqual(images.map((i) => i.status), ['prompt_only', 'prompt_only']);
  assert.deepEqual(images.map((i) => i.dataBase64), [null, null]);
});

test('BR-19: IMAGE_MODE=api -> co goi API anh', async () => {
  const { generateImages, imageMode } = await import('../src/lib/gemini.js');
  process.env.IMAGE_MODE = 'api';
  process.env.GEMINI_API_KEY = 'k';
  try {
    assert.equal(imageMode(), 'api');
    let called = 0;
    const spyFetch = async () => {
      called += 1;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'ZZZ' } }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const images = await generateImages(['p1', 'p2'], { fetchImpl: spyFetch });
    assert.equal(called, 2, 'hai anh goi song song');
    assert.deepEqual(images.map((i) => i.status), ['generated', 'generated']);
  } finally {
    delete process.env.IMAGE_MODE;
    delete process.env.GEMINI_API_KEY;
  }
});

test('BR-19: response mang meta.imageMode va prompt van day du', async () => {
  delete process.env.IMAGE_MODE;
  await withServer(
    { fetchAll: fakeCalendar, generateText: fakeText },
    async (base) => {
      const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
      assert.equal(res.status, 200);
      const { data } = await res.json();
      assert.equal(data.meta.imageMode, 'prompt');
      for (const p of [data.part1, data.part2]) {
        assert.equal(p.image.status, 'prompt_only');
        assert.ok(p.imagePrompt.length > 100, 'prompt anh phai day du');
        assert.ok(p.videoPrompt.includes('Voiceover'));
        assert.ok(p.fullText);
      }
    },
  );
});

test('GET /api/canchi/:year', async () => {
  await withServer({}, async (base) => {
    const ok = await fetch(`${base}/api/canchi/1994`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).data.canChi, 'Giáp Tuất');
    const bad = await fetch(`${base}/api/canchi/1800`);
    assert.equal(bad.status, 400);
  });
});

test('GET /api/health', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  });
});

test('khong co API key nao lot ra response', async () => {
  process.env.GEMINI_API_KEY = 'SECRET-KEY-DO-NOT-LEAK';
  try {
    await withServer(
      { fetchAll: fakeCalendar, generateText: fakeText, generateImages: async () => ([
        { status: 'fallback', reason: 'x', dataBase64: null },
        { status: 'fallback', reason: 'x', dataBase64: null },
      ]) },
      async (base) => {
        const res = await post(base, { birthYear: 1994, gender: 'male', date: '2026-09-21' });
        const raw = await res.text();
        assert.ok(!raw.includes('SECRET-KEY-DO-NOT-LEAK'));
      },
    );
  } finally {
    delete process.env.GEMINI_API_KEY;
  }
});
