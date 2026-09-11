# App Xem Vận Mệnh Ngày — Specification

## 1. Tổng quan (Overview)

- **Mục đích**: Web app nhận năm sinh + giới tính + ngày dương lịch, tự tính dữ liệu lịch/mệnh lý từ API, rồi sinh ra bộ nguyên liệu để dựng video dọc 20 giây (2 clip 10s): 2 prompt tạo ảnh, 2 prompt video có nhúng lời voice, và 2 khối text đầy đủ. Thay thế quy trình thủ công qua Gem trên gemini.google.com.
- **Actor**: Content creator (một người dùng duy nhất — chủ app)
- **Priority**: High
- **Phase**: Phase 1 (bản dùng cá nhân, deploy Render)
- **Stack**: Node + Express. Một service duy nhất vừa serve `index.html` static vừa host `/api/fortune`. **Không build step** — HTML/CSS/JS viết thẳng, không bundler, không framework frontend. Lý do: deploy Render nhanh nhất, và `.env` nằm phía server nên `GEMINI_API_KEY` không thể lọt ra client.
- **Ngày soạn**: 2026-09-11
- **Version**: 1.5

## 2. User Story

> As a **content creator**, I want to **nhập năm sinh, giới tính và ngày cần xem rồi nhận ngay 2 prompt ảnh + 2 prompt video có lời voice + 2 khối text đầy đủ**, so that **tôi dựng được video vận mệnh 20 giây mà không phải tự tra lịch vạn niên hay copy-paste qua nhiều công cụ**.

## 3. Actors & Permissions

| Actor | Quyền | Điều kiện |
|-------|-------|-----------|
| Content creator (chủ app) | read (gọi API sinh kết quả) | Không cần đăng nhập — app dùng cá nhân, Phase 1 |
| System (server) | call external API (Huyền Minh, Gemini) | API key Gemini lấy từ env var phía server |

Không có phân quyền nội bộ ở Phase 1. Xem section 21 (Không nằm trong scope) và Open Questions Q8.

## 4. Entity Schema

### 4.1 Entities bị ảnh hưởng

**N/A — app stateless, không có database.**

Lý do: theo clarify (mục 2.3), app không lưu lịch sử, mỗi request tự đủ. Không có migration, không có table.

Thay vào đó, section 4.3 định nghĩa **data contract nội bộ** — cấu trúc dữ liệu truyền giữa các bước xử lý, để implementer không tự suy đoán shape.

### 4.2 External data sources

| Source | Endpoint | Auth | Cung cấp |
|---|---|---|---|
| Huyền Minh | `GET /api/hoagiap?nam=<year>` | none | `can_chi`, `can`, `chi`, `nap_am`, `hanh_nap_am` |
| Huyền Minh | `GET /api/ngay?d&m&y` | none | `can_chi.{ngay,thang,nam}`, `am_lich`, `thu`, `truc.{ten,muc,nen,ky}`, `nhi_thap_bat_tu.{ten,sao,tot_xau,nen,ky}`, `gio.hoang_dao[]`, `gio.hac_dao[]` |
| Huyền Minh | `GET /api/khunggio?d&m&y` | none | `canh_gio[].{chi,khung,can_chi,hoang_dao,hanh}`, `thap_than_theo_nhat_chu{<can>: string[12]}` |
| Gemini | `models/gemini-2.5-flash:generateContent` | `<GEMINI_API_KEY>` | Văn bản luận giải, tóm tắt bullet, lời voice |
| Gemini | `models/gemini-2.5-flash-image:generateContent` | `<GEMINI_API_KEY>` | 2 ảnh 9:16 (inline base64) |

### 4.3 Internal data contract

**`FortuneRequest`**

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `birthYear` | integer | YES | 1900 ≤ v ≤ 2100 | Năm sinh dương lịch |
| `gender` | enum | YES | `"male"` \| `"female"` | Quyết định mapping mảng *tình cảm* |
| `date` | string | YES | `YYYY-MM-DD`, là ngày hợp lệ | Ngày dương lịch cần xem |

**`ComputedData`** (kết quả bước tính toán, input cho Gemini)

| Field | Type | Nguồn |
|---|---|---|
| `person.birthYear` | integer | request |
| `person.gender` | enum | request |
| `person.canChi` | string | `/api/hoagiap` + assert công thức local |
| `person.can` | string | derived |
| `person.chi` | string | derived |
| `person.napAm` | string | `/api/hoagiap` |
| `person.menh` | enum(Kim/Mộc/Thủy/Hỏa/Thổ) | `/api/hoagiap.hanh_nap_am` |
| `day.solar` | string | request |
| `day.lunar` | string | `/api/ngay.am_lich` |
| `day.weekday` | string | `/api/ngay.thu` |
| `day.canChi` | string | `/api/ngay.can_chi.ngay` |
| `day.can`, `day.chi` | string | derived |
| `day.napAm` | string | **bảng 60 Hoa Giáp local** (tra theo `day.canChi`) |
| `day.hanhNapAm` | enum | bảng local |
| `day.truc` | object | `/api/ngay.truc` |
| `day.nhiThapBatTu` | object | `/api/ngay.nhi_thap_bat_tu` |
| `day.gioHoangDao[]` | array(6) | `/api/ngay.gio.hoang_dao` |
| `day.gioHacDao[]` | array(6) | `/api/ngay.gio.hac_dao` |
| `day.canhGio[]` | array(12) | `/api/khunggio.canh_gio` |
| `relation.chiRelation` | enum | tính local (BR-06) |
| `relation.napAmRelation` | enum | tính local (BR-07) |
| `relation.dayThapThan` | string | tính local (BR-03) |
| `relation.hourThapThan[]` | array(12) | `/api/khunggio.thap_than_theo_nhat_chu[person.can]` |
| `relation.dayTangCan[]` | array(1–3) | **bảng tàng can local** (tra theo `day.chi`) — BR-16 |
| `relation.tangCanThapThan[]` | array(1–3) | tính local: BR-03 áp cho từng tàng can. Trả ra response dưới tên `meta.dayTangCanThapThan` |
| `bestHours[]` | array of `{gio, khung, thapThan}` | tính local (BR-08) |
| `bestHoursFallback` | boolean | tính local (BR-08) — `true` khi giao tập rỗng |
| `verdict` | enum(CÁT/TRUNG BÌNH/CẦN THẬN TRỌNG) | tính local (BR-09) |
| `verdictScore` | integer | tính local (BR-09) — điểm thô, để debug và để test assert |
| `fourAreas` | object | mapping local (BR-05 + BR-16). **Internal + trả ra `part2.areas`** |

## 5. API Contract

### 5.1 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | Trang app (static HTML) |
| GET | `/api/health` | none | Health check cho Render |
| POST | `/api/fortune` | none | Sinh toàn bộ kết quả 2 phần |

### 5.2 Request/Response chi tiết

**POST /api/fortune**

Request Headers:
```
Content-Type: application/json
```

Request Body: theo `FortuneRequest` (section 4.3)

```json
{ "birthYear": 1994, "gender": "male", "date": "2026-09-11" }
```

Response Success (`200`):

```json
{
  "data": {
    "meta": {
      "person": { "birthYear": 1994, "canChi": "Giáp Tuất", "napAm": "Sơn Đầu Hỏa", "menh": "Hỏa", "gender": "male" },
      "day": { "solar": "11/09/2026", "lunar": "1/8/2026", "weekday": "Thứ Sáu", "canChi": "Mậu Tý", "napAm": "Tích Lịch Hỏa" },
      "dayThapThan": "Thiên Tài",
      "dayTangCanThapThan": ["Chính Ấn"],
      "bestHours": [
        { "gio": "Sửu", "khung": "1h-3h", "thapThan": "Chính Ấn" },
        { "gio": "Ngọ", "khung": "11h-13h", "thapThan": "Thiên Tài" },
        { "gio": "Dậu", "khung": "17h-19h", "thapThan": "Chính Quan" }
      ],
      "bestHoursFallback": false,
      "verdictScore": 2,
      "verdict": "TRUNG BÌNH",
      "credit": "Nguồn: Huyền Minh — huyenminh.com.vn",
      "disclaimer": "Nội dung mang tính tham khảo, thuộc văn hóa dân gian — không phải lời khuyên y tế, tài chính hay pháp lý."
    },
    "part1": {
      "fullText": "<khối text đầy đủ mục 1-7, read-only>",
      "imagePrompt": "<prompt tạo ảnh 1>",
      "videoPrompt": "<prompt Veo 10s tiếng Anh, có nhúng lời voice — xem ví dụ bên dưới>",
      "videoPromptVi": "<dịch nghĩa tiếng Việt>",
      "image": { "status": "generated", "mimeType": "image/png", "dataBase64": "<...>" }
    },
    "part2": {
      "fullText": "<khối text đầy đủ tử vi 4 mảng + câu chốt>",
      "areas": {
        "taiLoc": { "source": "Thiên Tài", "tone": "active", "text": "<...>" },
        "congViec": { "source": "Chính Ấn", "tone": "active", "text": "<...>" },
        "sucKhoe": { "source": "Chính Ấn", "tone": "active", "text": "<...>" },
        "tinhCam": { "source": "Thiên Tài", "tone": "active", "text": "<...>" }
      },
      "imagePrompt": "<prompt tạo ảnh 2>",
      "videoPrompt": "<prompt Veo 10s tiếng Anh, có nhúng lời voice>",
      "videoPromptVi": "<dịch nghĩa tiếng Việt>",
      "image": { "status": "fallback", "reason": "IMAGE_QUOTA_EXCEEDED", "dataBase64": null }
    }
  }
}
```

`part2.areas[*].source` là tên Thập Thần đã ground mảng đó, hoặc `null` khi mảng không có yếu tố nổi bật (BR-16). `tone` ∈ `"active"` | `"neutral"`.

**Ví dụ `videoPrompt`** — prompt tiếng Anh, lời voice tiếng Việt đặt trong khối dialogue (BR-15):

```
Subtle cinematic slow zoom-in on an Eastern ink-wash style mountain-and-ember
background with a faint bagua wheel, soft ember particles drifting upward in the
background only. The Vietnamese text overlay card stays perfectly sharp, static and
fully readable at all times. Serene mysterious mood, warm golden-red ambient lighting.
10 second duration.

Voiceover (Vietnamese, warm low female voice, slow pace):
"Ngày Mậu Tý, sáu giờ hoàng đạo mở lối. Nạp âm Tích Lịch Hỏa gặp mệnh Hỏa của bạn,
khí trời bình hòa. Hãy chọn giờ Ngọ mà khởi sự."
```

`image.status` ∈ `"prompt_only"` | `"generated"` | `"fallback"` (BR-19). Mặc định là `"prompt_only"` — app không gọi API ảnh, client hiển thị `imagePrompt` kèm hướng dẫn dán sang Gemini app. `"fallback"` chỉ xuất hiện ở chế độ `api` khi call ảnh lỗi (BR-11).

Response Errors:

| HTTP Code | Error Code | Condition | Message |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `birthYear` ngoài 1900–2100, `gender` không thuộc enum, `date` sai format hoặc không tồn tại | "Dữ liệu đầu vào không hợp lệ" |
| 422 | `CANCHI_ASSERT_FAILED` | `can_chi` từ `/api/hoagiap` không khớp công thức local (BR-02) | "Không xác nhận được Can Chi năm sinh" |
| 502 | `CALENDAR_API_FAILED` | `/api/ngay`, `/api/khunggio` hoặc `/api/hoagiap` trả non-2xx hoặc JSON sai shape | "Không lấy được dữ liệu lịch" |
| 502 | `TEXT_GENERATION_FAILED` | Gemini text call thất bại sau khi hết retry | "Không sinh được nội dung luận giải" |
| 504 | `UPSTREAM_TIMEOUT` | External call vượt timeout (BR-12) | "Nguồn dữ liệu phản hồi quá chậm" |
| 429 | `RATE_LIMITED` | Vượt rate limit nội bộ của app (BR-17). Response kèm `retryAfterSeconds` | "Bạn gọi quá nhanh, thử lại sau {n} giây" |
| 429 | `UPSTREAM_QUOTA_EXCEEDED` | Gemini **text** trả 429 sau khi hết retry. Response kèm `retryAfterSeconds` nếu upstream cung cấp, ngược lại `null` | "Quota Gemini đã cạn, thử lại sau" |

Error response body (mọi mã lỗi dùng chung shape này):

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Bạn gọi quá nhanh, thử lại sau 37 giây",
    "retryAfterSeconds": 37
  }
}
```

`retryAfterSeconds` chỉ có ở `RATE_LIMITED` và `UPSTREAM_QUOTA_EXCEEDED`; ở mọi mã khác field này vắng mặt. Với `UPSTREAM_QUOTA_EXCEEDED`, nếu upstream không cung cấp thì giá trị là `null`.

Lưu ý: lỗi khi sinh **ảnh** KHÔNG trả HTTP error — degrade thành `image.status: "fallback"` trong response 200 (BR-11).

## 6. Điều kiện tiên quyết (Preconditions)

- [ ] Env var `GEMINI_API_KEY` đã được set trên Render dashboard (không commit `.env`)
- [ ] Billing đã bật cho Google AI project — model sinh ảnh không có free tier (clarify mục 4.2)
- [ ] Bảng 60 Hoa Giáp đã được nhúng vào source (60 dòng, lấy từ `Gemini_Gem_XemVanMenh_Instructions (2).md`)
- [ ] Bảng Tam hợp / Lục hợp / Lục xung đã được nhúng vào source
- [ ] Bảng màu + biểu tượng 5 mệnh đã được nhúng vào source
- [ ] `huyenminh.com.vn` accessible từ Render (outbound HTTPS)

## 7. Luồng chính (Main Flow)

| # | Actor | Hành động | System Response |
|---|---|---|---|
| 1 | Creator | Mở app | Hiện form: dropdown năm sinh, radio giới tính, date picker |
| 2 | Creator | Chọn năm sinh | Hiện Can Chi read-only tính từ công thức local (BR-01) |
| 3 | Creator | Chọn giới tính + ngày xem, bấm "Xem" | Client POST `/api/fortune`, hiện loading |
| 4 | System | Validate input | Sai → 400 `VALIDATION_ERROR` |
| 5 | System | Gọi song song 3 endpoint Huyền Minh | Fail → 502 `CALENDAR_API_FAILED` |
| 6 | System | Assert `can_chi` khớp công thức local (BR-02) | Lệch → 422 `CANCHI_ASSERT_FAILED` |
| 7 | System | Tính local: nạp âm ngày, Thập Thần ngày, quan hệ Chi, quan hệ nạp âm, giờ tốt nhất, verdict, mapping 4 mảng (BR-03…BR-09) | Ra `ComputedData` |
| 8 | System | Gọi Gemini text 1 lần, truyền `ComputedData` + system prompt có `ranh_gioi` (BR-10) | Nhận JSON: fullText/bullet/voice/prompt cho cả 2 phần |
| 9 | System | Gọi Gemini image 2 lần với 2 prompt ảnh | Lỗi → `image.status: "fallback"` (BR-11) |
| 10 | System | Trả response 200 | |
| 11 | Creator | Đọc kết quả, copy từng khối | Render 2 phần × (ảnh + prompt ảnh + prompt video + text đầy đủ), mỗi prompt trong code block có nút Copy. Footer hiện credit Huyền Minh (BR-10) |

## 7b. Flow Diagram

```
([Creator]) → [Form: năm sinh / giới tính / ngày] → [POST /api/fortune] → <Input hợp lệ?>
                                                                                ↓ No
                                                                          [400 VALIDATION_ERROR]
                                                                                ↓ Yes
                                          [Gọi song song: /api/hoagiap + /api/ngay + /api/khunggio]
                                                                                ↓
                                                                    <Can Chi khớp công thức?>
                                                        ↓ No                          ↓ Yes
                                            [422 CANCHI_ASSERT_FAILED]    [Tính local: Thập Thần,
                                                                           quan hệ Chi, nạp âm,
                                                                           giờ tốt, verdict, 4 mảng]
                                                                                ↓
                                                                     [Gemini text: sinh văn bản]
                                                                                ↓
                                                                        <Text thành công?>
                                                        ↓ No                          ↓ Yes
                                            [502 TEXT_GENERATION_FAILED]   [Gemini image × 2]
                                                                                ↓
                                                                        <Ảnh thành công?>
                                                        ↓ No                          ↓ Yes
                                            [status=fallback, trả prompt]   [status=generated]
                                                        └──────────┬───────────────────┘
                                                                   ↓
                                                    [200: 2 phần × 3 khối + credit]
```

> Mermaid source: [assets/daily-fortune-app-img1.mmd](assets/daily-fortune-app-img1.mmd) — render tại <https://mermaid.live>

## 8. Luồng thay thế (Alternative Flows)

### 8.1 Ảnh sinh thất bại (fallback xuất prompt)

- Điều kiện kích hoạt: tại bước 9, Gemini image trả 429 / lỗi quota / lỗi khác
- Luồng:
  1. System ghi `image.status = "fallback"`, `image.reason = <mã lỗi>`
  2. Vẫn trả response 200 với đầy đủ `imagePrompt`
  3. Client hiện banner: "Không sinh được ảnh — copy prompt dưới đây dán vào Gemini app"
- Kết quả: người dùng vẫn hoàn thành được video, chỉ thêm 1 bước thủ công

### 8.2 Một trong hai ảnh thành công

- Điều kiện kích hoạt: tại bước 9, ảnh 1 OK, ảnh 2 fail (hoặc ngược lại)
- Luồng: xử lý độc lập từng ảnh, mỗi `part` có `image.status` riêng
- Kết quả: phần nào có ảnh thì hiện ảnh, phần nào không thì hiện prompt

### 8.3 Chọn ngày tương lai

- Điều kiện kích hoạt: tại bước 3, `date` > hôm nay
- Luồng: xử lý y như ngày quá khứ/hiện tại — API Huyền Minh trả dữ liệu cho ngày tương lai bình thường (đã verify với 2026)
- Kết quả: không khác biệt. Đây là luồng được hỗ trợ chính thức (clarify mục 4.3)

## 9. Luồng lỗi (Exception Flows)

Phần lớn đã cover ở section 5.2. Các luồng phức tạp bổ sung:

### 9.1 Gemini text trả JSON sai shape

System validate response theo schema trước khi dùng. Sai → retry 1 lần với prompt nhấn mạnh format. Vẫn sai → 502 `TEXT_GENERATION_FAILED`.

### 9.2 `/api/hoagiap` trả sai năm (silent-fail)

Đây là bẫy đã xác nhận: truyền sai tên tham số thì API trả năm hiện tại mà không báo lỗi (clarify mục 5.1). BR-02 bắt buộc assert, chặn trước khi dữ liệu sai lan xuống.

## 10. Business Rules

- **BR-01**: Can Chi of the birth year is derived, never user-supplied. `can = CAN[(year - 4) mod 10]`, `chi = CHI[(year - 4) mod 12]`, where `CAN = [Giáp, Ất, Bính, Đinh, Mậu, Kỷ, Canh, Tân, Nhâm, Quý]` and `CHI = [Tý, Sửu, Dần, Mão, Thìn, Tỵ, Ngọ, Mùi, Thân, Dậu, Tuất, Hợi]`.
- **BR-02**: The `can_chi` value returned by `/api/hoagiap` MUST equal the value computed by BR-01. On mismatch, the request fails with `CANCHI_ASSERT_FAILED` and no partial result is returned.
- **BR-03**: Thập Thần of a target stem relative to a reference stem is determined by element relation plus yin-yang parity of the two stems:

  | Element relation | Same parity | Different parity |
  |---|---|---|
  | identical | Tỷ Kiên | Kiếp Tài |
  | reference generates target | Thực Thần | Thương Quan |
  | reference controls target | Thiên Tài | Chính Tài |
  | target controls reference | Thất Sát | Chính Quan |
  | target generates reference | Thiên Ấn | Chính Ấn |

  Generation cycle: Mộc→Hỏa→Thổ→Kim→Thủy→Mộc. Control cycle: Mộc→Thổ→Thủy→Hỏa→Kim→Mộc. Stems at even index in `CAN` are yang, odd index are yin.

  **Naming**: the same-parity Ấn is named **`Thiên Ấn`**, not its synonym `Kiêu Thần`. The calendar API emits `Thiên Ấn`, and `bestHours` carries the API's own labels while `dayThapThan` is computed locally — using the synonym would print two different names for one Thập Thần inside a single response. Verified against `/api/khunggio` across all **120** (stem x hour) combinations; contract test 3 re-checks this on every run.
- **BR-04**: In Tier A, the reference stem is the **birth-year stem**, not the true Bát Tự day-master. The UI MUST label this as a simplified method.
- **BR-05**: Thập Thần of the day maps to the four life areas as follows. `gender` selects the love-life source:

  | Thập Thần | Primary area | Secondary |
  |---|---|---|
  | Tỷ Kiên | Công việc (peers) | — |
  | Kiếp Tài | Công việc (competition) | Tài lộc (warning: drain) |
  | Thực Thần | Sức khỏe | Công việc (creative output) |
  | Thương Quan | Sức khỏe | Công việc (creative friction) |
  | Chính Tài / Thiên Tài | Tài lộc | Tình cảm if `gender = male` |
  | Chính Quan / Thất Sát | Công việc (authority) | Tình cảm if `gender = female` |
  | Chính Ấn / Kiêu Thần | Sức khỏe (nourished) | Công việc (learning, support) |

  Both the primary and the secondary column resolve to one of exactly four area keys: `taiLoc`, `tinhCam`, `sucKhoe`, `congViec`. No other area name is valid.

  Every one of the four areas MUST appear in the output. Areas are grounded by BR-16; an area with no grounding source is emitted with `source: null`, `tone: "neutral"`, and text drawn from the fixed neutral template in BR-16 — the LLM MUST NOT invent activity for an ungrounded area.
- **BR-06**: Chi relation between birth-year Chi and day Chi is resolved in this precedence order, first match wins: **identical Chi** → Lục xung → Lục hại → Lục phá → Tam hình → Lục hợp → Tam hợp → none. Tables are embedded from the source document.

  **Identical Chi** (birth-year Chi equals day Chi) resolves to `tu_hinh` when the Chi is one of `{Thìn, Ngọ, Dậu, Hợi}` — the four self-punishing branches — and to `none` for the other eight. It is never Tam hợp, even though a branch shares a trine group with itself.

  **Provenance warning**: the source document supplies only the **Tam hợp, Lục hợp and Lục xung** tables. The **Lục hại, Lục phá and Tam hình** tables are standard classical tables added during implementation and are **not traceable to the source document** — see Q12.

  **Precedence side effect**: several pairs appear in more than one table, and the precedence order decides which label wins. Verified in `test/canchi.test.js`:

  | Pair | Tables it belongs to | Resolved as |
  |---|---|---|
  | Dần–Hợi, Tỵ–Thân | Lục hợp + Lục phá | `luc_pha` |
  | Dần–Tỵ, Thân–Hợi | Lục hại + Tam hình | `luc_hai` |
  | Mùi–Tuất | Lục phá + Tam hình | `luc_pha` |
  | Sửu–Mùi | Lục xung + Tam hình | `luc_xung` |

  Only Sửu–Tuất and Tý–Mão actually surface as `tam_hinh`. If that absorption is not intended, the precedence order in BR-06 needs revising.
- **BR-07**: Nạp âm relation compares `person.menh` against `day.hanhNapAm` using the generation and control cycles in BR-03. Result is one of: `day_generates_person`, `person_generates_day`, `day_controls_person`, `person_controls_day`, `identical`.
- **BR-08**: `bestHours` = hours that satisfy BOTH conditions: (a) `hoang_dao = true` in `/api/khunggio.canh_gio`, AND (b) the hour's Thập Thần (from `thap_than_theo_nhat_chu[person.can]`, index-aligned to `canh_gio`) belongs to the favorable set `{Chính Quan, Chính Ấn, Chính Tài, Thực Thần, Tỷ Kiên, Thiên Tài}`. If the intersection is empty, `bestHours` falls back to all `hoang_dao = true` hours and the response marks `bestHoursFallback = true`.
- **BR-09**: `verdict` is computed, not generated by the LLM. Scoring: `+2` if `napAmRelation ∈ {day_generates_person, person_generates_day}`, `-2` if `day_controls_person`, `-1` if `person_controls_day`, `0` if `identical`; `+2` if Chi relation is Tam hợp or Lục hợp, `-2` if Lục xung, `-1` if Lục hại / Lục phá / Tam hình, `0` if none; `-1` if `tu_hinh`; `+1` if `truc.muc = "tốt"`, `+1` if `nhi_thap_bat_tu.tot_xau = "tốt"`, `-1` each if `"xấu"`. The raw total is exposed as `verdictScore`. Total `≥ 3` → `CÁT`; `≤ -2` → `CẦN THẬN TRỌNG`; otherwise `TRUNG BÌNH`.

  **Worked example A** (`birthYear = 1994`, `date = 2026-09-11`, real API data): napÂm Sơn Đầu Hỏa vs Tích Lịch Hỏa → `identical` = `0`; Chi Tuất ↔ Chi Tý → no relation = `0`; `truc.muc = "tốt"` (Bình) = `+1`; `nhi_thap_bat_tu.tot_xau = "tốt"` (Lâu Kim Cẩu) = `+1`. `verdictScore = 2` → `TRUNG BÌNH`.

  **Worked example B** (`birthYear = 1994`, `date = 2026-09-21`, real API data — day Mậu Tuất): napÂm Sơn Đầu Hỏa (Hỏa) vs Bình Địa Mộc (Mộc) → Mộc generates Hỏa → `day_generates_person` = `+2`; Chi Tuất ↔ Chi Tuất → identical, Tuất is not a self-punishing branch → `none` = `0`; `truc.muc = "tốt"` (Trừ) = `+1`; `nhi_thap_bat_tu.tot_xau = "tốt"` (Trương Nguyệt Lộc) = `+1`. `verdictScore = 4` → `CÁT`.

  Example A is the calibration reference for Q4: a day with both a good trực and a good sao but no elemental support still lands on `TRUNG BÌNH`. Example B shows `CÁT` is reachable once the nạp âm relation is favourable.
- **BR-10**: Every response MUST carry the string `Nguồn: Huyền Minh — huyenminh.com.vn` in `meta.credit`, and the UI MUST render it. The `nguon.ranh_gioi` text returned by the calendar API MUST be injected into the Gemini system prompt verbatim, and the generated text MUST NOT predict lifespan, illness, divorce, or bankruptcy.
- **BR-11**: Image generation failure degrades, never fails the request. The endpoint returns `200` with `image.status = "fallback"` and a non-empty `imagePrompt`.

- **BR-19**: Image delivery has two modes, selected by the `IMAGE_MODE` environment variable.

  | Mode | Behaviour | `image.status` | Cost |
  |---|---|---|---|
  | `prompt` (**default**) | No image API call is made at all. The response carries the finished image prompt for the user to paste into the Gemini app. | `prompt_only` | free |
  | `api` | Two image calls run in parallel per BR-12. | `generated`, or `fallback` per BR-11 | paid — no free tier exists for any image model |

  `prompt_only` is the intended outcome, not a failure: the UI MUST present it as the normal workflow with paste instructions, never as a warning. `reason` is `null` in this mode. `meta.imageMode` reports the active mode.
- **BR-12**: External call timeouts: `8000 ms` per Huyền Minh call, `30000 ms` for Gemini text, `45000 ms` per Gemini image call. The three Huyền Minh calls run **in parallel**; the two Gemini image calls also run **in parallel**. Retry policy: Huyền Minh `1` retry on network error or 5xx; Gemini text `1` retry on 429 or 5xx with `2000 ms` backoff; Gemini image `0` retries (falls back immediately per BR-11).

  Worst-case end-to-end budget in `IMAGE_MODE=api`: `8` (calendar, parallel) + `30 + 2 + 30` (text with one retry) + `45` (images, parallel) = **`115 s`**. In the default `IMAGE_MODE=prompt` there is no image call, so the budget is **`70 s`**. Render terminates requests only after 100 minutes, so the platform does not cut this off; the Node server MUST still raise `server.keepAliveTimeout` and `server.headersTimeout` to `180000 ms` so Node itself does not close the socket first.
- **BR-13**: Section-to-part mapping is fixed. Part 1 carries items (1)–(7) about the **day**; Part 2 carries the four-area horoscope plus the closing fate line. Items MUST NOT be reordered or merged across parts.
- **BR-14**: Item (6) is **"giờ tốt nhất trong ngày"** (from BR-08), replacing the original document's "hướng xuất hành". No direction data source exists in the calendar API, and the LLM MUST NOT invent one.
- **BR-15**: Each bullet placed inside an image prompt MUST be at most 8 words and MUST retain concrete values (hour names, Chi names) rather than generic phrasing. Each `videoPrompt` is English prose describing camera and effects, followed by a `Voiceover (Vietnamese, ...)` block holding the narration in quotes; the narration MUST be 20–30 Vietnamese words to fit 10 seconds. See the worked example in section 5.2.

- **BR-16**: The four areas are grounded by **all** Thập Thần present on the day, not only the day stem's:
  1. Thập Thần of `day.can` relative to the reference stem (BR-03).
  2. Thập Thần of each hidden stem (`tàng can`) of `day.chi`, using the fixed table below. The first stem listed is `bản khí` (dominant).

  All 12 rows verified against `/api/battu` via the year pillar of `?d=1&m=6&y=<year>&gio=12` (mid-year avoids the lập xuân boundary that would shift the year pillar):

  | Chi | Tàng can (bản khí first) | Verified via year |
  |---|---|---|
  | Tý | Quý | ✅ 1996 |
  | Sửu | Kỷ, Quý, Tân | ✅ 1997 |
  | Dần | Giáp, Bính, Mậu | ✅ 1998 |
  | Mão | Ất | ✅ 1999 |
  | Thìn | Mậu, Ất, Quý | ✅ 2000 |
  | Tỵ | Bính, Mậu, Canh | ✅ 2001 |
  | Ngọ | Đinh, Kỷ | ✅ 1990 |
  | Mùi | Kỷ, Đinh, Ất | ✅ 1991 |
  | Thân | Canh, Nhâm, Mậu | ✅ 1992 |
  | Dậu | Tân | ✅ 1993 |
  | Tuất | Mậu, Tân, Đinh | ✅ 1994 |
  | Hợi | Nhâm, Giáp | ✅ 1995 |

  Each resulting Thập Thần grounds its area per BR-05. An area reached by the day stem or by a `bản khí` hidden stem gets `tone: "active"` and `2–3` sentences. An area reached only by a non-`bản khí` hidden stem gets `tone: "active"` and exactly `1` sentence. An area reached by nothing gets `source: null`, `tone: "neutral"`, and this fixed template, filled only with the day's Can Chi:

  > "Mảng [tên mảng] hôm nay không có yếu tố nổi bật trong ngày [Can Chi ngày] — giữ nhịp như thường ngày là đủ."

  The contract test in section 17 re-checks all 12 rows on every run, so a future change on the calendar API side is caught rather than silently absorbed.

- **BR-17**: Internal rate limit is `10` requests per minute per IP. When exceeded, the response is `429 RATE_LIMITED` with `retryAfterSeconds` set to the seconds remaining in the current window.

- **BR-18**: Every response MUST carry `meta.disclaimer` with this exact text, and the UI MUST render it below the result, before the Huyền Minh credit:

  > "Nội dung mang tính tham khảo, thuộc văn hóa dân gian — không phải lời khuyên y tế, tài chính hay pháp lý."

## 11. State Machine

**N/A** — app stateless, không có entity có trạng thái. Trạng thái duy nhất là trạng thái UI tạm thời (idle → loading → success/error), không persist.

## 12. Security & Authorization

- **Authentication**: not required (Phase 1, single-user app). See Q8.
- **Authorization**: N/A — no roles.
- **Rate limiting**: `10` requests / minute per IP, in-memory counter. Purpose is cost control on the paid image model, not abuse defense.
- **Input validation**: strict allowlist — `birthYear` integer in `[1900, 2100]`, `gender` in enum, `date` matched against `^\d{4}-\d{2}-\d{2}$` then verified as a real calendar date. All three values are interpolated only into URL query strings and into the Gemini prompt; no shell, no SQL, no filesystem path is built from user input.
- **Sensitive data**: `GEMINI_API_KEY` lives only in the server process environment. It MUST NOT appear in any response body, client bundle, log line, or error message. `.env` MUST be listed in `.gitignore`.
- **Token/session**: N/A — no sessions.
- **Prompt injection**: input is three constrained scalars (integer, enum, date), so free-text injection into the Gemini prompt is not reachable.

## 13. Integration Contract (Frontend / Consumer)

- **Client-side storage**: none required. Optionally persist last-used `birthYear` and `gender` in `localStorage` as a convenience; wrap reads and writes in try/catch and render correctly when absent.
- **Token lifecycle**: N/A — no client-side auth.
- **Concurrent requests**: the UI MUST disable the submit button while a request is in flight. A second submit MUST NOT be issued.
- **Error handling**: `400` → show field-level message, keep form values. `422` → show "Không xác nhận được Can Chi năm sinh", suggest a different year. `502` / `504` → show retry button. `429` → show "thử lại sau 1 phút".
- **Retry strategy**: client retries only on `502`, `504`, `429`, manually triggered by the user. Never auto-retry — each retry costs paid image calls.
- **Loading states**: single spinner covering the whole request. Expected latency is dominated by two image calls; show elapsed-time text after `10 s` so the wait reads as intentional.
- **Optimistic update**: not applicable — no client-side mutation.
- **Image rendering**: `image.dataBase64` renders via `src="data:<mimeType>;base64,<dataBase64>"`. When `image.status = "fallback"`, render the prompt block in place of the image.
- **Copy affordance**: `imagePrompt`, `videoPrompt`, and `fullText` each need a copy button. Prompts render inside `<pre>` so no stray characters are copied.

## 14. Audit & Logging

| Event | Log level | Destination | Fields |
|---|---|---|---|
| Request received | INFO | stdout | `birthYear`, `gender`, `date`, `requestId` |
| Calendar API call | INFO | stdout | `endpoint`, `durationMs`, `httpStatus` |
| Can Chi assert failed | ERROR | stdout | `birthYear`, `computed`, `apiReturned`, `requestId` |
| Gemini text call | INFO | stdout | `durationMs`, `httpStatus`, `inputTokens`, `outputTokens` |
| Gemini image call | INFO | stdout | `part`, `durationMs`, `httpStatus` |
| Image fallback triggered | WARN | stdout | `part`, `reason`, `requestId` |
| Request failed | ERROR | stdout | `errorCode`, `httpStatus`, `requestId` |

`GEMINI_API_KEY` MUST NOT be logged, including inside serialized request objects or error stacks.

Retention: Render's platform log retention. No separate log store at Phase 1.

## 15. Non-functional Requirements

- **Performance**: in the default `IMAGE_MODE=prompt` (no image call), typical end-to-end is `< 12 s` and hard worst case is `70 s`. In `IMAGE_MODE=api`, typical `< 45 s` and hard worst case `115 s`; latency is then dominated by the image calls, which run in parallel. Calendar calls run in parallel and target `< 2 s` combined. No caching at Phase 1 (see Q6).
- **Scalability**: single-user app, no scaling requirement. The in-memory rate-limit counter does not survive a restart and does not work across instances — acceptable at one instance.
- **Availability**: no SLA. Render free tier spins down after roughly 15 minutes idle, so the first request after idle incurs a cold start. Render's own request ceiling is 100 minutes, well above the BR-12 budget. Acceptable per clarify section 2.3.
- **Security**: no compliance regime applies. Content is entertainment and folklore, not medical, financial, or legal advice; the disclaimer MUST be shown in the UI.
- **Accessibility**: form inputs need associated labels, the submit button needs an accessible busy state, and generated images need `alt` text. Full WCAG audit is out of scope at Phase 1.
- **Backward compatibility**: N/A — no existing clients.

## 16. Edge Cases

### Security

- [x] Brute force / credential stuffing? — N/A, no auth. Rate limit exists for cost control.
- [x] Token replay attack? — N/A, no tokens.
- [x] Concurrent modification / race condition? — N/A, no shared mutable state.
- [x] Privilege escalation? — N/A, no roles.
- [x] API key leaking to client? — Covered by section 12; key never leaves the server.

### Timing & State

- [x] Image call times out after text succeeded? — The image call has its own `45 s` timeout (BR-12); hitting it is an image failure, so BR-11 applies: the response is still `200`, the text result is preserved, and `image.status = "fallback"`. The text is never discarded because of an image problem.
- [x] The client aborts, or the text call itself times out? — Nothing is returned and the text result is lost. The user retries and pays for text again. Accepted at Phase 1 (see Q6).
- [x] Double-submit? — Submit button disabled while in flight (section 13).
- [x] Render cold start makes the first request appear hung? — Elapsed-time indicator after 10 s.
- [x] Chosen date is far in the future (e.g. year 2099)? — Calendar API handles it; `birthYear` bound does not constrain `date`. Needs verification at a far-future date (see Q7).

### Data Integrity

- [x] `/api/hoagiap` silently returns the current year? — BR-02 assert blocks it.
- [x] `/api/amlich` used by mistake (it takes a **lunar** date and returns solar — opposite direction)? — Spec pins `/api/ngay`; a test asserts the returned `duong_lich` equals the requested date.
- [x] Calendar API returns a Can Chi pair absent from the 60 Hoa Giáp table? — Treated as `CALENDAR_API_FAILED`; no guessing.
- [x] Leap lunar month (`nhuan`)? — Passed through as returned; app does not compute lunar dates itself.
- [x] Day Thập Thần maps to only one of the four areas? — BR-05 requires all four to appear, unmapped ones written as neutral.

### Concurrency

- [x] Multiple tabs submitting at once? — Rate limit caps at 10/min per IP; each request is independent.
- [x] Queue job retried multiple times? — N/A, no queue.

### External Dependencies

- [x] Huyền Minh API down? — `502 CALENDAR_API_FAILED`. No stale cache to serve at Phase 1.
- [x] Gemini image quota exhausted? — BR-11 fallback to prompt.
- [x] Gemini returns malformed JSON? — Section 9.1, one retry then `502`.
- [x] Gemini renders Vietnamese diacritics incorrectly in the image? — Not detectable server-side. Mitigated by BR-15 (≤ 8 words per bullet). The user retries manually. This is the highest residual risk (clarify section 5.2).
- [x] Webhook arrives late or duplicated? — N/A, no webhooks.

## 17. Test Scenarios

### Happy Path

1. `birthYear = 1994`, `gender = "male"`, `date = "2026-09-11"` → expect `person.canChi = "Giáp Tuất"`, `person.napAm = "Sơn Đầu Hỏa"`, `person.menh = "Hỏa"`, `day.canChi = "Mậu Tý"`, `day.lunar = "1/8/2026"`, `dayThapThan = "Thiên Tài"` (Giáp yang Mộc controls Mậu yang Thổ, same parity), `dayTangCanThapThan = ["Chính Ấn"]` (Tý hides only Quý; Quý yin Thủy generates Giáp yang Mộc, different parity → Chính Ấn), `bestHours` = Sửu/Chính Ấn, Ngọ/Thiên Tài, Dậu/Chính Quan with `bestHoursFallback = false`, **`verdictScore = 2`**, **`verdict = "TRUNG BÌNH"`** (BR-09 worked example). Response contains both parts, each with a non-empty `fullText`, `imagePrompt`, and `videoPrompt`.
2. `gender = "female"` with the same date → `part2.areas.tinhCam.source` is a Quan-family Thập Thần, not a Tài-family one (BR-05).
3. Future date `date = "2027-03-01"` → `200`, no special handling (flow 8.3).
4. All four keys of `part2.areas` are present in every response, and each has either a non-null `source` with `tone = "active"` or `source = null` with `tone = "neutral"` and the BR-16 template text (BR-05, BR-16).

### Edge Cases

1. `birthYear = 1899` → `400 VALIDATION_ERROR`.
2. `date = "2026-02-30"` → `400 VALIDATION_ERROR` (format passes regex, calendar check fails).
3. Stub `/api/hoagiap` to return `Bính Ngọ` for `birthYear = 1994` → `422 CANCHI_ASSERT_FAILED` (BR-02).
4. Stub image endpoint to return `429` → `200` with `part1.image.status = "fallback"` and non-empty `part1.imagePrompt` (BR-11).
5. Stub image endpoint to fail only on the second call → `part1.image.status = "generated"`, `part2.image.status = "fallback"` (flow 8.2).
6. Stub `/api/ngay` to time out → `504 UPSTREAM_TIMEOUT` (BR-12).
7. Stub Gemini text to return non-JSON twice → `502 TEXT_GENERATION_FAILED` (section 9.1).
8. Day with no favorable Thập Thần among auspicious hours → `bestHours` equals all auspicious hours and `bestHoursFallback = true` (BR-08).
9. 11 requests within one minute from one IP → 11th returns `429 RATE_LIMITED` with a positive `retryAfterSeconds` (BR-17).
10. Stub Gemini text to return `429` twice → `429 UPSTREAM_QUOTA_EXCEEDED`, distinct from case 9.
11. `date = "2099-12-31"` → either `200` with a valid `day.canChi`, or a clean `502 CALENDAR_API_FAILED`. No silent wrong data. Resolves Q7.
12. `birthYear = 1994`, `gender = "male"`, `date = "2026-09-21"` (day **Mậu Tuất**, Chi Tuất hides Mậu, Tân, Đinh) → `dayTangCanThapThan = ["Thiên Tài", "Chính Quan", "Thương Quan"]` and **all four** areas carry `tone = "active"`: `taiLoc` and `tinhCam` from Thiên Tài, `congViec` from Chính Quan, `sucKhoe` from Thương Quan (BR-16). Also asserts `verdictScore = 4` / `verdict = "CÁT"` per BR-09 worked example B.
13. Same date and year → `chiRelation = "none"`, not Tam hợp, because birth-year Chi Tuất equals day Chi Tuất and Tuất is not a self-punishing branch (BR-06).

### Security Tests

1. Grep every asset served to the client, plus every response body, for the `GEMINI_API_KEY` value → must not appear (section 12). Phrased as "assets served" rather than "bundle" because Q1's proposed stack has no build step.
2. Force an error and inspect the response and logs → no key fragment, no full upstream URL containing the key.
3. `birthYear = "1994; DROP TABLE"` → `400 VALIDATION_ERROR`, never reaches an upstream call.
4. Assert the generated text contains none of the forbidden prediction categories from `ranh_gioi` (BR-10) across a sample of 10 date/gender combinations.

### Contract Tests (against the live calendar API)

1. `GET /api/ngay?d=11&m=9&y=2026` → response contains `can_chi.ngay`, `gio.hoang_dao` with exactly 6 entries, `gio.hac_dao` with exactly 6 entries, `truc`, `nhi_thap_bat_tu`.
2. `GET /api/khunggio?d=11&m=9&y=2026` → `canh_gio` has 12 entries, `thap_than_theo_nhat_chu` has 10 keys, each an array of 12.
3. **Index alignment** (BR-08 depends on this): for every stem `c` and every index `i` in `0..11`, `thap_than_theo_nhat_chu[c][i]` MUST equal the BR-03 result for (`c`, stem of `canh_gio[i].can_chi`). Verified by hand at `i = 0` and `i = 2` for `c = "Giáp"`; the test covers all 120 combinations.
4. `GET /api/hoagiap?nam=1994` → `can_chi = "Giáp Tuất"`. Also assert the wrong-parameter trap: `?y=1994` does NOT return `Giáp Tuất` (documents the silent-fail behaviour so a future API change is noticed).
5. **Tàng can table verification** (BR-16): for each year `y` in `1990..2001`, call `GET /api/battu?d=1&m=6&y=<y>&gio=12` and assert `bang_tru.nam.tang_can[].can` equals the embedded table row for `bang_tru.nam.chi`, in the same stem order. The twelve years cover all twelve Chi exactly once. `d=1&m=6` is deliberate — a January date would fall before lập xuân and shift the year pillar to the previous year.

## 18. Open Questions

- [x] ~~**Q1**: Chốt stack cụ thể?~~ → **Đã chốt: Node + Express, serve 1 file `index.html` static, không build step.** Xem section 1 (Stack).
- [x] ~~**Q2**: Model ảnh cụ thể?~~ → **Đã chốt: mặc định KHÔNG gọi API ảnh** (BR-19, `IMAGE_MODE=prompt`) vì không có free tier. App xuất prompt để dán vào Gemini app. Khi nào muốn tự sinh thì đặt `IMAGE_MODE=api`; `GEMINI_IMAGE_MODEL` mặc định `gemini-2.5-flash-image` ($0.039/ảnh), rẻ nhất là `gemini-3.1-flash-lite-image` ($0.0336/ảnh).
- [ ] **Q3**: Phân loại Thập Thần "thuận lợi" ở BR-08 — dùng quy ước Tứ Thiện (Chính Quan, Chính Ấn, Chính Tài, Thực Thần) + Tỷ Kiên + Thiên Tài. Đây là quy ước truyền thống, **chưa được xác nhận**. Có đổi tập hợp này không? → Cần confirm với **chủ app**
- [ ] **Q4**: Công thức tính `verdict` ở BR-09 (thang điểm và ngưỡng ≥3 / ≤-2) được thiết kế để deterministic, **không có nguồn nghiệp vụ**. Worked example trong BR-09 cho thấy ngưỡng hiện tại **khá chặt**: một ngày có cả trực tốt lẫn sao tốt, không xung khắc gì, vẫn chỉ đạt `verdictScore = 2` → `TRUNG BÌNH`. Có hạ ngưỡng CÁT xuống `≥ 2` không, hay tăng trọng số cho trực/sao? → Cần confirm với **chủ app**
- [ ] **Q5**: Ảnh sinh ra có cần lưu lại không? Render filesystem là ephemeral (mất khi restart). Hiện spec trả base64 trực tiếp về client, không lưu. Có cần tải về/lưu S3 không? *(Domain probe: File Storage)* → Cần confirm với **chủ app**
- [ ] **Q6**: Có cache kết quả theo `(birthYear, gender, date)` không? Cùng input luôn ra cùng dữ liệu tính toán, nên cache sẽ tiết kiệm được cả tiền ảnh lẫn thời gian retry. *(Domain probe: Integration)* → Cần confirm với **chủ app**
- [x] ~~**Q7**: Giới hạn `date` đến đâu?~~ → **Đã chuyển thành Edge Case test #11** (`date = "2099-12-31"`). Không còn là câu hỏi treo
- [ ] **Q8**: App có bao giờ share link cho người khác không? Nếu có, cần thêm auth hoặc token đơn giản để tránh người lạ đốt quota ảnh có phí. *(Domain probe: Auth)* → Cần confirm với **chủ app**
- [ ] **Q12**: Bảng **Lục hại / Lục phá / Tam hình** không có trong file nguồn — tôi dùng bảng cổ điển tiêu chuẩn. Chúng ảnh hưởng `verdictScore` (BR-09 trừ 1 điểm). Bạn xác nhận bảng này, và xác nhận thứ tự ưu tiên hiện tại (hại/phá xét trước hình) có đúng ý không? → Cần confirm với **chủ app**
- [ ] **Q9**: Rate limit thực tế của Gemini 2.5 Flash free tier (RPM/RPD)? Trang rate-limits không hiển thị bảng Free Tier — phải xem trong AI Studio. Ảnh hưởng đến việc có cần throttle không. *(Domain probe: Integration)* → Cần **kiểm tra trong AI Studio dashboard**
- [x] ~~**Q10**: `/api/ngay` hoặc `/api/khunggio` có trả `tang_can` không?~~ → **Đã verify: KHÔNG.** Nhưng tàng can là bảng cố định 12 dòng, đã nhúng vào BR-16 (4/12 dòng verified qua `/api/battu`, 8 dòng còn lại có contract test #5)
- [x] ~~**Q11**: HTTP request timeout của Render?~~ → **Đã verify: 100 phút**, cao hơn nhiều so với budget 115s của BR-12. Không phải ràng buộc. Cần set `keepAliveTimeout`/`headersTimeout` = 180000ms phía Node

## 19. Dependencies & Impact

- **Phụ thuộc vào**:
  - API Huyền Minh (`huyenminh.com.vn`) — free, không key, không rate limit. Toàn bộ số liệu lịch/mệnh lý.
  - Google AI API — Gemini 2.5 Flash (text, có free tier) + model ảnh (**không có free tier**, cần billing).
  - Bảng dữ liệu nhúng từ `Gemini_Gem_XemVanMenh_Instructions (2).md`: 60 Hoa Giáp, Tam hợp/Lục hợp/Lục xung, bảng màu 5 mệnh.
  - Google Flow (Veo) — **ngoài app**, người dùng thao tác thủ công.
- **Ảnh hưởng đến**: không có module nào — greenfield.
- **Migration cần thiết**: NO — app stateless.
- **Breaking change**: NO — chưa có client nào.
- **Rủi ro phụ thuộc**: Huyền Minh là API miễn phí của bên thứ ba, không có SLA. Nếu ngừng hoạt động, app mất toàn bộ nguồn số liệu và phải tự implement lại lịch âm + bảng giờ hoàng đạo.

## 20. Change Log

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-11 | Claude Code | Initial draft từ `docs/clarify/clarify_daily-fortune-app.md` |
| 1.1 | 2026-09-11 | Claude Code | Fix 4 blocker từ `/nta-spec-review`: (1) sửa `verdict` trong example từ `CÁT` → `TRUNG BÌNH` khớp BR-09, thêm `verdictScore` + worked example; (2) thêm `bestHoursFallback` vào 4.3 và 5.2; (3) chuyển 2 call ảnh sang song song, hạ timeout ảnh 60s→45s, chốt budget 115s, verify Render cho phép 100 phút; (4) thêm BR-16 ground 4 mảng bằng tàng can của Chi ngày + template cố định cho mảng không có nguồn. Thêm BR-17 (rate limit), BR-18 (disclaimer). Tách `429` thành `RATE_LIMITED` / `UPSTREAM_QUOTA_EXCEEDED`. Thêm `part2.areas`, ví dụ `videoPrompt`. Sửa dangling ref section 3.5→21. Thêm test #4, #10, #11, #12, contract test #3, #5. Đóng Q7, Q10, Q11 |
| 1.2 | 2026-09-11 | Claude Code | Fix 5 warning từ review lần 2: (W1) sửa edge case timeout ảnh cho khớp BR-11 — text không bị hủy vì lỗi ảnh; (W2) 2 secondary area "Sáng tạo"/"Học hỏi" không thuộc 4 mảng → map vào `congViec`, chốt đúng 4 key hợp lệ; (W3) thêm error response body example + quy ước `retryAfterSeconds`; (W4) pin ngày thật cho Test #12 (21/9/2026 = Mậu Tuất); (W5) **verify đủ 12/12 dòng bảng tàng can** qua `/api/battu` năm 1990–2001, contract test #5 chốt tham số cụ thể. Phát sinh thêm: BR-06 thiếu trường hợp **Chi trùng nhau** → bổ sung `tu_hinh` cho {Thìn, Ngọ, Dậu, Hợi}, `none` cho 8 Chi còn lại, BR-09 thêm `-1` cho `tu_hinh` và thêm worked example B (`verdictScore = 4` → `CÁT`), thêm Test #13 |
| 1.3 | 2026-09-11 | Claude Code | Chốt Q1: stack = Node + Express, 1 file `index.html` static, không build step. Ghi vào section 1 |
| 1.5 | 2026-09-11 | Claude Code | Thêm **BR-19**: `IMAGE_MODE` với mặc định `prompt` — app không gọi API ảnh, chỉ xuất prompt để dán vào Gemini app (miễn phí). Thêm `image.status = "prompt_only"` và `meta.imageMode`. Ngân sách BR-12 ở chế độ mặc định giảm 115s → 70s, NFR cập nhật theo. Đóng Q2. Sửa `npm start` để đọc `.env` bằng `--env-file-if-exists` (trước đó key trong `.env` không được nạp) |
| 1.4 | 2026-09-11 | Claude Code | Đồng bộ spec với implementation. (1) BR-03: đổi `Kiêu Thần` → `Thiên Ấn` cho khớp tên API phát ra — contract test bắt được khi chạy thật; nâng mức verify từ 4 mẫu lên **120 tổ hợp**. (2) BR-05: cập nhật tên theo BR-03. (3) BR-06: ghi rõ bảng Lục hại / Lục phá / Tam hình **không có trong file nguồn** (→ Q12), và lập bảng tương tác thứ tự ưu tiên — 4 nhóm cặp bị hại/phá/xung hấp thụ, chỉ còn Sửu–Tuất và Tý–Mão thực sự ra `tam_hinh`. (4) Sửa example 5.2: `congViec` giờ nhận Chính Ấn (secondary) nên không còn `null/neutral` |

---

## 21. Tóm tắt xác nhận *(Dành cho team review — xóa section này trước khi gửi khách hàng)*

**Tính năng:** App Xem Vận Mệnh Ngày — sinh nguyên liệu video 20 giây từ năm sinh + giới tính + ngày

**Mục đích:** Thay quy trình thủ công qua Gem (luận giải → copy prompt → tạo ảnh → Flow → ghép) bằng một web app tự tính số liệu và xuất sẵn 2 prompt ảnh, 2 prompt video có lời voice, 2 khối text.

**Những điểm cần team xác nhận:**

- [ ] **Business rule**: BR-08 (tập Thập Thần "thuận lợi"), BR-09 (thang điểm verdict) — cả hai đều được thiết kế để deterministic, **không có nguồn nghiệp vụ**, cần xác nhận. Riêng BR-09 có worked example cho thấy ngưỡng đang khá chặt
- [ ] **Business rule**: BR-04 (Tier A dùng Can năm sinh làm gốc — là bản giản lược, không chuẩn Bát Tự), BR-14 (bỏ hướng xuất hành, thay bằng giờ tốt nhất), BR-16 (ground 4 mảng bằng tàng can — 8/12 dòng bảng chưa verify, có contract test)
- [ ] **Data**: không có entity/DB nào. Data contract nội bộ ở section 4.3
- [ ] **Luồng ngoại lệ**: fallback khi ảnh lỗi (8.1), fallback khi chỉ 1 trong 2 ảnh lỗi (8.2), assert Can Chi chặn silent-fail của `/api/hoagiap` (9.2)
- [ ] **Open Questions**: Q1 (stack), Q2 (model ảnh cụ thể), Q3 (tập Thập Thần thuận lợi), Q4 (thang điểm verdict), Q5 (có lưu ảnh không), Q6 (có cache không), Q8 (có share link không), Q9 (rate limit free tier). Q7, Q10, Q11 đã đóng.

**Ảnh hưởng đến phần khác:**

- Không có — greenfield
- Rủi ro bên ngoài: phụ thuộc hoàn toàn API Huyền Minh (free, không SLA) cho số liệu lịch/mệnh lý

**Không nằm trong scope lần này:**

- Tier B (nhật chủ thật từ ngày/giờ sinh qua `/api/battu`) — đã cân nhắc và loại
- Sinh file audio TTS — lời voice nhúng trong prompt video, không sinh audio
- Tự động hóa Google Flow / ghép video — Flow không có API công khai, làm thủ công
- Scraping suckhoedoisong.vn — loại vì bản quyền + chỉ có ngày đã publish
- Lưu lịch sử kết quả, authentication, multi-user
- Xuất loạt 12 con giáp — chỉ xem 1 con giáp của người dùng

---

*Nguồn dữ liệu lịch/mệnh lý: Huyền Minh — huyenminh.com.vn*
