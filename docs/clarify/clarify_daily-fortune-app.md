# Clarification Report — App "Xem Vận Mệnh Ngày"

**Ngày**: 2026-09-11
**Trạng thái**: FINAL (v6) — toàn bộ BLOCKER đã gỡ
**Nguồn yêu cầu**: `Gemini_Gem_XemVanMenh_Instructions (2).md` (Gem gốc chạy trên gemini.google.com) + 4 vòng Q&A với người yêu cầu
**Repo**: `D:\karma-ai` — greenfield, chỉ có `README.md` và commit `f794ad4` tại thời điểm clarify

---

## 1. Bối cảnh

Hiện tại quy trình chạy thủ công qua một Gem trên gemini.google.com: Gem luận giải ngày → xuất 2 prompt tạo ảnh → người dùng tự dán sang công cụ tạo ảnh → tự đưa ảnh + prompt hiệu ứng sang Google Flow (Veo) → tự ghép 2 clip 10s + lồng voice thành video 20s.

Mục tiêu: chuyển quy trình này thành một web app.

---

## 2. Đã rõ — chốt toàn bộ

### 2.1 Input

| Field | Kiểu | Ghi chú |
|---|---|---|
| Năm sinh | dropdown | App tự suy Can Chi, hiển thị read-only để đối chiếu |
| Giới tính | radio | Bắt buộc — mảng *tình cảm* map khác nhau theo giới |
| Ngày xem | date picker dương lịch | Cho phép cả ngày tương lai |

App tự đổi dương → âm lịch và tự tính Can Chi ngày. Người dùng KHÔNG phải tra lịch vạn niên (khác với Gem gốc — Gem gốc bắt user tự quy đổi vì LLM không tính chính xác được).

### 2.2 Tier A (đã chốt)

Thập Thần lấy gốc là **Can của năm sinh**, không phải nhật chủ chuẩn Bát Tự.

> Thập Thần chuẩn theo Bát Tự lấy gốc là **Can của NGÀY SINH** (nhật chủ). Tier A dùng Can năm sinh làm gốc → là **bản giản lược**, phải ghi rõ trong app.
> Tier B (có ngày/tháng sinh + giờ sinh, dùng `/api/battu` lấy nhật chủ thật) đã được cân nhắc và **loại** để giữ input gọn.

### 2.3 Deploy

- Nền tảng: **Render**
- Web app gọn nhẹ
- API key Gemini đặt ở **environment variable phía server** (không commit `.env`, không để lọt vào bundle client)
- Lưu ý: Render free tier spin down sau khoảng 15 phút không hoạt động → cold start chậm. Chấp nhận được vì app dùng cá nhân.

### 2.4 Output — 2 phần, mỗi phần 3 khối

| Phần | Nội dung | Khối output |
|---|---|---|
| **Phần 1** | Mục (1)–(7) về NGÀY | prompt tạo ảnh 1 · prompt video 10s (có nhúng lời voice) · ô text đầy đủ read-only |
| **Phần 2** | Tử vi 4 mảng theo Thập Thần ngày | prompt tạo ảnh 2 · prompt video 10s (có nhúng lời voice) · ô text đầy đủ read-only |

- Ảnh: 9:16 dọc, chữ do AI vẽ, font nhỏ, **chỉ tóm tắt** (không đưa full text lên ảnh)
- Lời voice **nhúng thẳng trong prompt video** (Veo nhận dialogue trong prompt) — KHÔNG cần TTS, không sinh file audio
- Ô text đầy đủ: read-only, không đưa vào prompt nào, chỉ để đọc/copy

### 2.5 Nguồn dữ liệu — tất cả đã verify chạy thật

| Nguồn | Cung cấp | Trạng thái |
|---|---|---|
| `GET /api/ngay?d&m&y` | Can Chi ngày/tháng/năm, âm lịch, 6 giờ hoàng đạo + 6 hắc đạo, trực (`nen`/`ky`), 28 tú (`nen`/`ky`) | ✅ Verified |
| `GET /api/khunggio?d&m&y` | 12 canh giờ + can chi giờ + ngũ hành giờ + `thap_than_theo_nhat_chu` | ✅ Verified |
| `GET /api/hoagiap?nam=<năm sinh>` | Nạp âm + mệnh ngũ hành người dùng | ✅ Verified |
| Bảng local (từ file gốc) | 60 Hoa Giáp (fallback offline), Tam hợp/Lục hợp/Lục xung, bảng màu 5 mệnh | ✅ Có sẵn |
| Bảng Thập Thần local | Tính Thập Thần của Can ngày so với Can gốc | ✅ Verified khớp API 4/4 |
| Gemini 2.5 Flash | **Chỉ diễn đạt thành văn** — không tự kết luận | ✅ Có free tier |
| Model ảnh Gemini | 2 ảnh 9:16 | ⚠️ Không có free tier — xem 4.2 |

API Huyền Minh: free, không cần sign-up, không cần API key, không rate limit.

---

## 3. Cơ sở tính tử vi 4 mảng (deterministic)

### 3.1 Bảng Thập Thần

Thập Thần = hàm của (Can gốc, Can mục tiêu) — bảng cố định 10×10, tính bằng ngũ hành + âm dương:

| Quan hệ với Can gốc | Cùng âm dương | Khác âm dương |
|---|---|---|
| Đồng hành | Tỷ Kiên | Kiếp Tài |
| Ta sinh nó | Thực Thần | Thương Quan |
| Ta khắc nó | Thiên Tài | Chính Tài |
| Nó khắc ta | Thất Sát | Chính Quan |
| Nó sinh ta | Kiêu Thần (Thiên Ấn) | Chính Ấn |

**Verify đã chạy** (nhật chủ Canh, đối chiếu `/api/battu?d=11&m=9&y=1994&gio=10`):

| Can | Tính local | API trả | Kết quả |
|---|---|---|---|
| Giáp | Thiên Tài | Thiên Tài | ✅ |
| Quý | Thương Quan | Thương Quan | ✅ |
| Nhâm | Thực Thần | Thực Thần | ✅ |
| Bính | Thất Sát | Sát | ✅ |

4/4 khớp.

### 3.2 Mapping Thập Thần → 4 mảng

| Thập Thần | Quan hệ | Mảng |
|---|---|---|
| Tỷ Kiên / Kiếp Tài | đồng hành | **Công việc** (đồng nghiệp, cạnh tranh) — Kiếp Tài cảnh báo hao **tài lộc** |
| Thực Thần / Thương Quan | ta sinh | **Sức khỏe** (hao khí, ăn uống) + sáng tạo, biểu đạt |
| Chính Tài / Thiên Tài | ta khắc | **Tài lộc** — nam giới: **tình cảm** |
| Chính Quan / Thất Sát | khắc ta | **Công việc** (cấp trên, áp lực) — nữ giới: **tình cảm** |
| Chính Ấn / Kiêu Thần | nó sinh ta | Hỗ trợ, học hỏi, **sức khỏe** được dưỡng |

→ Mảng *tình cảm* phụ thuộc giới tính (nam xem qua Tài, nữ xem qua Quan) → đó là lý do giới tính là input bắt buộc.

### 3.3 Hai lớp bổ sung, cũng deterministic

1. **Chi năm sinh ↔ Chi ngày**: Tam hợp / Lục hợp / Lục xung / Hình / Hại / Phá — bảng có sẵn trong file gốc
2. **Nạp âm mệnh ↔ ngũ hành ngày**: tương sinh / tương khắc

**Kết quả**: Gemini chỉ còn việc diễn đạt thành văn, không tự nghĩ ra kết luận. Cùng input luôn ra cùng khung nội dung → test được.

> **Lưu ý về kỳ vọng**: chưa verify được suckhoedoisong.vn dùng phương pháp nào, nên KHÔNG kỳ vọng nội dung app trùng với bài của họ — chỉ cùng khung khái niệm và văn phong.

---

## 4. Các quyết định đã chốt (cần giải trình về sau)

### 4.1 Đổi cấu trúc 2 phần so với Gem gốc

Gem gốc quy định "ranh giới cố định, không được xáo trộn": mục (1)(2)(3) → Ảnh 1, mục (4)(5)(6)(7) → Ảnh 2.

**Quyết định mới**: Phần 1 = mục (1)–(7) về ngày; Phần 2 = tử vi 4 mảng (nội dung hoàn toàn mới, không có trong Gem gốc).

Đây là quyết định có ý thức của người yêu cầu, không phải nhầm lẫn.

### 4.2 Dùng model ảnh có phí

**Sự thật đã verify** từ bảng giá chính thức Gemini API: cột Free Tier ghi **"Not available"** cho toàn bộ model sinh ảnh (Gemini 2.5 Flash Image / Nano Banana, Gemini 3.1 Flash Image / Nano Banana 2, Gemini 3.1 Flash Lite Image, Gemini 3 Pro Image / Nano Banana Pro). Gemini 2.5 Flash (text) thì **có** free tier.

Ràng buộc nằm ở **billing, không phải năng lực model**.

**Quyết định**: đi theo hướng sinh ảnh bằng API, kèm **fallback**: nếu call ảnh trả `429 RESOURCE_EXHAUSTED` / lỗi quota → app hiển thị prompt ảnh để người dùng tự dán sang Gemini app.

### 4.3 Loại bỏ scraping suckhoedoisong.vn

Đã cân nhắc dùng bài "Tử vi 12 con giáp hôm nay" trên suckhoedoisong.vn làm nguồn. **Loại**, vì 3 lý do:

1. Nội dung biên tập có bản quyền → đưa vào video đăng công khai là rủi ro bản quyền thật
2. Chỉ có bài cho ngày **đã xuất bản** → không làm được content cho ngày tương lai
3. Site không có API → phải scrape HTML, vỡ khi họ đổi layout

Thay bằng cơ sở tính deterministic ở mục 3. Site vẫn dùng được làm **tham khảo văn phong** (4 mảng, độ dài, giọng văn, cách dẫn Thập Thần).

### 4.4 Bỏ mục (6) "hướng xuất hành", thay bằng "giờ tốt nhất trong ngày"

**Sự thật đã verify**: liệt kê toàn bộ field của `/api/ngay` và `/api/khunggio` — **không có field nào** về hướng / Hỷ Thần / Tài Thần.

Gem gốc cũng đã thừa nhận đây là phần khó chuẩn bằng thuần LLM và khuyến nghị "tham khảo thêm lịch vạn niên".

**Quyết định**: bỏ hướng xuất hành (để LLM suy = bịa số liệu), thay bằng **"giờ tốt nhất trong ngày"** = giao của giờ hoàng đạo × Thập Thần thuận lợi, lấy từ `thap_than_theo_nhat_chu` của `/api/khunggio`. Có data thật, đúng tinh thần mục gốc (chọn thời điểm tốt để hành động).

### 4.5 Nghĩa vụ ghi nguồn Huyền Minh

API trả kèm 2 field ràng buộc:

- `nguon.giay_phep`: yêu cầu ghi tên Huyền Minh kèm đường dẫn `huyenminh.com.vn` cho người đọc
- `nguon.ranh_gioi`: *"Không phán kết cục, không dự đoán tuổi thọ, bệnh tật, ly hôn hay phá sản. Xin giữ đúng tinh thần này khi thuật lại."*

**Quyết định**: hiển thị credit "Nguồn: Huyền Minh — huyenminh.com.vn" trong app, và nhúng `ranh_gioi` vào system prompt của Gemini. Đây là nghĩa vụ theo license, không phải tùy chọn.

### 4.6 Bỏ ô chọn Can Chi riêng

Can Chi năm sinh suy được 100% từ năm sinh bằng công thức trong file gốc:
`(Năm - 4) mod 10` → Can · `(Năm - 4) mod 12` → Chi

Verify: 1994 → `(1994-4) mod 10 = 0` = Giáp · `(1994-4) mod 12 = 10` = Tuất → **Giáp Tuất**. Khớp `/api/hoagiap?nam=1994` (Giáp Tuất, nạp âm Sơn Đầu Hỏa) và khớp bảng 60 Hoa Giáp trong file gốc.

Giữ 2 ô chọn sẽ sinh trạng thái sai (ví dụ 1994 + Bính Tý) mà app phải xử lý vô ích.

---

## 5. TOP 3 điểm dễ bị bỏ sót nguy hiểm nhất

1. **`/api/hoagiap` silent-fail khi sai tên tham số.** Truyền `y=1994`, `tuoi=1994`, `nam_sinh=1994` → API **không báo lỗi**, im lặng trả về năm hiện tại (2026 → Bính Ngọ). Chỉ `nam=1994` mới đúng (Giáp Tuất). Hậu quả: mệnh ngũ hành sai → bảng màu/biểu tượng cả 2 ảnh sai theo, mà response vẫn "200 OK, trông hợp lý".
   → **Bắt buộc assert** `can_chi` trả về khớp với công thức tính tay trước khi tin.

2. **Chữ tiếng Việt có dấu do AI vẽ.** File gốc cảnh báo đây là "lỗi phổ biến với hầu hết model ảnh AI hiện nay". Lưu ý ngược trực giác: **font nhỏ làm TĂNG tỷ lệ lỗi dấu** (glyph nhỏ dựng kém chính xác hơn); yếu tố giảm rủi ro thật là **ít chữ** — file gốc chốt mỗi bullet dưới 8 từ. Kỳ vọng thực tế: phải retry vài lần mỗi ảnh.

3. **`/api/amlich` nhận đầu vào là ngày ÂM** → đổi ra dương (ngược chiều với app). App phải dùng `/api/ngay`. Dùng nhầm endpoint là sai toàn bộ kết quả mà không có dấu hiệu báo lỗi.

---

## 6. Rủi ro còn lại

| Điểm | Mức | Xử lý |
|---|---|---|
| Chữ Việt có dấu do AI vẽ | **HIGH** | Ít chữ (bullet <8 từ), tính trước phải retry |
| Model ảnh không có free tier | MEDIUM | Fallback xuất prompt khi 429 |
| `/api/hoagiap` silent-fail sai param | MEDIUM | Assert can_chi khớp công thức tính tay |
| Render free tier spin down | LOW | Cold start chậm sau ~15 phút idle — chấp nhận được |
| Thập Thần Tier A không chuẩn Bát Tự | LOW | Ghi rõ trong app là bản giản lược |

---

## 7. File / tài liệu cần đọc trước khi implement

- `C:\Users\HoangNM_NTA\Downloads\Gemini_Gem_XemVanMenh_Instructions (2).md` — bảng 60 Hoa Giáp (60 dòng, fallback offline), bảng màu + biểu tượng 5 mệnh, bảng Tam hợp/Lục hợp/Lục xung, format prompt ảnh, format prompt video, quy tắc lời voice 20–30 từ cho 10 giây
- `https://huyenminh.com.vn/api` — tham số đã chốt: `d`/`m`/`y` cho `/api/ngay` và `/api/khunggio`; `nam` cho `/api/hoagiap`

---

## 8. Đánh giá theo tiêu chuẩn chất lượng NTA

- **Tuân thủ deadline**: chưa có deadline được đặt ra
- **Giảm sai sót**: giờ hoàng đạo ✅ (API) · tử vi ✅ (Thập Thần deterministic) · nạp âm ✅ (API) · hướng xuất hành ✅ (bỏ, thay bằng data thật) · **còn lại: chữ trong ảnh AI**
- **Không gây khó khăn cho công đoạn sau**: 3 khối output mỗi phần, prompt đặt trong code block để copy sạch sang Flow
- **Ngăn ngừa tái phát**: 2 bài học ghi trong file gốc đều đã xử lý — (a) LLM tính sai giờ hoàng đạo → dùng API; (b) Gem không sinh ảnh ổn định → fallback xuất prompt
- **Có thể giải trình trách nhiệm**: 6 quyết định ở mục 4 đã được ghi lại kèm lý do và bằng chứng verify

---

## 9. Bước tiếp theo

Đủ thông tin để viết spec và implement.

- Tiếp theo: `/nta-spec-write`
- Stack cụ thể (Express + vanilla HTML vs Next.js) chưa chốt — quyết định khi viết spec

---

*Nguồn dữ liệu lịch/mệnh lý: Huyền Minh — huyenminh.com.vn*
