/**
 * Tinh toan toan bo so lieu tu du lieu API - khong goi network, khong goi LLM.
 *
 * Moi ket luan (verdict, 4 mang, gio tot) deu tinh o day. Gemini chi dien dat
 * thanh van, khong tu nghi ra ket luan. Xem BR-05..BR-09 va BR-16.
 */

import {
  canChiFromYear,
  splitCanChi,
  napAm,
  tangCan,
  thapThan,
  chiRelation,
  napAmRelation,
  dayCanChiRelation,
  chiCompatibility,
} from './canchi.js';

/** BR-08: tap Thap Than duoc coi la thuan loi (Tu Thien + Ty Kien + Thien Tai). */
export const FAVORABLE_THAP_THAN = new Set([
  'Chính Quan', 'Chính Ấn', 'Chính Tài', 'Thực Thần', 'Tỷ Kiên', 'Thiên Tài',
]);

export const AREA_KEYS = ['taiLoc', 'tinhCam', 'sucKhoe', 'congViec'];

export const AREA_LABELS = {
  taiLoc: 'Tài lộc',
  tinhCam: 'Tình cảm',
  sucKhoe: 'Sức khỏe',
  congViec: 'Công việc',
};

/** Tuong sinh / tuong khac dung cho muc (3) - tuoi hop va ky voi nap am ngay. */
const SINH = { 'Mộc': 'Hỏa', 'Hỏa': 'Thổ', 'Thổ': 'Kim', 'Kim': 'Thủy', 'Thủy': 'Mộc' };
const KHAC = { 'Mộc': 'Thổ', 'Thổ': 'Thủy', 'Thủy': 'Hỏa', 'Hỏa': 'Kim', 'Kim': 'Mộc' };

/**
 * BR-05: mot Thap Than anh xa sang mang chinh va mang phu.
 * Ca hai cot chi tra ve key thuoc AREA_KEYS, khong co ten mang nao khac.
 */
export function mapThapThanToAreas(tt, gender) {
  switch (tt) {
    case 'Tỷ Kiên':
      return { primary: 'congViec', secondary: null };
    case 'Kiếp Tài':
      return { primary: 'congViec', secondary: 'taiLoc' };
    case 'Thực Thần':
    case 'Thương Quan':
      return { primary: 'sucKhoe', secondary: 'congViec' };
    case 'Chính Tài':
    case 'Thiên Tài':
      return { primary: 'taiLoc', secondary: gender === 'male' ? 'tinhCam' : null };
    case 'Chính Quan':
    case 'Thất Sát':
      return { primary: 'congViec', secondary: gender === 'female' ? 'tinhCam' : null };
    case 'Chính Ấn':
    case 'Thiên Ấn':
    case 'Kiêu Thần': // ten dong nghia cua Thien An, nhan de an toan
      return { primary: 'sucKhoe', secondary: 'congViec' };
    default:
      return { primary: null, secondary: null };
  }
}

/** BR-16: van ban co dinh cho mang khong co nguon nao ground. */
export function neutralAreaText(areaKey, dayCanChi) {
  return `Mảng ${AREA_LABELS[areaKey].toLowerCase()} hôm nay không có yếu tố nổi bật trong ngày ${dayCanChi} — giữ nhịp như thường ngày là đủ.`;
}

/**
 * BR-16: ground 4 mang bang TAT CA Thap Than co mat trong ngay.
 * Nguon uu tien: can ngay > tang can ban khi > tang can con lai.
 */
export function groundAreas({ dayThapThan, tangCanThapThan, gender, dayCanChi }) {
  const areas = {};
  for (const key of AREA_KEYS) {
    areas[key] = { source: null, tone: 'neutral', sentences: null, origin: null };
  }

  // Thu tu dat nguon quyet dinh do uu tien: dat truoc thi khong bi ghi de.
  const contributions = [
    { tt: dayThapThan, origin: 'day_stem', sentences: 3 },
    ...tangCanThapThan.map((entry, i) => ({
      tt: entry.thapThan,
      origin: i === 0 ? 'ban_khi' : 'tang_can',
      sentences: i === 0 ? 3 : 1,
    })),
  ];

  for (const { tt, origin, sentences } of contributions) {
    const { primary, secondary } = mapThapThanToAreas(tt, gender);
    for (const key of [primary, secondary]) {
      if (!key) continue;
      if (areas[key].source !== null) continue;
      areas[key] = { source: tt, tone: 'active', sentences, origin };
    }
  }

  for (const key of AREA_KEYS) {
    if (areas[key].source === null) {
      areas[key].neutralText = neutralAreaText(key, dayCanChi);
    }
  }
  return areas;
}

/**
 * BR-08: gio tot nhat = gio hoang dao VA Thap Than cua gio thuoc tap thuan loi.
 * Giao rong -> lay toan bo gio hoang dao va danh dau fallback.
 */
export function computeBestHours({ canhGio, hourThapThan }) {
  const favorable = [];
  const auspicious = [];

  canhGio.forEach((frame, i) => {
    if (!frame.hoang_dao) return;
    const tt = hourThapThan[i] ?? null;
    const item = { gio: frame.chi, khung: frame.khung, thapThan: tt };
    auspicious.push(item);
    if (tt && FAVORABLE_THAP_THAN.has(tt)) favorable.push(item);
  });

  if (favorable.length > 0) {
    return { bestHours: favorable, bestHoursFallback: false };
  }
  return { bestHours: auspicious, bestHoursFallback: true };
}

/** BR-09: thang diem verdict. Tra ve ca diem tho de test assert va debug. */
export function computeVerdict({ napAmRel, chiRel, trucMuc, saoTotXau }) {
  let score = 0;

  if (napAmRel === 'day_generates_person' || napAmRel === 'person_generates_day') score += 2;
  else if (napAmRel === 'day_controls_person') score -= 2;
  else if (napAmRel === 'person_controls_day') score -= 1;

  if (chiRel === 'tam_hop' || chiRel === 'luc_hop') score += 2;
  else if (chiRel === 'luc_xung') score -= 2;
  else if (chiRel === 'luc_hai' || chiRel === 'luc_pha' || chiRel === 'tam_hinh') score -= 1;
  else if (chiRel === 'tu_hinh') score -= 1;

  if (trucMuc === 'tốt') score += 1;
  else if (trucMuc === 'xấu') score -= 1;

  if (saoTotXau === 'tốt') score += 1;
  else if (saoTotXau === 'xấu') score -= 1;

  let verdict = 'TRUNG BÌNH';
  if (score >= 3) verdict = 'CÁT';
  else if (score <= -2) verdict = 'CẦN THẬN TRỌNG';

  return { verdictScore: score, verdict };
}

/** Muc (3): hanh nao sinh nap am ngay (hop) va hanh nao khac nap am ngay (ky). */
export function napAmAffinity(dayNapAmHanh) {
  if (!SINH[dayNapAmHanh]) return null;
  const hop = Object.keys(SINH).find((h) => SINH[h] === dayNapAmHanh) ?? null;
  const ky = Object.keys(KHAC).find((h) => KHAC[h] === dayNapAmHanh) ?? null;
  return { hop, ky, dayNapAmHanh };
}

/**
 * Gop toan bo thanh ComputedData (spec 4.3).
 *
 * @param {object} input
 * @param {number} input.birthYear
 * @param {'male'|'female'} input.gender
 * @param {string} input.date - YYYY-MM-DD
 * @param {object} input.hoaGiap - body /api/hoagiap
 * @param {object} input.dayInfo - body /api/ngay
 * @param {object} input.hourFrames - body /api/khunggio
 */
export function buildComputedData({ birthYear, gender, date, hoaGiap, dayInfo, hourFrames }) {
  const person = canChiFromYear(birthYear);
  const personMenh = hoaGiap.hanh_nap_am;

  const dayParts = splitCanChi(dayInfo.can_chi.ngay);
  if (!dayParts) {
    throw new Error(`Can Chi ngay khong hop le: "${dayInfo.can_chi.ngay}"`);
  }
  const dayNapAm = napAm(dayInfo.can_chi.ngay);
  if (!dayNapAm) {
    throw new Error(`Khong tra duoc nap am cho ngay "${dayInfo.can_chi.ngay}"`);
  }

  const dayThapThan = thapThan(person.can, dayParts.can);
  const dayTangCan = tangCan(dayParts.chi) ?? [];
  const tangCanThapThan = dayTangCan.map((can, i) => ({
    can,
    banKhi: i === 0,
    thapThan: thapThan(person.can, can),
  }));

  const hourThapThan = hourFrames.thap_than_theo_nhat_chu?.[person.can] ?? [];
  const { bestHours, bestHoursFallback } = computeBestHours({
    canhGio: hourFrames.canh_gio,
    hourThapThan,
  });

  const chiRel = chiRelation(person.chi, dayParts.chi);
  const napAmRel = napAmRelation(personMenh, dayNapAm.hanh);

  const { verdictScore, verdict } = computeVerdict({
    napAmRel,
    chiRel,
    trucMuc: dayInfo.truc?.muc,
    saoTotXau: dayInfo.nhi_thap_bat_tu?.tot_xau,
  });

  const areas = groundAreas({
    dayThapThan,
    tangCanThapThan,
    gender,
    dayCanChi: dayInfo.can_chi.ngay,
  });

  return {
    person: {
      birthYear,
      gender,
      can: person.can,
      chi: person.chi,
      canChi: person.canChi,
      napAm: hoaGiap.nap_am,
      menh: personMenh,
    },
    day: {
      solar: dayInfo.duong_lich ?? date,
      lunar: dayInfo.am_lich,
      weekday: dayInfo.thu,
      canChi: dayInfo.can_chi.ngay,
      can: dayParts.can,
      chi: dayParts.chi,
      napAm: dayNapAm.napAm,
      hanhNapAm: dayNapAm.hanh,
      truc: dayInfo.truc,
      nhiThapBatTu: dayInfo.nhi_thap_bat_tu,
      gioHoangDao: dayInfo.gio.hoang_dao,
      gioHacDao: dayInfo.gio.hac_dao,
      canhGio: hourFrames.canh_gio,
      canChiRelation: dayCanChiRelation(dayParts.can, dayParts.chi),
      chiCompatibility: chiCompatibility(dayParts.chi),
      napAmAffinity: napAmAffinity(dayNapAm.hanh),
    },
    relation: {
      chiRelation: chiRel,
      napAmRelation: napAmRel,
      dayThapThan,
      dayTangCan,
      tangCanThapThan,
      hourThapThan,
    },
    bestHours,
    bestHoursFallback,
    verdict,
    verdictScore,
    fourAreas: areas,
  };
}
