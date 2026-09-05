# Stage 04 — ADR (Architecture Decision Records)

## Gate — check ALL before `/flow next`
- [x] Each decision has a one-line "why" and a one-line "what I rejected"
- [x] The NOT-doing list is written
- [x] Decisions cover: data storage, auth approach, deploy target
- [x] No FILL placeholders remain in this file

## Decisions

| # | Quyết định | Lý do (Why) | Giải pháp bị từ chối & Lý do (Rejected) |
|---|---|---|---|
| 1 | **Data Storage & Realtime:** Supabase Postgres + Realtime Channels | Postgres tin cậy, miễn phí, có sẵn WebSocket Realtime CDC và Storage bucket cho ảnh mà không cần code server riêng. | Tự code backend Node.js + WebSocket: Tốn chi phí VPS và tốn thời gian bảo trì hạ tầng. |
| 2 | **Auth & Room Access:** Mã Room PIN 6 số + Nickname lưu LocalStorage | Zero friction: Người cùng phòng chỉ cần chia sẻ mã PIN 6 số là vào chung tủ ngay lập tức trong 2 giây. | Email/Password hoặc Google OAuth: Tạo rào cản đăng ký rườm rà khiến người dùng bỏ app ngay từ đầu. |
| 3 | **Mobile Platform:** Web PWA (React 18 + Vite + Tailwind CSS) | Mở siêu tốc (< 1s), cài đặt lên màn hình chính (Add to Home Screen), hỗ trợ Web Push và thao tác một tay. | React Native / Flutter: Phải build APK / duyệt App Store phức tạp, khó chia sẻ link dùng thử ngay. |
| 4 | **AI & Voice Engine:** Web Speech API tiếng Việt + Gemini 2.5 Flash API | Web Speech API native 0ms latency; Gemini 2.5 Flash phản hồi < 800ms, trích xuất JSON chuẩn và hiểu sâu ẩm thực Việt Nam với chi phí cực thấp. | Tự host Whisper / Llama trên VPS: Chi phí đắt đỏ và độ trễ cao. |
| 5 | **Image Compression:** Client Canvas / `browser-image-compression` (<100KB) | Giảm dung lượng ảnh chụp 4MB xuống 50-80KB ngay trên máy người dùng trước khi upload, tiết kiệm 4G và load ảnh tức thì. | Upload ảnh gốc từ Camera: Gây lag mạng, tốn dung lượng Cloud Storage. |
| 6 | **Push Notification:** Web Push Protocol (VAPID) + PWA Service Worker | Chuẩn web tiêu chuẩn, bắn thông báo trực tiếp ra màn hình khóa Android & iOS (PWA), hoàn toàn miễn phí. | Tin nhắn SMS / Zalo ZNS: Tốn phí duy trì hàng tháng. |
| 7 | **Deploy Target:** Cloudflare Pages / Vercel | CI/CD tự động từ Git main branch, toàn cầu CDN, miễn phí HTTPS & custom domain. | VPS tự quản lý: Mất thời gian cấu hình Nginx, SSL certbot và backup. |

## NOT doing in v1 (and why it's safe to skip)

- **Không làm hệ thống tài khoản đa cấp / Phân quyền phức tạp:** 2 người cùng phòng bình đẳng quyền hạn, dùng chung 1 mã PIN là an toàn và đủ dùng.
- **Không làm tính năng quét Barcode mã vạch:** 80% thực phẩm phòng trọ mua ở chợ dân sinh không có bao bì mã vạch; thay thế bằng Voice & Presets nhanh hơn.
- **Không tự dựng Server OCR hóa đơn:** Người đi chợ dân sinh không có hóa đơn in; chỉ cần nhập Voice 1 câu là xong.
- **Không tích hợp cổng thanh toán / Chia tiền đi chợ:** Để các app chuyên dụng như MoMo/Splitwise phụ trách; ShareFridge tập trung 100% vào quản lý kho thực phẩm và chống lãng phí.


---

## Revision v7 — Store distribution (2026-09-05)

Authored in work mode after the operator approved the release dossier. Decision 3 above
(Mobile Platform) chose Web PWA and REJECTED native on the grounds that store review was
"phức tạp". That reasoning was correct for its budget (2 weekends, 2 known users) and it
delivered a working product. The goal has since changed — from "2 people who know each
other" to "strangers who find the app themselves" — so the decision is overridden here
explicitly rather than silently drifted away from.

| # | Quyết định | Lý do (Why) | Giải pháp bị từ chối & Lý do (Rejected) |
|---|---|---|---|
| 8 | **Distribution channel:** giữ nguyên PWA, BỔ SUNG Trusted Web Activity làm kênh phát hành lên Google Play. Không viết lại native, không dùng Capacitor ở pha này. | TWA không phải "đi native" — nó là lớp vỏ phân phối cho đúng PWA hiện có, chạy bằng chính Chrome trên máy người dùng. Toàn bộ 5.620 dòng code, 25 endpoint, contract và bộ test giữ nguyên không đổi một dòng. Lợi thế quyết định: sửa lỗi nội dung web KHÔNG cần qua review của Google — deploy là người dùng có ngay. | **Capacitor cho cả hai store:** mạnh hơn về lâu dài (có API native thật, cần để qua Guideline 4.2 của Apple) nhưng đòi máy Mac, 99 USD/năm và một tầng build mới, trong khi đường găng đang là closed testing. **Viết lại native/React Native:** vứt bỏ tài sản đã có mà không gỡ được ràng buộc thật nào. |
| 9 | **Platform boundary:** gom mọi code phụ thuộc nền tảng (camera, push, share, haptics) vào `src/platform/` sau một interface duy nhất, triển khai bản web ngay ở pha này. | Giữ đường thoát sang Capacitor cho iOS mà không phải mổ lại `App.tsx`. Chi phí bây giờ ~nửa ngày; chi phí nếu bỏ qua ~một tuần. | Để rải rác lời gọi nền tảng trong component như hiện tại: biến TWA hôm nay thành cái bẫy khóa nền tảng của ngày mai. |
| 10 | **Service tier:** nâng Supabase lên Pro trước khi mở closed testing; đánh giá lại bậc Vercel. | Supabase free tự tạm dừng project sau 7 ngày không hoạt động — nếu xảy ra giữa kỳ 14 ngày closed testing thì mất trắng cả chu kỳ. Vercel Hobby giới hạn dùng phi thương mại theo fair-use, chỉ giữ log 1 giờ và không có cảnh báo chi tiêu. | Ở lại free tier: đặt một sản phẩm có nghĩa vụ lên nền tảng không cam kết nghĩa vụ nào. |

### Cái giá của quyết định 8, nói thẳng

Người dùng iPhone sẽ KHÔNG tìm thấy ShareFridge trên App Store. Họ vẫn dùng được qua trình
duyệt nhưng chịu hai hạn chế thật của PWA trên iOS: Safari có thể xóa dữ liệu cache sau 7 ngày
không mở app, và thông báo đẩy chỉ hoạt động sau khi người dùng tự tay "Thêm vào Màn hình chính".
Ở thị trường Việt Nam, Android chiếm đa số nên đây là đánh đổi hợp lý — nhưng nó là đánh đổi,
không phải bữa trưa miễn phí.

### Điều kiện đảo ngược quyết định 8

Chuyển sang Capacitor khi MỘT trong ba điều sau đúng:

- Trên 25% yêu cầu hỗ trợ đến từ người dùng iPhone không cài được app;
- Cần một khả năng web không có: widget màn hình chính, quét mã vạch tốc độ cao, chạy nền thật;
- Có doanh thu hoặc lý do đủ mạnh để chi 99 USD/năm cộng một máy Mac.

## NOT doing in v7 (and why it's safe to skip)

- **Không nộp App Store ở pha này:** đường găng là closed testing của Play; thêm một store thứ hai
  với ràng buộc phần cứng (Mac) và Guideline 4.2 sẽ kéo dài pha này thêm ít nhất 4 tuần mà không
  mở thêm thị trường chính (Android chiếm đa số ở Việt Nam).
- **Không làm monetization / gói trả phí:** chưa có bằng chứng giữ chân; tính tiền trước khi biết
  người lạ có ở lại hay không là tối ưu sai thứ tự.
- **Không làm đa ngôn ngữ:** thị trường mục tiêu là người ở trọ Việt Nam; i18n là chi phí không
  đổi lấy lượt cài nào ở pha này.
