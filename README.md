# karma-ai — App Xem Vận Mệnh Ngày

Web app nhận **năm sinh + giới tính + ngày dương lịch**, tự tra lịch/mệnh lý rồi xuất bộ nguyên liệu để dựng video dọc 20 giây (2 clip 10s):

- 2 prompt tạo ảnh (9:16)
- 2 prompt video cho Google Flow / Veo, **lời voice nhúng sẵn trong prompt**
- 2 khối text đầy đủ để đọc/copy

Spec: [`docs/spec/daily-fortune-app.md`](docs/spec/daily-fortune-app.md) · Clarify: [`docs/clarify/clarify_daily-fortune-app.md`](docs/clarify/clarify_daily-fortune-app.md)

## Nguyên tắc thiết kế

**Mọi kết luận đều được tính bằng công thức, không do LLM nghĩ ra.** Giờ hoàng đạo, Can Chi, nạp âm, Thập Thần, giờ tốt nhất, kết luận cát/hung, và nguồn ground của 4 mảng tử vi — tất cả tính trong `src/lib/`. Gemini chỉ làm một việc: diễn đạt số liệu đã có thành văn.

Cùng một input luôn cho ra cùng khung kết luận, nên test được.

## Chạy local

```bash
npm install
cp .env.example .env      # rồi điền GEMINI_API_KEY
npm start                 # http://localhost:3000 (tu doc .env)
npm run dev               # có --watch
```

Lấy API key tại <https://aistudio.google.com/apikey>.

### Ảnh: mặc định miễn phí

`IMAGE_MODE=prompt` (mặc định) — app **không gọi API ảnh**. Nó xuất prompt hoàn chỉnh để bạn copy dán vào **Gemini app** (gemini.google.com), nơi sinh ảnh miễn phí. Toàn bộ luận giải, 4 mảng tử vi, lời voice và 2 prompt đều dùng `gemini-2.5-flash` — có free tier.

Muốn app tự sinh ảnh thì đặt `IMAGE_MODE=api`. Cần bật billing: **không model sinh ảnh nào của Gemini API có free tier**. Giá mỗi lần chạy = 2 ảnh:

| `GEMINI_IMAGE_MODEL` | Giá/ảnh | 1 lần chạy |
|---|---|---|
| `gemini-3.1-flash-lite-image` | $0.0336 | $0.067 |
| `gemini-2.5-flash-image` (mặc định) | $0.039 | $0.078 |
| `gemini-3.1-flash-image` | $0.067 | $0.134 |
| `gemini-3-pro-image` | $0.134 | $0.268 |

Lưu ý: chữ tiếng Việt có dấu trong ảnh AI hay bị méo nên thường phải sinh lại vài lần — đây là lý do chế độ `prompt` là mặc định, bạn retry trên Gemini app không mất phí.

## Test

```bash
npm test                  # 44 test, không cần mạng (contract test tự skip)
npm run check             # node --check cho 7 file source

RUN_CONTRACT_TESTS=1 npm run test:contract   # 7 contract test, gọi API thật
```

Contract test tồn tại để bắt trường hợp API Huyền Minh đổi shape hoặc đổi số liệu — thà fail còn hơn để app âm thầm dùng dữ liệu sai. Nó kiểm cả:

- `thap_than_theo_nhat_chu` align đúng index với `canh_gio` (120 tổ hợp)
- bảng tàng can 12 dòng khớp `/api/battu`
- **bẫy silent-fail**: `/api/hoagiap?y=1994` (sai tên tham số) không báo lỗi mà trả về năm hiện tại

## Deploy Render

- Build command: `npm install`
- Start command: `npm start`
- Env var: `GEMINI_API_KEY` (đặt trong **Environment** tab của dashboard, không commit `.env`). Start script dùng `--env-file-if-exists` nên trên Render không có `.env` vẫn chạy bình thường, lấy biến từ dashboard
- Health check path: `/api/health`

Render cho phép request tới 100 phút, thoải mái so với ngân sách worst case 115s của app. Free tier spin down sau khoảng 15 phút không hoạt động nên request đầu sau khi idle sẽ chậm.

## Cấu trúc

```
src/lib/canchi.js        Bảng tra + công thức thuần: Can Chi, 60 Hoa Giáp,
                         tàng can, Thập Thần, quan hệ Chi, quan hệ nạp âm
src/lib/calendar.js      Client API Huyền Minh + assert Can Chi (BR-02)
src/lib/compute.js       Ground 4 mảng, giờ tốt nhất, thang điểm verdict
src/lib/gemini.js        Gọi text + 2 ảnh song song, ghép prompt ảnh/video
src/middleware/          Rate limit 10 req/phút/IP
src/routes/fortune.js    POST /api/fortune
src/server.js            Express app
public/index.html        Toàn bộ UI trong 1 file, không build step
test/                    44 unit/integration + 7 contract
```

## Nguồn dữ liệu

Số liệu lịch và mệnh lý lấy từ **Huyền Minh — <https://huyenminh.com.vn>** (API miễn phí, không cần key).

Đổi lại có hai nghĩa vụ, app tuân thủ cả hai:

1. Ghi nguồn cho người đọc — hiển thị ở footer, và trả trong `meta.credit`.
2. Giữ đúng `ranh_gioi` do API quy định: *không phán kết cục, không dự đoán tuổi thọ, bệnh tật, ly hôn hay phá sản*. Chuỗi này được nhúng thẳng vào system prompt của Gemini.

Nội dung mang tính tham khảo, thuộc văn hóa dân gian — không phải lời khuyên y tế, tài chính hay pháp lý.

## Điểm cần xác nhận

Bốn quy tắc dưới đây **không có nguồn nghiệp vụ** — tôi thiết kế để kết quả deterministic. Cả bốn đều nằm trong pure function độc lập nên tune lại rẻ, không đụng kiến trúc.

| Quy tắc | Hiện tại | Ghi ở |
|---|---|---|
| Tier A: Thập Thần lấy gốc **Can năm sinh** | Bản giản lược, không phải nhật chủ Bát Tự chuẩn. App hiển thị rõ điều này | BR-04 |
| Tập Thập Thần "thuận lợi" cho giờ tốt | Tứ Thiện + Tỷ Kiên + Thiên Tài | BR-08, Q3 |
| Thang điểm `verdict` | ≥3 → CÁT, ≤-2 → CẦN THẬN TRỌNG | BR-09, Q4 |
| Bảng **Lục hại / Lục phá / Tam hình** | Bảng cổ điển tiêu chuẩn — **không có trong file nguồn**. Ảnh hưởng `verdictScore` | BR-06, Q12 |

Riêng mục (6) của phần 1 là **"giờ tốt nhất trong ngày"**, không phải "hướng xuất hành" như bản Gem gốc — API không có dữ liệu hướng, và để LLM tự suy là bịa số liệu (BR-14).
