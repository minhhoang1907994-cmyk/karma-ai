/**
 * Bang tra va cong thuc Can Chi - toan bo la pure function, khong goi network.
 *
 * Nguon bang: Gemini_Gem_XemVanMenh_Instructions (2).md (bang 60 Hoa Giap,
 * Tam hop / Luc hop / Luc xung) va docs/spec/daily-fortune-app.md (BR-01, BR-03,
 * BR-06, BR-07, BR-16).
 */

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];

export const CHI = [
  'Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ',
  'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi',
];

/** Hanh cua tung Thien Can. */
const CAN_HANH = {
  'Giáp': 'Mộc', 'Ất': 'Mộc',
  'Bính': 'Hỏa', 'Đinh': 'Hỏa',
  'Mậu': 'Thổ', 'Kỷ': 'Thổ',
  'Canh': 'Kim', 'Tân': 'Kim',
  'Nhâm': 'Thủy', 'Quý': 'Thủy',
};

/** Ngu hanh tuong sinh: khoa sinh ra gia tri. */
const SINH = { 'Mộc': 'Hỏa', 'Hỏa': 'Thổ', 'Thổ': 'Kim', 'Kim': 'Thủy', 'Thủy': 'Mộc' };

/** Ngu hanh tuong khac: khoa khac gia tri. */
const KHAC = { 'Mộc': 'Thổ', 'Thổ': 'Thủy', 'Thủy': 'Hỏa', 'Hỏa': 'Kim', 'Kim': 'Mộc' };

/**
 * Bang 60 Hoa Giap - nap am di theo cap, moi nap am phu 2 can chi lien tiep,
 * nen chi can 30 cap thay vi 60 dong. Index cap = floor(sexagenary index / 2).
 */
const NAP_AM_PAIRS = [
  ['Hải Trung Kim', 'Kim'], ['Lư Trung Hỏa', 'Hỏa'], ['Đại Lâm Mộc', 'Mộc'],
  ['Lộ Bàng Thổ', 'Thổ'], ['Kiếm Phong Kim', 'Kim'], ['Sơn Đầu Hỏa', 'Hỏa'],
  ['Giản Hạ Thủy', 'Thủy'], ['Thành Đầu Thổ', 'Thổ'], ['Bạch Lạp Kim', 'Kim'],
  ['Dương Liễu Mộc', 'Mộc'], ['Tuyền Trung Thủy', 'Thủy'], ['Ốc Thượng Thổ', 'Thổ'],
  ['Tích Lịch Hỏa', 'Hỏa'], ['Tùng Bách Mộc', 'Mộc'], ['Trường Lưu Thủy', 'Thủy'],
  ['Sa Trung Kim', 'Kim'], ['Sơn Hạ Hỏa', 'Hỏa'], ['Bình Địa Mộc', 'Mộc'],
  ['Bích Thượng Thổ', 'Thổ'], ['Kim Bạc Kim', 'Kim'], ['Phú Đăng Hỏa', 'Hỏa'],
  ['Thiên Hà Thủy', 'Thủy'], ['Đại Trạch Thổ', 'Thổ'], ['Thoa Xuyến Kim', 'Kim'],
  ['Tang Đố Mộc', 'Mộc'], ['Đại Khê Thủy', 'Thủy'], ['Sa Trung Thổ', 'Thổ'],
  ['Thiên Thượng Hỏa', 'Hỏa'], ['Thạch Lựu Mộc', 'Mộc'], ['Đại Hải Thủy', 'Thủy'],
];

/**
 * Tang can cua 12 Dia Chi - ban khi dung dau (BR-16).
 * Ca 12 dong da doi chieu voi /api/battu qua tru nam cac nam 1990-2001.
 */
const TANG_CAN = {
  'Tý': ['Quý'],
  'Sửu': ['Kỷ', 'Quý', 'Tân'],
  'Dần': ['Giáp', 'Bính', 'Mậu'],
  'Mão': ['Ất'],
  'Thìn': ['Mậu', 'Ất', 'Quý'],
  'Tỵ': ['Bính', 'Mậu', 'Canh'],
  'Ngọ': ['Đinh', 'Kỷ'],
  'Mùi': ['Kỷ', 'Đinh', 'Ất'],
  'Thân': ['Canh', 'Nhâm', 'Mậu'],
  'Dậu': ['Tân'],
  'Tuất': ['Mậu', 'Tân', 'Đinh'],
  'Hợi': ['Nhâm', 'Giáp'],
};

/** Bon Chi tu hinh - dung cho truong hop Chi trung nhau (BR-06). */
const TU_HINH = new Set(['Thìn', 'Ngọ', 'Dậu', 'Hợi']);

/**
 * Cac bang quan he Dia Chi.
 *
 * Tam hop / Luc hop / Luc xung: lay tu file nguon.
 * Luc hai / Luc pha / Tam hinh: KHONG co trong file nguon - dung bang co dien
 * tieu chuan. Can nguoi dung xac nhan (xem README, muc "Diem can xac nhan").
 */
const LUC_HOP = [
  ['Tý', 'Sửu'], ['Dần', 'Hợi'], ['Mão', 'Tuất'],
  ['Thìn', 'Dậu'], ['Tỵ', 'Thân'], ['Ngọ', 'Mùi'],
];

const TAM_HOP = [
  ['Thân', 'Tý', 'Thìn'], ['Tỵ', 'Dậu', 'Sửu'],
  ['Dần', 'Ngọ', 'Tuất'], ['Hợi', 'Mão', 'Mùi'],
];

const LUC_HAI = [
  ['Tý', 'Mùi'], ['Sửu', 'Ngọ'], ['Dần', 'Tỵ'],
  ['Mão', 'Thìn'], ['Thân', 'Hợi'], ['Dậu', 'Tuất'],
];

const LUC_PHA = [
  ['Tý', 'Dậu'], ['Sửu', 'Thìn'], ['Dần', 'Hợi'],
  ['Mão', 'Ngọ'], ['Tỵ', 'Thân'], ['Mùi', 'Tuất'],
];

/** Tam hinh gom cac nhom 3 Chi va mot cap tuong hinh Ty - Mao. */
const TAM_HINH_GROUPS = [
  ['Dần', 'Tỵ', 'Thân'], ['Sửu', 'Tuất', 'Mùi'],
];
const TUONG_HINH_PAIR = ['Tý', 'Mão'];

function hasPair(pairs, a, b) {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function sameGroup(groups, a, b) {
  return groups.some((g) => g.includes(a) && g.includes(b));
}

/** Luc xung = hai Chi cach nhau dung 6 vi tri. */
function isLucXung(a, b) {
  const ia = CHI.indexOf(a);
  const ib = CHI.indexOf(b);
  return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 6;
}

/**
 * BR-01: suy Can Chi tu nam duong lich. Khong bao gio nhan tu nguoi dung.
 */
export function canChiFromYear(year) {
  const can = CAN[(((year - 4) % 10) + 10) % 10];
  const chi = CHI[(((year - 4) % 12) + 12) % 12];
  return { can, chi, canChi: `${can} ${chi}` };
}

/** Tach mot chuoi "Mau Ty" thanh { can, chi }. Tra null neu khong hop le. */
export function splitCanChi(canChi) {
  if (typeof canChi !== 'string') return null;
  const parts = canChi.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [can, chi] = parts;
  if (!CAN.includes(can) || !CHI.includes(chi)) return null;
  return { can, chi };
}

/** Vi tri trong chu ky 60 tu cap (can, chi). Tra -1 neu cap khong ton tai. */
export function sexagenaryIndex(can, chi) {
  const c = CAN.indexOf(can);
  const z = CHI.indexOf(chi);
  if (c < 0 || z < 0) return -1;
  if ((c - z) % 2 !== 0) return -1; // Can duong chi ghep Chi duong va nguoc lai
  return (((6 * c - 5 * z) % 60) + 60) % 60;
}

/**
 * Nap am + hanh nap am cua mot cap Can Chi (bang 60 Hoa Giap).
 * Tra null khi cap Can Chi khong ton tai trong chu ky 60.
 */
export function napAm(canChi) {
  const parts = splitCanChi(canChi);
  if (!parts) return null;
  const idx = sexagenaryIndex(parts.can, parts.chi);
  if (idx < 0) return null;
  const [ten, hanh] = NAP_AM_PAIRS[Math.floor(idx / 2)];
  return { napAm: ten, hanh };
}

/** Tang can cua mot Dia Chi (BR-16). Ban khi dung dau. */
export function tangCan(chi) {
  return TANG_CAN[chi] ? [...TANG_CAN[chi]] : null;
}

/** Hanh cua mot Thien Can. */
export function canHanh(can) {
  return CAN_HANH[can] ?? null;
}

/** Can o vi tri chan trong CAN la duong. */
export function isYang(can) {
  const i = CAN.indexOf(can);
  return i < 0 ? null : i % 2 === 0;
}

/**
 * BR-03: Thap Than cua `target` so voi goc `reference`.
 * Quyet dinh boi quan he ngu hanh cong voi cung / khac am duong.
 *
 * Ten dung o day khop dung voi ten API Huyen Minh phat ra, de `dayThapThan`
 * (tinh local) va `bestHours` (lay tu API) khong bao gio hien hai ten khac nhau
 * cho cung mot Thap Than. Cu the: dung 'Thiên Ấn', KHONG dung ten dong nghia
 * 'Kiêu Thần' - da doi chieu 120 to hop voi /api/khunggio.
 */
export function thapThan(reference, target) {
  const a = CAN_HANH[reference];
  const b = CAN_HANH[target];
  if (!a || !b) return null;
  const same = isYang(reference) === isYang(target);

  if (a === b) return same ? 'Tỷ Kiên' : 'Kiếp Tài';
  if (SINH[a] === b) return same ? 'Thực Thần' : 'Thương Quan';
  if (KHAC[a] === b) return same ? 'Thiên Tài' : 'Chính Tài';
  if (KHAC[b] === a) return same ? 'Thất Sát' : 'Chính Quan';
  if (SINH[b] === a) return same ? 'Thiên Ấn' : 'Chính Ấn';
  return null;
}

/**
 * BR-06: quan he giua Chi nam sinh va Chi ngay.
 * Thu tu uu tien, khop dau tien thang:
 *   Chi trung nhau -> Luc xung -> Luc hai -> Luc pha -> Tam hinh -> Luc hop -> Tam hop -> none
 */
export function chiRelation(personChi, dayChi) {
  if (!CHI.includes(personChi) || !CHI.includes(dayChi)) return null;

  if (personChi === dayChi) {
    return TU_HINH.has(personChi) ? 'tu_hinh' : 'none';
  }
  if (isLucXung(personChi, dayChi)) return 'luc_xung';
  if (hasPair(LUC_HAI, personChi, dayChi)) return 'luc_hai';
  if (hasPair(LUC_PHA, personChi, dayChi)) return 'luc_pha';
  if (sameGroup(TAM_HINH_GROUPS, personChi, dayChi)) return 'tam_hinh';
  if (hasPair([TUONG_HINH_PAIR], personChi, dayChi)) return 'tam_hinh';
  if (hasPair(LUC_HOP, personChi, dayChi)) return 'luc_hop';
  if (sameGroup(TAM_HOP, personChi, dayChi)) return 'tam_hop';
  return 'none';
}

/**
 * BR-07: quan he nap am giua menh nguoi va hanh nap am cua ngay.
 */
export function napAmRelation(personMenh, dayHanh) {
  if (!SINH[personMenh] || !SINH[dayHanh]) return null;
  if (personMenh === dayHanh) return 'identical';
  if (SINH[dayHanh] === personMenh) return 'day_generates_person';
  if (SINH[personMenh] === dayHanh) return 'person_generates_day';
  if (KHAC[dayHanh] === personMenh) return 'day_controls_person';
  if (KHAC[personMenh] === dayHanh) return 'person_controls_day';
  return null;
}

/**
 * Ngu hanh cua ngay theo quan he Can - Chi trong chinh ngay do (muc 2 cua Buoc 3).
 * Tra ve quan he giua hanh cua Can ngay va hanh ban khi cua Chi ngay.
 */
export function dayCanChiRelation(dayCan, dayChi) {
  const canH = CAN_HANH[dayCan];
  const banKhi = TANG_CAN[dayChi]?.[0];
  const chiH = banKhi ? CAN_HANH[banKhi] : null;
  if (!canH || !chiH) return null;
  if (canH === chiH) return { relation: 'binh_hoa', canHanh: canH, chiHanh: chiH };
  if (KHAC[canH] === chiH) return { relation: 'can_khac_chi', canHanh: canH, chiHanh: chiH };
  if (KHAC[chiH] === canH) return { relation: 'chi_khac_can', canHanh: canH, chiHanh: chiH };
  if (SINH[canH] === chiH) return { relation: 'can_sinh_chi', canHanh: canH, chiHanh: chiH };
  if (SINH[chiH] === canH) return { relation: 'chi_sinh_can', canHanh: canH, chiHanh: chiH };
  return null;
}

/** Cac Chi hop va xung voi mot Chi cho truoc - dung cho muc (4) cua Buoc 3. */
export function chiCompatibility(chi) {
  if (!CHI.includes(chi)) return null;
  const tamHop = TAM_HOP.find((g) => g.includes(chi))?.filter((c) => c !== chi) ?? [];
  const lucHop = LUC_HOP.find((p) => p.includes(chi))?.find((c) => c !== chi) ?? null;
  const xung = CHI[(CHI.indexOf(chi) + 6) % 12];
  const hai = LUC_HAI.find((p) => p.includes(chi))?.find((c) => c !== chi) ?? null;
  const pha = LUC_PHA.find((p) => p.includes(chi))?.find((c) => c !== chi) ?? null;
  const hinhGroup = TAM_HINH_GROUPS.find((g) => g.includes(chi))?.filter((c) => c !== chi) ?? [];
  const hinh = hinhGroup.length
    ? hinhGroup
    : TUONG_HINH_PAIR.includes(chi)
      ? TUONG_HINH_PAIR.filter((c) => c !== chi)
      : TU_HINH.has(chi) ? [chi] : [];
  return { tamHop, lucHop, xung, hai, pha, hinh };
}
