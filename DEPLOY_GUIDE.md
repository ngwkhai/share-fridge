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

## C-029 — Nhánh phát hành, remote GitHub và CI làm cổng

**Trạng thái 2026-09-06: đã xong toàn bộ. `main` giờ tự động deploy production — xem mục THAY ĐỔI HÀNH VI.**

`main` là nhánh phát hành duy nhất. Mọi nhánh `codex/*` đã được merge và xóa; tag
`archive/main-pre-v7` giữ con trỏ baseline cũ.

- Remote: https://github.com/ngwkhai/share-fridge (public)
- CI: `.github/workflows/ci.yml`, job `build-and-test`, chạy trên mọi push vào main và mọi PR
- Branch protection trên `main`: bật, `build-and-test` là required check, strict, enforce_admins

### Bài học 1 — `secrets` KHÔNG dùng được trong `if:`

Lần push đầu tiên lên remote mới cho ra một run "thất bại" mà **không có job nào chạy**
(`total_count: 0`, không annotation, chỉ một dòng "This run likely failed because of a
workflow file issue"). Nguyên nhân: hai bước Playwright được guard bằng

```yaml
if: ${{ vars.BASE_URL != '' || secrets.BASE_URL != '' }}   # SAI
```

Context `secrets` không tồn tại trong biểu thức `if:`. Dùng nó ở đó làm **toàn bộ file
workflow invalid**, nên GitHub không lên lịch một job nào. Kết quả đọc như một build đỏ,
nhưng thực tế không có gì được build cả — đây là kiểu lỗi dễ chẩn đoán nhầm nhất.

Cách đúng: guard bằng biến repo, còn giá trị thì vẫn lấy từ secret qua `env`:

```yaml
if: ${{ vars.BASE_URL != '' }}                              # ĐÚNG
env:
  BASE_URL: ${{ secrets.BASE_URL || vars.BASE_URL }}        # `secrets` hợp lệ trong env
```

Để bật e2e trên CI: đặt **repository variable** `BASE_URL` (Settings → Secrets and
variables → Actions → Variables). Không đặt biến đó thì hai bước Playwright bị skip và CI
vẫn xanh — đúng ý đồ.

### Bài học 2 — branch protection không có trên repo private của gói Free

Cả `PUT /repos/{owner}/{repo}/branches/main/protection` lẫn Rulesets đều trả 403
"Upgrade to GitHub Pro or make this repository public". Operator đã chọn **chuyển repo
sang public** (đã quét bí mật sạch trên toàn bộ lịch sử trước đó). Sau khi public, branch
protection bật được ngay và miễn phí.

Nếu sau này muốn quay lại private: phải có GitHub Pro, nếu không `main` mất cổng cứng và
phải mở một dòng trong `DEBT.md`.

### Bài học 3 — tag phải trỏ đúng commit đã build production

`v1.0.0` ban đầu được gắn tại `35a8355` dựa trên suy luận từ AUTO-LOG khi chưa có mạng.
Vercel API cho biết deployment production `dpl_Apfbe52eAZuEBoNqyF1pU3ANAyRV` thực sự build
từ `2ad793e` — sớm hơn một commit. Phần chênh lệch chỉ là file bằng chứng C-028, không có
một dòng mã sản phẩm nào:

```sh
git diff --stat 2ad793e 35a8355 -- src/ api/ server/ public/ package.json \
  package-lock.json vite.config.ts vercel.json index.html tsconfig.json
# (rỗng)
```

Tag đã được dời về `2ad793e` để `git checkout v1.0.0` tái tạo đúng production. Quy tắc từ
đây: **đọc `meta.gitCommitSha` của deployment trước khi gắn tag phát hành**, đừng suy luận
từ log.

```sh
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v13/deployments/<dpl_id>?teamId=<team_id>" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['meta']['gitCommitSha'])"
```

### Nối repo vào Vercel — đã xong 2026-09-06

`vercel git connect` ban đầu trả 400:

```
Error: Failed to link ngwkhai/share-fridge. You need to add a Login Connection
to your GitHub account first. (400)
```

Nguyên nhân: có HAI tài khoản Vercel, và CLI đang dùng tài khoản sở hữu dự án
(`khaindhrt-9606` / khaind.hrt@gmail.com) nhưng tài khoản đó chưa nối GitHub.

**Điểm dễ nhầm:** đăng nhập đúng tài khoản thôi CHƯA đủ. Vào Settings → Authentication,
dòng GitHub vẫn ở trạng thái "Connect your GitHub account" và phải bấm **Connect** để chạy
luồng OAuth. Nối xong thì `vercel git connect` chạy được ngay:

```sh
npx vercel whoami                 # phải ra khaindhrt-9606
npx vercel git connect https://github.com/ngwkhai/share-fridge --yes
# > Connected
```

Lo ngại "một danh tính GitHub chỉ gắn được một tài khoản Vercel" hóa ra KHÔNG chặn — không
cần tháo `ngwkhai` khỏi tài khoản `nguyendinhkhaiqt2005-8486` trước.

`productionBranch` đã là `main` sẵn ngay khi nối. Kiểm chứng:

```sh
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/<projectId>?teamId=<teamId>" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['link']['productionBranch'], d['link']['org']+'/'+d['link']['repo'])"
# main ngwkhai/share-fridge
```

### THAY ĐỔI HÀNH VI — đọc kỹ trước lần push tiếp theo

Từ 2026-09-06, **`main` tự động deploy production.** Mọi commit vào main sinh một bản
production mới. Kèm theo:

- Không push thẳng vào main được nữa — branch protection từ chối (`GH006`), phải đi qua PR.
- Merge PR vào `main` = phát hành. Không merge khi chưa muốn lên production.
  Nhưng ĐỪNG suy ra "mỗi thẻ phải deploy một lần" — xem mục **Nhịp deploy** ngay bên dưới:
  gộp nhiều thẻ qua một nhánh tích hợp rồi merge một lần là cách làm mặc định nên dùng.
- `vercel deploy` từ CLI vẫn chạy được, nhưng đừng dùng song song: nó tạo bản production
  KHÔNG gắn với commit nào trên main, đúng cái vòng luẩn quẩn mà C-029 vừa gỡ.
- Trước khi gắn tag phát hành, vẫn đọc `meta.gitCommitSha` của deployment (xem Bài học 3).

## Nhịp deploy — quyết định của OPERATOR, không phải luật cứng

Từ khi `main` nối Git, mỗi lần merge sinh một bản production. Dễ hiểu nhầm thành "mỗi thẻ
phải deploy một lần". KHÔNG phải. **Nhịp deploy là lựa chọn của operator theo từng nhóm việc.**
Ba nhịp đều hợp lệ:

| Nhịp | Khi nào dùng | Chi phí |
|---|---|---|
| **Mỗi thẻ một lần** | Thẻ đụng mã sản phẩm, hoặc cần bằng chứng production ngay | 1 preview + 1 production / thẻ |
| **Gộp nhiều thẻ** | Chuỗi thẻ chỉ có ý nghĩa khi lên cùng nhau (vd nhiều trang tĩnh, nhiều endpoint của một nhóm) | 1 production cho cả cụm |
| **Hotfix** | Sự cố production | Ngay lập tức, bỏ qua gộp |

Mặc định nên là **gộp**. Deploy từng thẻ chỉ tạo thêm bản production không ai xem, mà mỗi bản
vẫn tính vào hạn mức.

### Cách gộp: nhánh tích hợp

Cách chắc chắn nhất, không phụ thuộc cấu hình Vercel:

```sh
git checkout main && git pull
git checkout -b release/v7-phap-ly          # nhánh tích hợp cho cả cụm thẻ

# từng thẻ vẫn một nhánh + một PR, nhưng PR nhắm vào nhánh tích hợp
git checkout -b card/C-031
gh pr create --base release/v7-phap-ly --title "C-031: ..."
```

Merge từng thẻ vào `release/*` (không deploy production, vì Vercel chỉ auto-deploy production
từ `main`), rồi khi cả cụm xong mở MỘT PR `release/* -> main`. Một lần merge, một bản production
mang cả cụm.

Lưu ý: PR nhắm vào `release/*` vẫn sinh **preview deployment** — đó là thứ dùng để verify.

### Cách gộp thứ hai: Ignored Build Step

Vercel **không có** cờ `[skip ci]` sẵn trong commit message. Muốn có thì phải tự đặt lệnh trong
Project Settings -> Git -> **Ignored Build Step**, đọc biến `VERCEL_GIT_COMMIT_MESSAGE`:

```sh
if echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -q '\[skip deploy\]'; then exit 0; else exit 1; fi
```
Exit **0 = bỏ qua build**, exit **1 = build**. Ngược trực giác, dễ đặt nhầm.

Cảnh báo: build bị hủy theo cách này **vẫn tính vào hạn mức deployment**. Nên nó tiết kiệm thời
gian build chứ không tiết kiệm quota — nhánh tích hợp mới là cách tiết kiệm thật.

## Verify trên preview thay vì production

Mỗi PR sinh một preview deployment có **đủ 14 biến môi trường** như production. Nhưng có hai
cái bẫy phải biết trước khi tin vào nó:

### Bẫy 1 — preview bị SSO chặn, `curl` trần trả 302

`ssoProtection = {"deploymentType": "all_except_custom_domains"}`. Gọi thẳng sẽ bị đẩy sang
`vercel.com/sso-api`, KHÔNG phải app hỏng:

```sh
$ curl -o /dev/null -w '%{http_code}' https://sharefridge-git-<branch>-...vercel.app/healthz
302
```

Dự án đã có sẵn một **automation bypass token** (Project Settings -> Deployment Protection).
Đưa vào header là gọi được:

```sh
$ curl -H "x-vercel-protection-bypass: <token>" https://sharefridge-git-<branch>-...vercel.app/healthz
{"status":"ok","version":"1.0.0","timestamp":"..."}      HTTP 200
```

Đọc token từ project settings (nó cũng có sẵn dưới dạng biến môi trường), đừng chép cứng vào
repo.

### Bẫy 2 — preview DÙNG CHUNG database với production

`DATABASE_URL` trên target `preview` và `production` là **cùng một giá trị**. Nghĩa là mọi thao
tác ghi khi verify trên preview đều rơi vào **database production thật**.

Hệ quả bắt buộc nhớ:

- Verify chỉ-đọc trên preview: an toàn.
- Verify có ghi (tạo phòng, thêm món, xóa): **đang sửa dữ liệu production**. Dùng phòng dùng-một-lần
  và dọn sau, đúng như các card C-018..C-025 đã làm.
- Đừng coi preview là môi trường staging. Nó là production với một URL khác.

### Thẻ nào KHÔNG được verify bằng preview

Bằng chứng phải là production thật khi thẻ nói về chính hạ tầng phát hành:

- Thẻ hợp đồng / e2e chạy trên URL production
- Thẻ đụng domain, Digital Asset Links, PWA manifest (`sharefridge.vercel.app` mới là cái Google đọc)
- Thẻ phát hành, tag, rollback

## Quan hệ với luật trong CLAUDE.md

CLAUDE.md ghi "Merge != shipped" và "done-evidence = world-state (deployed URL)". Cách gộp ở trên
KHÔNG phá luật đó, nó chỉ dời thời điểm:

- Thẻ verify trên preview -> dán bằng chứng preview vào `## Evidence`, ghi rõ **là preview**.
- Khi cụm merge vào `main`, xác nhận lại trên production bằng một dòng `curl` và dán vào thẻ.
- Thẻ nào chưa có xác nhận production thì `## Evidence` phải nói thẳng là PARTIAL — không làm tròn lên.

### Đổi lại token Vercel CLI khi hết hạn

Token trong `~/Library/Application Support/com.vercel.cli/auth.json` có `expiresAt`. Khi hết
hạn, mọi lời gọi API trả `403 invalidToken`. Không cần đăng nhập lại — chạy bất kỳ lệnh CLI
nào (`npx vercel whoami`) là refreshToken tự đổi lấy token mới và ghi đè file đó.

### Chạy kiểm tra tay

```sh
npm test          # 118/118 phải pass - bao gồm bộ chống trôi hợp đồng
npx tsc --noEmit  # phải exit 0
npm run build     # PHẢI chạy trên máy Mac
```

`npm run build` không chạy được từ shell Linux của Claude vì `node_modules` chứa binary macOS
(`@rollup/rollup-darwin-arm64`, `@esbuild/darwin-arm64`). Đây là giới hạn môi trường, không phải
lỗi mã nguồn — đừng cài đè `node_modules` để "sửa", việc đó sẽ phá môi trường dev trên máy Mac.
Trên máy Mac cả ba lệnh đều chạy thật và đều xanh (2026-09-06).

### Quy tắc contract sau v3

`flow/05-contract.md` có hai vùng khác nhau và `tests/client_contract.test.js` phân biệt chúng:

- **Bảng endpoint** = tập route PHẢI có thật trong `/api/openapi.json` đang chạy. Thêm một dòng
  vào đây mà chưa có code sẽ làm test đỏ — đúng như thiết kế.
- **Planned routes** = route đã thiết kế nhưng chưa xây, có cột `Lands with` chỉ rõ card nào sẽ
  chuyển nó lên bảng endpoint. Việc chuyển dòng là một phần diff của card đó, không bao giờ là
  một lần "cập nhật tài liệu" riêng.
