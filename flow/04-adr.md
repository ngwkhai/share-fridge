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

