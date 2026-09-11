/**
 * Contract test doi voi API Huyen Minh THAT - can mang.
 *
 * Mac dinh SKIP de `npm test` van pass khi offline.
 * Chay day du: `npm run test:contract` (hoac RUN_CONTRACT_TESTS=1).
 *
 * Muc dich: neu Huyen Minh doi shape hoac doi so lieu, test nay fail thay vi
 * app am tham dung du lieu sai.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CAN, CHI, thapThan, splitCanChi } from '../src/lib/canchi.js';
import { getDay, getHourFrames, getHoaGiap } from '../src/lib/calendar.js';

const enabled = process.env.RUN_CONTRACT_TESTS === '1';
const opts = { skip: enabled ? false : 'can mang - chay `npm run test:contract`' };

/** Bang tang can nhung trong source, dung de doi chieu voi /api/battu. */
const TANG_CAN_EXPECTED = {
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

test('contract 1: /api/ngay tra du field va dung 6+6 gio', opts, async () => {
  const body = await getDay({ day: 11, month: 9, year: 2026 });
  assert.equal(body.can_chi.ngay, 'Mậu Tý');
  assert.equal(body.am_lich, '1/8/2026');
  assert.equal(body.gio.hoang_dao.length, 6);
  assert.equal(body.gio.hac_dao.length, 6);
  assert.ok(body.truc?.ten && body.truc?.muc);
  assert.ok(body.nhi_thap_bat_tu?.ten && body.nhi_thap_bat_tu?.tot_xau);
  // /api/ngay nhan ngay DUONG va tra lai dung ngay duong da truyen
  assert.equal(body.duong_lich, '11/09/2026');
});

test('contract 2: /api/khunggio tra 12 canh gio va 10 khoa Thap Than', opts, async () => {
  const body = await getHourFrames({ day: 11, month: 9, year: 2026 });
  assert.equal(body.canh_gio.length, 12);
  const keys = Object.keys(body.thap_than_theo_nhat_chu);
  assert.equal(keys.length, 10);
  for (const can of CAN) {
    assert.ok(keys.includes(can), `thieu khoa ${can}`);
    assert.equal(body.thap_than_theo_nhat_chu[can].length, 12, `${can} phai co 12 gia tri`);
  }
});

test('contract 3: thap_than_theo_nhat_chu align dung index voi canh_gio (120 to hop)', opts, async () => {
  const body = await getHourFrames({ day: 11, month: 9, year: 2026 });
  let checked = 0;
  for (const can of CAN) {
    const arr = body.thap_than_theo_nhat_chu[can];
    body.canh_gio.forEach((frame, i) => {
      const parts = splitCanChi(frame.can_chi);
      assert.ok(parts, `canh_gio[${i}].can_chi khong doc duoc: ${frame.can_chi}`);
      assert.equal(arr[i], thapThan(can, parts.can), `nhat chu ${can}, gio index ${i} (${frame.can_chi})`);
      checked += 1;
    });
  }
  assert.equal(checked, 120);
});

test('contract 4: /api/hoagiap dung param `nam`, va bay sai param van con', opts, async () => {
  const body = await getHoaGiap(1994);
  assert.equal(body.can_chi, 'Giáp Tuất');
  assert.equal(body.nap_am, 'Sơn Đầu Hỏa');
  assert.equal(body.hanh_nap_am, 'Hỏa');

  // Bay silent-fail: truyen `y=` thay vi `nam=` -> API KHONG bao loi ma tra nam hien tai.
  // Test nay ghi lai hanh vi do; neu Huyen Minh sua lai thi test fail va ta biet.
  const wrong = await fetch('https://huyenminh.com.vn/api/hoagiap?y=1994').then((r) => r.json());
  assert.notEqual(wrong.can_chi, 'Giáp Tuất', 'API da sua bay sai param — cap nhat BR-02 va spec');
});

test('contract 5: bang tang can 12 dong khop /api/battu (nam 1990-2001)', opts, async () => {
  const seen = new Set();
  for (let year = 1990; year <= 2001; year += 1) {
    const res = await fetch(`https://huyenminh.com.vn/api/battu?d=1&m=6&y=${year}&gio=12`);
    assert.ok(res.ok, `battu ${year} tra HTTP ${res.status}`);
    const body = await res.json();
    const pillar = body.bang_tru?.nam;
    assert.ok(pillar?.chi, `battu ${year} thieu tru nam`);
    assert.deepEqual(
      pillar.tang_can.map((t) => t.can),
      TANG_CAN_EXPECTED[pillar.chi],
      `tang can cua Chi ${pillar.chi} (nam ${year})`,
    );
    seen.add(pillar.chi);
  }
  // 12 nam lien tiep phai phu dung 12 Chi
  assert.equal(seen.size, 12);
  for (const chi of CHI) assert.ok(seen.has(chi), `chua kiem tra Chi ${chi}`);
});

test('contract 6: ngay rat xa trong tuong lai (Q7)', opts, async () => {
  const body = await getDay({ day: 31, month: 12, year: 2099 });
  const parts = splitCanChi(body.can_chi.ngay);
  assert.ok(parts, `Can Chi ngay khong hop le: ${body.can_chi.ngay}`);
  assert.equal(body.duong_lich, '31/12/2099');
});

test('contract 7: nguon tra kem ghi_nguon va ranh_gioi', opts, async () => {
  const body = await getDay({ day: 11, month: 9, year: 2026 });
  assert.match(body.nguon.ghi_nguon, /huyenminh\.com\.vn/);
  assert.ok(body.nguon.ranh_gioi.length > 0);
});
