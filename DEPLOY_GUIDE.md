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
