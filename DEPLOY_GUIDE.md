# Triển khai ShareFridge trên Vercel và PostgreSQL

## 1. Database và cấu hình server bắt buộc

Runtime dùng PostgreSQL cho phòng, thực phẩm, lịch sử, danh sách mua sắm, đăng ký push và giới hạn đăng nhập. Không có dữ liệu mẫu tự tạo hay fallback sang RAM. Khi chưa cấu hình database hoặc chưa chạy migration, `/readyz` trả 503; `/healthz` chỉ chứng minh tiến trình HTTP còn hoạt động.

1. Dùng PostgreSQL/Supabase đã có. Đặt `DATABASE_URL` trong Vercel Project Settings → Environment Variables cho từng môi trường cần triển khai. Với serverless, dùng connection URL của pooler theo cấu hình nhà cung cấp; mỗi worker giới hạn 5 connection. Chứng thư TLS phải được xác minh; không đặt `rejectUnauthorized: false` để bỏ qua TLS.
2. Runtime connection phải là tài khoản backend riêng được phép truy cập các bảng ứng dụng và schema `sharefridge_private`, có khả năng bypass RLS (ví dụ kết nối backend của Supabase). Không đưa URL hoặc tài khoản này vào biến `VITE_*`, trình duyệt, chat hay log. Các token Realtime chỉ được đọc foods/shopping của đúng phòng; không được đọc bảng room hoặc push subscriptions.
3. Với tài khoản sở hữu schema và URL được cung cấp qua môi trường, chạy:
   ```sh
   npm run db:migrate
   ```
   Migration nằm trong `supabase/schema.sql`: dùng giao dịch/lock, không xóa dòng hay reset database, giữ UUID/hash cũ, chạy lặp lại được. Nó thay các policy công khai cũ và thu hồi quyền `PUBLIC`/`anon`/`authenticated`, chỉ cấp lại SELECT foods/shopping theo claim phòng. Kiểm tra bản sao lưu do nhà cung cấp quản lý trước khi áp dụng trên dữ liệu thật. Đừng mở lại quyền công khai để xử lý lỗi truy cập.
4. Đặt `SESSION_SECRET` bằng chuỗi ngẫu nhiên riêng cho môi trường (ít nhất 32 bytes); có thể tạo bằng `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Giữ nguyên secret giữa các worker và lần deploy để phiên còn hợp lệ. Khóa ví dụ trong tài liệu cũ không hợp lệ.
5. Đặt `GEMINI_API_KEY` nếu dùng Gemini. Cấu hình Google/push/storage/realtime và nghiệm thu thiết bị được hoàn thiện ở các card tương ứng; database xanh không chứng minh các nhà cung cấp này hoạt động.
6. Triển khai Preview trên project Vercel đã liên kết rồi kiểm tra `/readyz` phải trả `{ "status": "ok", "database": "postgres" }`, và `/api/openapi.json` chứa `/readyz`. Tạo phòng thử, đọc ở request/instance khác, redeploy rồi kiểm tra UUID/thời điểm/lịch sử vẫn giữ nguyên. Chỉ nghiệm thu khi có chứng cứ thực tế; không nâng production khi thiếu database.

Kiểm thử cục bộ dùng database disposable, không dùng URL production:

```sh
npm test
# Cung cấp TEST_DATABASE_URL riêng qua môi trường, rồi chạy:
npm run test:postgres
npm run build
```

`test:postgres` thiếu `TEST_DATABASE_URL` sẽ thất bại rõ ràng, không âm thầm bỏ qua test. Suite tạo các dòng/role riêng, chạy migration hai lần, dùng hai tiến trình API, cạnh tranh consume, restart, kiểm tra rollback và RLS bằng role không sở hữu bảng. Nó giữ schema để các card sau tiếp tục dùng và chỉ dọn các dòng/role thuộc test. Adapter RAM chỉ được tiêm tường minh trong unit test và bị chặn trong production. Khi dev chạy `npm run dev`, cung cấp `DATABASE_URL` qua môi trường; Vite không tự đưa mọi giá trị `.env` vào server Node.

---

## 2. Hướng Dẫn Cài Đặt PWA Lên 2 Điện Thoại Di Động

Sau khi có link Vercel (`https://your-app.vercel.app`):

### 📱 Trên iPhone (iOS Safari):
1. Mở trình duyệt **Safari** và truy cập vào đường link Vercel.
2. Bấm nút **Chia sẻ** (biểu tượng hình vuông có mũi tên trỏ lên ở giữa thanh công cụ dưới cùng).
3. Cuộn xuống chọn **"Thêm vào Màn hình chính"** (Add to Home Screen).
4. Bấm **Thêm** (Add). Biểu tượng ứng dụng ShareFridge sẽ xuất hiện trên màn hình điện thoại.

### 📱 Trên Android (Google Chrome):
1. Mở trình duyệt **Chrome** và truy cập vào đường link Vercel.
2. Một banner nhỏ sẽ tự động hiện lên: *"Thêm ShareFridge vào Màn hình chính"*. Bấm **Cài đặt** (Install).
3. Hoặc bấm vào **menu 3 chấm** ở góc trên bên phải -> Chọn **"Cài đặt ứng dụng"** (Install app).

---

## 3. Bắt Đầu Sử Dụng Giữa 2 Bạn Cùng Phòng

1. **Bạn A (Tạo phòng):**
   - Mở ứng dụng từ màn hình chính điện thoại.
   - Bấm **"Tạo phòng mới cho 2 người"**.
   - Đặt tên phòng (VD: *Phòng 302 Triều Khúc*), đặt **Mật khẩu bí mật** (Passcode 4 số, VD: `8899`), nhập tên bạn (*Khải*).
   - Nhận mã PIN 6 số (VD: `839201`).
2. **Bạn B (Tham gia phòng):**
   - Mở ứng dụng từ màn hình chính điện thoại của mình.
   - Nhập mã PIN 6 số (`839201`) + Mật khẩu (`8899`) + Tên (*Nam*).
   - Bấm **"Tham gia phòng ngay"**.
3. **Trải nghiệm:**
   - 2 bạn cùng nhìn thấy chung một kho tủ lạnh.
   - Bấm mic nói tiếng Việt để nhập món siêu tốc.
   - Chụp ảnh túi/hộp đồ để nhận diện trong tủ chung.
   - Bấm **"Nấu gì?"** để Gemini 2.5 Flash gợi ý thực đơn hôm nay từ đồ sắp hết hạn!

## C-021 — Đồng bộ phòng và chế độ chưa cấu hình Realtime

Chạy migration hiện tại trên PostgreSQL/Supabase trước khi bật Realtime. Migration giữ nguyên phòng, món, mã định danh và ngày hết hạn; thêm `room_sync_versions`. Trigger cập nhật revision trong cùng transaction với thêm/sửa/xóa món và danh sách mua. Publication `supabase_realtime` chuyển hai bảng của ứng dụng (`foods`, `shopping_items`) sang bảng revision; không phát bản ghi DELETE thô. Dùng publication liệt kê bảng, không dùng `FOR ALL TABLES`. Khi publication còn chứa hai bảng cũ hoặc chưa có revision, `/api/config` trả `realtime:false` và `/api/realtime-token` trả 503.

Cấu hình server `SUPABASE_URL`, `SUPABASE_ANON_KEY` và `SUPABASE_JWT_SECRET` của cùng dự án; cấu hình build frontend `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` tương ứng. Bộ kiểm tra hiện hỗ trợ dự án hosted `*.supabase.co` dùng **legacy HS256 JWT secret + anon JWT**: kiểm chữ ký, project ref, role anon và hạn dùng trước khi cấp token phòng tối đa 5 phút. `sb_publishable_` và khóa ký bất đối xứng chưa được hỗ trợ bởi bộ cấp token này. Không đưa JWT secret, service-role key hoặc DATABASE_URL vào biến VITE hay mã trình duyệt.

Khi thiếu cấu hình hợp lệ, ứng dụng hiển thị **Cập nhật định kỳ** và tải đầy đủ phòng, món còn lại, lịch sử, danh sách mua mỗi 4 giây. Khi kênh Realtime xác nhận đăng ký, ứng dụng tải lại dữ liệu rồi mới báo **Đã kết nối**; có thêm tải lại mỗi 60 giây để cập nhật hạn dùng. Sau lỗi/đóng kênh, SDK được tạo lại với retry có giới hạn; token được gia hạn trước khi hết hạn. Mở lại tab và có mạng trở lại đều tải snapshot mới, kể cả snapshot rỗng.

Cache chỉ phục vụ đọc dữ liệu cũ, không được POST lên API. Lỗi tải giữ snapshot cũ và cảnh báo; chưa có snapshot thì hiển thị chờ/thử lại. Ghi dữ liệu yêu cầu mạng và thành công từ máy chủ. Đăng xuất hoặc phiên 401 xóa cache của phòng hiện tại; phản hồi muộn không được khôi phục phiên. 403 không đăng xuất một phiên còn hợp lệ.

Kiểm tra local bằng `npm test`, `TEST_DATABASE_URL=... npm run test:sync-postgres`, `npm run build`. Các kiểm tra này không thay cho nghiệm thu hai trình duyệt trên Supabase đã triển khai. Theo yêu cầu F5 sửa ngày 2026-09-04, mục tiêu là ≤5 giây từ thao tác xác nhận thay đổi đến hiển thị ở thiết bị còn lại, khi cả hai ứng dụng ở foreground, mạng ổn định và đã kết nối đồng bộ. Ghi nhận thêm/sửa/xóa/đã nấu, phiên bản bundle và các lỗi trên URL thật; kiểm tra reconnect riêng. Polling suy giảm phải được báo rõ và không có cam kết thời gian này.


## Google Identity Services

Tạo OAuth client loại Web application trong Google Cloud Console và đặt `GOOGLE_CLIENT_ID` trên từng môi trường Vercel cần dùng. Khai báo chính xác **Authorized JavaScript origins** (scheme + hostname + port): origin Preview ổn định đã được cấp phép, origin production và `http://localhost:5173` nếu kiểm thử local. Popup GIS dùng callback JavaScript; ứng dụng không nhận token qua redirect URL. Không cần client secret cho xác minh ID token này và không đưa thông tin bí mật vào trình duyệt.

`GET /api/config` chỉ công bố client ID và khả năng sẵn có. Thiếu hoặc sai định dạng cấu hình thì Google hiện chưa khả dụng, người dùng vẫn nhập tên/mã phòng/mật khẩu bình thường. Cấu hình client ID không chứng minh origin/consent đã đúng; phải kiểm thử thực tế. API Google còn yêu cầu PostgreSQL và SESSION_SECRET để giới hạn yêu cầu và ký danh tính.

Ứng dụng dùng nút chính thức từ `https://accounts.google.com/gsi/client`, gửi credential bằng JSON tới `/api/auth/google`, xác minh chữ ký bằng chứng thư Google và kiểm tra audience, issuer, expiry, email_verified cùng stable `sub`. Không chấp nhận profile do trình duyệt tự khai. Token danh tính bổ sung tồn tại tối đa 10 phút, không thể dùng làm token phòng; tạo/tham gia vẫn bắt buộc mật khẩu phòng. Cookie Google không được dùng để cấp quyền phòng; server không tạo cookie đăng nhập từ một POST cross-site. Bản lưu phòng giữ profile từ phiên đã ký; rời phòng xóa phiên/profile và tắt tự chọn tài khoản Google.

Nghiệm thu trên origin được cấp phép: dùng hai tài khoản Google thật, kiểm tra hai `sub` khác nhau nhưng không thay đổi khi đăng nhập lại; tạo/tham gia cùng phòng bằng đúng mật khẩu, reload giữ tên/ảnh/email; thử sai mật khẩu và phòng khác vẫn bị từ chối; đóng popup, hủy khi đang xác minh và rời phòng không tạo lại profile. Không dán credential, identity_token hoặc room token vào ảnh/log/chứng cứ. Các fixture ký RSA trong test chỉ chứng minh ranh giới xác minh; chúng không thay cho nghiệm thu Google thật.

## C-024 — Web Push

Chạy `supabase/push.sql` qua `npm run db:migrate` (đã được `runMigrations` gọi tự động cùng schema chính) trước khi bật push; nó thêm `push_events`/`push_deliveries` trong `sharefridge_private` và trigger `queue_room_change` trên `foods`/`shopping_items`. `GET /api/config` chỉ báo `capabilities.push:true` khi migration `003_web_push` đã chạy VÀ cặp VAPID hợp lệ đang được cấu hình.

1. Sinh cặp khóa VAPID một lần: `npx web-push generate-vapid-keys`. Đặt `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (base64url) và `VAPID_SUBJECT` (địa chỉ `mailto:` liên hệ được) trong Vercel Project Settings cho từng môi trường. Không đưa `VAPID_PRIVATE_KEY` vào biến `VITE_*`.
2. Sinh `CRON_SECRET` riêng: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, đặt trong Vercel với đúng tên biến `CRON_SECRET`. Vercel Cron Jobs tự động gửi header `Authorization: Bearer <CRON_SECRET>` khi gọi các job khai báo trong `vercel.json`; `authorizeCron` trong `server/push.js` so khớp header này bằng `timingSafeEqual`. Không tự tạo job cron ở nơi khác gọi endpoint này mà không mang đúng header.
3. `vercel.json` khai báo `crons: [{ path: "/api/cron/expiry", schedule: "30 9 * * *" }]` — lịch cron của Vercel luôn theo UTC; 09:30 UTC = 16:30 giờ Việt Nam (UTC+7, không có giờ mùa hè). Cron job **chỉ chạy trên Production**; Preview/manual `curl` có `CRON_SECRET` đúng vẫn gọi được endpoint nhưng không thay thế được lịch tự động của Production.
4. Service worker: `sw-push.js` (chứa `push`/`notificationclick`) được nhúng vào service worker chính do `vite-plugin-pwa` sinh ra qua `workbox.importScripts` trong `vite.config.ts` — không có worker thứ hai nào được đăng ký riêng. Sau khi build, kiểm tra `dist/sw.js` có dòng `importScripts("sw-push.js")` (hoặc tương đương) để xác nhận đã nhúng.
5. Trình duyệt: `PushManager.subscribe` chỉ chạy trong secure context (`https://` hoặc `localhost`) và yêu cầu Notification permission do người dùng bấm nút cấp; trên iPhone, PWA phải được "Thêm vào Màn hình chính" trước khi `PushManager` tồn tại. Đăng ký được gắn với `subscriber_id` của thiết bị và gửi kèm header `X-Push-Subscriber-Id` trên các request thay đổi tủ/danh sách mua, để chính thiết bị vừa thao tác không tự nhận lại thông báo "có thay đổi" của chính nó (khi header hợp lệ).

Nghiệm thu trên bản Production đã triển khai, có `VAPID_*`/`CRON_SECRET` thật: bật thông báo trên một thiết bị thật, khóa màn hình/đóng app; gọi `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/expiry` sau 16:30 giờ Việt Nam (hoặc chờ cron tự chạy) và xác nhận nhận được thông báo đúng nội dung hạn dùng; gọi lại lần hai trong cùng ngày để xác nhận không gửi trùng (dedup theo ngày). Từ thiết bị khác trong cùng phòng, thêm/xóa một món và xác nhận thiết bị còn lại (không phải thiết bị vừa thao tác) nhận được thông báo "Tủ đồ phòng mình có thay đổi". Ghi lại timestamp, timezone hiển thị trên thiết bị và kết quả dedup vào `evidence/C-024/`. Endpoint hết hạn/404-410 phải tự dọn đăng ký cũ; không coi log local hoặc test giả lập là bằng chứng nhận được thông báo thật.

## C-025 — Ảnh món ăn và tài sản PWA

Ảnh không còn lưu base64 trong DB: `POST /api/foods`/`PATCH /api/foods/{id}` chỉ nhận `storage_path` (từ `POST /api/photos`), không bao giờ nhận `photo_url` trực tiếp từ client — `photo_url` luôn được server tính lại từ `storage_path` bằng signed URL 5 phút tại thời điểm đọc, không lưu trữ. `GET /api/config` chỉ báo `capabilities.photos:true` khi migration `004_photo_storage` đã chạy VÀ có cấu hình Storage hợp lệ.

1. Trong Supabase Dashboard → **Storage**, tạo bucket mới tên chính xác `food-photos`, để **Private** (không bật Public bucket). Không cần policy RLS thủ công vì server dùng `SUPABASE_SERVICE_ROLE_KEY` (bỏ qua RLS), không dùng anon key cho Storage.
2. Lấy **service_role secret key** (Project Settings → API Keys — mục Legacy hoặc Secret key tùy phiên bản dashboard; đây LÀ khóa toàn quyền, khác hẳn anon key ở mục C-021) và đặt vào Vercel với tên `SUPABASE_SERVICE_ROLE_KEY`. Không đưa vào biến `VITE_*`, không log, không trả về client.
3. `SUPABASE_URL` dùng chung với cấu hình Realtime ở mục C-021 phía trên.
4. Ràng buộc: ảnh giải mã base64 tối đa 100KB, cả hai chiều tối đa 1280px, chỉ JPEG/PNG/WebP một khung hình (không ảnh động). Client tự nén/co bằng canvas đến khi đạt giới hạn trước khi upload; server xác thực lại toàn bộ (chữ ký magic byte, giải mã thật bằng `sharp`, kích thước) — không tin dữ liệu client gửi lên.
5. Icon PWA: `public/pwa-192x192.png`/`pwa-512x512.png` là PNG thật (không phải JPEG đổi tên) sinh từ `public/logo.jpg` bằng `sharp`, không qua chỉnh sửa AI. Chỉ một nguồn manifest — cấu hình trong `vite.config.ts` (`VitePWA({ manifest: {...} })`); không tạo `public/manifest.webmanifest` tĩnh vì `vite-plugin-pwa` sẽ ghi đè nó lúc build mà không báo lỗi, dẫn tới hai bản khai kỳ vọng khác nhau.
6. Dọn ảnh mồ côi: cùng `GET /api/cron/expiry` (đã xác thực `CRON_SECRET` ở mục C-024) gọi thêm bounded cleanup cho các ảnh `staged` quá hạn ân hạn (1 giờ) chưa từng gắn vào món, và các ảnh `pending_delete` (đã tháo khỏi món/bị thay ảnh khác) — tự động, không cần thao tác thủ công. Có thể gọi tay: `node scripts/backfill-photos.js` (mặc định dry-run, thêm `--apply` để chạy thật) để chuyển các dòng `photo_url` base64 cũ (trước C025) sang `storage_path` thật; không bao giờ xóa `photo_url` cũ kể cả khi thành công, và có thể chạy lại an toàn (bỏ qua dòng đã có `storage_path`).

Nghiệm thu trên bản Production đã triển khai: từ thiết bị A, chụp/chọn ảnh thật, lưu món; xác nhận `GET /api/foods` trả `photo_url` là URL Storage đã ký (khác domain ứng dụng), tải được ảnh. Từ thiết bị B trong cùng phòng, xác nhận thấy đúng ảnh đó. Xóa món, đợi cron chạy (hoặc gọi tay có `CRON_SECRET`), xác nhận object trong Storage bucket không còn. Cài đặt PWA trên điện thoại thật và xác nhận icon màn hình chính đúng ảnh logo (không phải icon mặc định/vỡ). Không coi ảnh preview cục bộ (chưa upload) là bằng chứng; chỉ tính khi đọc lại được từ Storage qua signed URL thật.
