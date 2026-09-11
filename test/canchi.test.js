import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAN, CHI,
  canChiFromYear, splitCanChi, sexagenaryIndex, napAm, tangCan,
  thapThan, chiRelation, napAmRelation, isYang, chiCompatibility,
} from '../src/lib/canchi.js';

test('BR-01: suy Can Chi tu nam sinh', () => {
  assert.equal(canChiFromYear(1994).canChi, 'Giáp Tuất');
  assert.equal(canChiFromYear(1990).canChi, 'Canh Ngọ');
  assert.equal(canChiFromYear(1924).canChi, 'Giáp Tý');
  assert.equal(canChiFromYear(1984).canChi, 'Giáp Tý');
  assert.equal(canChiFromYear(2044).canChi, 'Giáp Tý');
  assert.equal(canChiFromYear(2026).canChi, 'Bính Ngọ');
});

test('BR-01: chu ky lap dung 60 nam', () => {
  for (let y = 1900; y < 1960; y += 1) {
    assert.equal(canChiFromYear(y).canChi, canChiFromYear(y + 60).canChi, `nam ${y}`);
  }
});

test('chu ky 60 chi co dung 60 cap Can Chi hop le', () => {
  const valid = [];
  for (const c of CAN) for (const z of CHI) if (sexagenaryIndex(c, z) >= 0) valid.push(`${c} ${z}`);
  assert.equal(valid.length, 60);
  assert.equal(new Set(valid.map((v) => sexagenaryIndex(...v.split(' ')))).size, 60);
});

test('bang 60 Hoa Giap tra nap am cho moi cap hop le', () => {
  for (const c of CAN) for (const z of CHI) {
    if (sexagenaryIndex(c, z) < 0) continue;
    const r = napAm(`${c} ${z}`);
    assert.ok(r?.napAm && r?.hanh, `thieu nap am cho ${c} ${z}`);
  }
});

test('bang 60 Hoa Giap: doi chieu mau voi file nguon', () => {
  // Lay tu Gemini_Gem_XemVanMenh_Instructions (2).md
  const expected = [
    ['Giáp Tý', 'Hải Trung Kim', 'Kim'],
    ['Bính Dần', 'Lư Trung Hỏa', 'Hỏa'],
    ['Canh Ngọ', 'Lộ Bàng Thổ', 'Thổ'],
    ['Giáp Tuất', 'Sơn Đầu Hỏa', 'Hỏa'],
    ['Mậu Tý', 'Tích Lịch Hỏa', 'Hỏa'],
    ['Mậu Tuất', 'Bình Địa Mộc', 'Mộc'],
    ['Bính Ngọ', 'Thiên Hà Thủy', 'Thủy'],
    ['Nhâm Tý', 'Tang Đố Mộc', 'Mộc'],
    ['Quý Hợi', 'Đại Hải Thủy', 'Thủy'],
  ];
  for (const [canChi, ten, hanh] of expected) {
    assert.deepEqual(napAm(canChi), { napAm: ten, hanh }, canChi);
  }
});

test('nap am tra null cho cap Can Chi khong ton tai', () => {
  assert.equal(napAm('Giáp Sửu'), null); // Can duong khong ghep Chi am
  assert.equal(napAm('khong phai can chi'), null);
  assert.equal(splitCanChi('Giáp'), null);
});

test('BR-16: bang tang can 12 dong, khop /api/battu', () => {
  // Ca 12 dong da doi chieu voi /api/battu qua tru nam 1990-2001
  const expected = {
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
  for (const chi of CHI) assert.deepEqual(tangCan(chi), expected[chi], chi);
  assert.equal(tangCan('khong ton tai'), null);
});

test('am duong cua Thien Can', () => {
  assert.equal(isYang('Giáp'), true);
  assert.equal(isYang('Ất'), false);
  assert.equal(isYang('Quý'), false);
  assert.equal(isYang('Nhâm'), true);
});

test('BR-03: Thap Than khop /api/battu (nhat chu Canh)', () => {
  // 4/4 gia tri da doi chieu voi /api/battu?d=11&m=9&y=1994&gio=10
  assert.equal(thapThan('Canh', 'Giáp'), 'Thiên Tài');
  assert.equal(thapThan('Canh', 'Quý'), 'Thương Quan');
  assert.equal(thapThan('Canh', 'Nhâm'), 'Thực Thần');
  assert.equal(thapThan('Canh', 'Bính'), 'Thất Sát');
  // API Huyen Minh dung ten 'Thiên Ấn', khong dung ten dong nghia 'Kiêu Thần'
  assert.equal(thapThan('Canh', 'Mậu'), 'Thiên Ấn');
});

test('BR-03: Thap Than voi goc Giap - dung cho worked example', () => {
  assert.equal(thapThan('Giáp', 'Giáp'), 'Tỷ Kiên');
  assert.equal(thapThan('Giáp', 'Ất'), 'Kiếp Tài');
  assert.equal(thapThan('Giáp', 'Mậu'), 'Thiên Tài');
  assert.equal(thapThan('Giáp', 'Quý'), 'Chính Ấn');
  assert.equal(thapThan('Giáp', 'Tân'), 'Chính Quan');
  assert.equal(thapThan('Giáp', 'Đinh'), 'Thương Quan');
});

test('BR-03: moi cap Can x Can deu ra dung 1 trong 10 Thap Than', () => {
  const names = new Set();
  for (const a of CAN) for (const b of CAN) {
    const tt = thapThan(a, b);
    assert.ok(tt, `${a} vs ${b}`);
    names.add(tt);
  }
  assert.equal(names.size, 10);
});

test('BR-06: Chi trung nhau', () => {
  // Bon Chi tu hinh
  for (const chi of ['Thìn', 'Ngọ', 'Dậu', 'Hợi']) {
    assert.equal(chiRelation(chi, chi), 'tu_hinh', chi);
  }
  // Tam Chi con lai khong phai tu hinh, va KHONG duoc tra tam_hop
  for (const chi of ['Tý', 'Sửu', 'Dần', 'Mão', 'Tỵ', 'Mùi', 'Thân', 'Tuất']) {
    assert.equal(chiRelation(chi, chi), 'none', chi);
  }
});

test('BR-06: luc xung, luc hop, tam hop, hai, pha, hinh', () => {
  assert.equal(chiRelation('Tý', 'Ngọ'), 'luc_xung');
  assert.equal(chiRelation('Thìn', 'Tuất'), 'luc_xung');
  assert.equal(chiRelation('Mão', 'Tuất'), 'luc_hop');
  assert.equal(chiRelation('Thân', 'Thìn'), 'tam_hop');
  assert.equal(chiRelation('Tý', 'Mùi'), 'luc_hai');
  assert.equal(chiRelation('Tý', 'Dậu'), 'luc_pha');
  // Sửu-Tuất thuoc nhom tam hinh Sửu-Tuất-Mùi va khong trung bang nao khac
  assert.equal(chiRelation('Sửu', 'Tuất'), 'tam_hinh');
  assert.equal(chiRelation('Tý', 'Mão'), 'tam_hinh');
  // Worked example A: Tuat (1994) vs Ty (ngay 11/9/2026)
  assert.equal(chiRelation('Tuất', 'Tý'), 'none');
});

test('BR-06: thu tu uu tien khi mot cap thuoc nhieu bang', () => {
  // Dan-Hoi va Ty-Than co trong ca Luc hop va Luc pha -> pha xet truoc hop
  assert.equal(chiRelation('Dần', 'Hợi'), 'luc_pha');
  assert.equal(chiRelation('Tỵ', 'Thân'), 'luc_pha');
  // Dan-Ty va Than-Hoi co trong ca Luc hai va Tam hinh -> hai xet truoc hinh
  assert.equal(chiRelation('Dần', 'Tỵ'), 'luc_hai');
  assert.equal(chiRelation('Thân', 'Hợi'), 'luc_hai');
  // Mui-Tuat co trong ca Luc pha va Tam hinh -> pha xet truoc hinh
  assert.equal(chiRelation('Mùi', 'Tuất'), 'luc_pha');
  // Suu-Mui la luc xung, thang tat ca
  assert.equal(chiRelation('Sửu', 'Mùi'), 'luc_xung');
});

test('BR-06: quan he doi xung theo ca hai chieu', () => {
  for (const a of CHI) for (const b of CHI) {
    assert.equal(chiRelation(a, b), chiRelation(b, a), `${a} / ${b}`);
  }
});

test('BR-07: quan he nap am', () => {
  assert.equal(napAmRelation('Hỏa', 'Hỏa'), 'identical');
  assert.equal(napAmRelation('Hỏa', 'Mộc'), 'day_generates_person');
  assert.equal(napAmRelation('Hỏa', 'Thổ'), 'person_generates_day');
  assert.equal(napAmRelation('Hỏa', 'Thủy'), 'day_controls_person');
  assert.equal(napAmRelation('Hỏa', 'Kim'), 'person_controls_day');
  assert.equal(napAmRelation('Hỏa', 'khong hop le'), null);
});

test('chiCompatibility tra du 6 quan he cho moi Chi', () => {
  for (const chi of CHI) {
    const c = chiCompatibility(chi);
    assert.equal(c.tamHop.length, 2, `tam hop ${chi}`);
    assert.ok(c.lucHop, `luc hop ${chi}`);
    assert.equal(c.xung, CHI[(CHI.indexOf(chi) + 6) % 12], `xung ${chi}`);
    assert.ok(c.hai && c.pha, `hai/pha ${chi}`);
  }
  assert.equal(chiCompatibility('khong ton tai'), null);
});
