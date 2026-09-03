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

Kiểm tra local bằng `npm test`, `TEST_DATABASE_URL=... npm run test:sync-postgres`, `npm run build`. Các kiểm tra này không thay cho nghiệm thu hai trình duyệt trên Supabase đã triển khai. Cần đo riêng độ trễ thêm/sửa/xóa/đã nấu và reconnect trên URL thật; polling không chứng minh mục tiêu dưới 500 ms.


## Google Identity Services

Tạo OAuth client loại Web application trong Google Cloud Console và đặt `GOOGLE_CLIENT_ID` trên từng môi trường Vercel cần dùng. Khai báo chính xác **Authorized JavaScript origins** (scheme + hostname + port): origin Preview ổn định đã được cấp phép, origin production và `http://localhost:5173` nếu kiểm thử local. Popup GIS dùng callback JavaScript; ứng dụng không nhận token qua redirect URL. Không cần client secret cho xác minh ID token này và không đưa thông tin bí mật vào trình duyệt.

`GET /api/config` chỉ công bố client ID và khả năng sẵn có. Thiếu hoặc sai định dạng cấu hình thì Google hiện chưa khả dụng, người dùng vẫn nhập tên/mã phòng/mật khẩu bình thường. Cấu hình client ID không chứng minh origin/consent đã đúng; phải kiểm thử thực tế. API Google còn yêu cầu PostgreSQL và SESSION_SECRET để giới hạn yêu cầu và ký danh tính.

Ứng dụng dùng nút chính thức từ `https://accounts.google.com/gsi/client`, gửi credential bằng JSON tới `/api/auth/google`, xác minh chữ ký bằng chứng thư Google và kiểm tra audience, issuer, expiry, email_verified cùng stable `sub`. Không chấp nhận profile do trình duyệt tự khai. Token danh tính bổ sung tồn tại tối đa 10 phút, không thể dùng làm token phòng; tạo/tham gia vẫn bắt buộc mật khẩu phòng. Cookie Google không được dùng để cấp quyền phòng; server không tạo cookie đăng nhập từ một POST cross-site. Bản lưu phòng giữ profile từ phiên đã ký; rời phòng xóa phiên/profile và tắt tự chọn tài khoản Google.

Nghiệm thu trên origin được cấp phép: dùng hai tài khoản Google thật, kiểm tra hai `sub` khác nhau nhưng không thay đổi khi đăng nhập lại; tạo/tham gia cùng phòng bằng đúng mật khẩu, reload giữ tên/ảnh/email; thử sai mật khẩu và phòng khác vẫn bị từ chối; đóng popup, hủy khi đang xác minh và rời phòng không tạo lại profile. Không dán credential, identity_token hoặc room token vào ảnh/log/chứng cứ. Các fixture ký RSA trong test chỉ chứng minh ranh giới xác minh; chúng không thay cho nghiệm thu Google thật.
