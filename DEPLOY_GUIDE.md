# Hướng Dẫn Triển Khai Vercel & Cài Đặt Trên 2 Điện Thoại Di Động

## 1. Triển Khai 1-Click Lên Vercel (Miễn Phí 100%)

### Cách A: Triển khai trực tiếp bằng Vercel CLI (Nhanh nhất)
1. Cài đặt Vercel CLI (nếu chưa có):
   ```bash
   npm i -g vercel
   ```
2. Đăng nhập và deploy trực tiếp từ thư mục dự án:
   ```bash
   vercel --prod
   ```
   - Chọn project settings mặc định (`Framework: Vite`, `Build Command: npm run build`, `Output: dist`).
3. Cấu hình biến môi trường trên Vercel Dashboard (Project Settings -> Environment Variables):
   - `GEMINI_API_KEY`: Key từ [Google AI Studio](https://aistudio.google.com/)
   - `SESSION_SECRET`: Một chuỗi ký tự ngẫu nhiên (ví dụ: `sharefridge-secret-key-2026`)
   - `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`: (Tùy chọn nếu dùng Supabase Cloud)

---

### Cách B: Triển khai qua GitHub (Tự động cập nhật mỗi khi commit)
1. Tạo một repository mới trên GitHub và push code:
   ```bash
   git add .
   git commit -m "feat: complete ShareFridge production release"
   git push origin main
   ```
2. Mở [vercel.com](https://vercel.com) -> Bấm **Add New...** -> **Project** -> Chọn repo GitHub vừa tạo.
3. Thêm các biến môi trường và bấm **Deploy**.
4. Vercel sẽ cấp cho bạn một domain HTTPS chính thức (ví dụ: `https://share-fridge-app.vercel.app`).

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
