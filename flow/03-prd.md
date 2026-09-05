# Stage 03 — PRD (Product Requirements Document)

## Gate — check ALL before `/flow next`
- [x] Every section below is filled from MY scope decision (stage 02), not re-expanded
- [x] Success metric is a NUMBER, not vibes ("save time" fails; "first response < 2h" passes)
- [x] Each feature names the user action and the observable result
- [x] Pain & gain is a MAPPING TABLE: every pain cites evidence (a stage-01 quote or a named observation), and names the v1 feature that kills it; every v1 feature kills at least one pain
- [x] A stranger could build v1 from this without asking me anything
- [x] No FILL placeholders remain in this file

## Context

Người thuê trọ sống cùng bạn ghép phòng (2 người) phải chia sẻ một chiếc tủ lạnh chung lớn với 3-5 phòng khác trong khu trọ. Đồ ăn để lẫn lộn, chật chội dẫn đến việc thực phẩm của phòng thường bị đè khuất lấp, quên lãng đến mức chảy nước hỏng mốc. Việc tìm kiếm đồ rất bất tiện và dễ gây xích mích với các phòng khác. Hai bạn cùng phòng không có kênh đồng bộ tức thì nên thường xuyên đi chợ mua trùng đồ hoặc mở tủ thấy hết nguyên liệu mà không biết hôm nay ăn gì.

## Target users

- **Persona chính:** Sinh viên và người đi làm trẻ (18 - 28 tuổi) sống ghép 2 người trong phòng trọ/chung cư mini tại Hà Nội, TP.HCM và các đô thị lớn.
- **Hành vi:** Tự nấu ăn 1-2 bữa/ngày, đi chợ dân sinh 2-3 lần/tuần, dùng điện thoại thông minh liên tục, ghét các biểu mẫu nhập liệu dài dòng và cần sự tiện lợi tối đa.

## Pain & gain (mapping table)

| # | Persona | Pain (concrete) | Evidence (stage-01 quote/source) | Today's workaround | V1 feature that kills it | Observable gain |
|---|---|---|---|---|---|---|
| P1 | Bạn cùng phòng nấu ăn | Quên thực phẩm bị đè khuất lấp dẫn đến hỏng mốc, thối rữa | Quote: *"forget what's buried at the bottom until it turns into mush"* | Thỉnh thoảng dọn tủ mới phát hiện đồ hỏng | **F2 (Cảnh báo Hạn dùng & Nấu gấp)** + **F9 (Push Notification 16:30)** | Dashboard phân màu Đỏ/Cam/Xanh, nhận thông báo đẩy trước giờ nấu, giảm 90% đồ vứt bỏ |
| P2 | Người lấy đồ trong tủ | Lục lọi tủ lạnh chung khó tìm, nhầm với đồ phòng khác | Observation: Đồ để trong túi bóng nilon/hộp giống nhau | Bới từng túi/hộp trong tủ lạnh chung | **F3 (Vị trí & Tag nhận diện)** + **F6 (Ảnh chụp hộp/bao bì)** | Nhìn ảnh và tag (ngăn tủ + màu túi) là lấy đúng đồ trong 3 giây |
| P3 | Người đi chợ & người nấu | Mất kết nối thông tin giữa 2 người: mua trùng hoặc hụt đồ | Observation: Nhắn tin Zalo hỏi "tủ còn gì không" nhưng người kia không mở tủ xem | Nhắn tin Zalo rời rạc hoặc đoán mò | **F5 (Đồng bộ Room PIN)** + **F10 (Danh sách Cần mua)** | Mở app thấy ngay kho real-time; món hết tự vào danh sách đi chợ |
| P4 | Người nấu bữa tối | Áp lực "Hôm nay ăn gì?", mở tủ không biết nấu món gì từ đồ có sẵn | Quote: *"stressing over what to cook with random leftover ingredients"* | Đặt đồ ăn ngoài hoặc nấu đại món không ngon | **F8 (Gợi ý món ăn thông minh AI Recipe)** | Bấm 1 nút có ngay 2-3 món Việt chuẩn vị từ đồ cận date, bấm "Nấu" tự trừ kho |
| P5 | Người vừa đi chợ về | Lười nhập liệu vì tay xách nhiều đồ và app nhập quá lâu | Quote: *"manual effort of typing every item becomes unsustainable"* | Không ghi chép, app bị bỏ xó sau 1 tuần | **F1 (Preset 1 chạm <5s)** + **F7 (Voice Input tiếng Việt)** | Bấm giữ mic nói 1 câu *"Thịt ba chỉ ngăn đông túi xanh"* tự điền form trong 2s |

### Pains NOT addressed in v1

- Chia tiền đi chợ / theo dõi chi phí nâng cao: Tạm hoãn sang v2, người dùng dùng app ngân hàng/sổ chi tiêu riêng.
- Quét barcode mã vạch: Không phù hợp với 80% đồ tươi mua ở chợ dân sinh.

## Problem statement

Người ở ghép phòng trọ dùng chung tủ lạnh cần một ứng dụng di động siêu nhanh để nhập đồ bằng giọng nói/1-chạm, định vị nhận diện bằng ảnh chụp/tag màu, tự động cảnh báo hạn dùng và gợi ý món ăn thông minh để không bao giờ lãng phí thực phẩm.

## Features (user-centric)

- **F1 (Quick Add Preset):** As a user, I tap presets (name suggestions, 1/3/7/14 days, compartment, color tag), and I see the item added to the fridge in < 5 seconds.
- **F2 (Visual Freshness & Expiry Filter):** As a user, I open the app, and I see color-coded badges (Red: ≤0d Expired, Amber: ≤2d Cook Urgently, Green: Fresh) with countdown days.
- **F3 (Storage & Container Identification):** As a user, I view an item, and I see its exact compartment (Freezer, Fridge Top, Crisper) and visual tag (e.g. "Hộp Lock xanh", "Túi zip đỏ").
- **F4 (Quick Consume / Mark as Cooked):** As a user, I tap "Đã nấu / Ăn xong", and I see the item instantly moved to history and optionally added to the shopping list with 1 tap.
- **F5 (Roommate Sync):** As a user, I join my room and see my roommate's saved food and shopping changes automatically within 5 seconds during normal connected use, with clear status when data may be stale.
- **F6 (Camera Photo Capture):** As a user, I take a photo or attach a picture of my food container, and I see a compressed (<100KB) thumbnail on the card.
- **F7 (Voice-to-Food Parsing):** As a user, I press the microphone button and speak a sentence in Vietnamese, and I see the name, compartment, container tag, and expiry auto-filled into the form.
- **F8 (Smart AI Recipe Suggester):** As a user, I tap "Hôm nay ăn gì?", and I see 2-3 Vietnamese recipe ideas utilizing urgent items in my fridge with a 1-tap "Nấu món này" action.
- **F9 (Push Notification Alerts):** As a user, I receive lock-screen push notifications at 16:30 for expiring food and real-time alerts when my roommate adds/consumes items.
- **F10 (Quick Shopping List):** As a user, I tap the shopping tab, and I see depleted items ready to be checked off while grocery shopping.

## Non-functional requirements

- **Mobile-First & PWA:** Cài đặt như app native trên iOS/Android, màn hình mở tức thì < 1.5s.
- **Zero Friction Touch UX:** Nút bấm lớn (tối thiểu 44px), hỗ trợ thao tác bằng một tay khi đang đứng trước tủ lạnh.
- **Client Compression:** Ảnh chụp nén trực tiếp trên trình duyệt xuống < 100KB trước khi lưu trữ để tiết kiệm 4G/dung lượng.
- **Voice Response:** Nhận diện giọng nói tiếng Việt tức thì qua Web Speech API native.

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + Lucide Icons + `vite-plugin-pwa`.
- **Backend / Database:** Supabase (PostgreSQL + Realtime WebSocket + Storage bucket `food-photos` + Row Level Security).
- **AI Service:** Google Gemini 2.5 Flash API (Voice JSON extraction & Recipe prompt).
- **Notification Protocol:** Web Push API (VAPID) + Service Worker push event.
- **Hosting / Deployment:** Cloudflare Pages / Vercel (Frontend & PWA) + Supabase Cloud.

## Success metric (numbers only)

- Thời gian nhập 1 món: **< 3 giây** (qua Voice) và **< 5 giây** (qua Form 1 chạm).
- Tỷ lệ thực phẩm bỏ phí: Giảm từ ~4 món/tháng xuống **< 1 món/tháng** sau 2 tuần sử dụng.
- Tỷ lệ nhận diện chính xác món đồ trong tủ: **100%** món đồ có tag vị trí hoặc ảnh chụp thực tế.
- Tốc độ đồng bộ giữa 2 điện thoại: **≤5 giây** khi cả hai ứng dụng đang mở ở foreground, có mạng ổn định và đã kết nối đồng bộ. Đo từ thao tác xác nhận lưu/thay đổi ở thiết bị A đến khi thay đổi hiển thị ở thiết bị B; bao gồm thời gian API và render, áp dụng cho thao tác được server chấp nhận. Ghi nhận riêng thao tác lỗi và mất kết nối, không coi chúng là đồng bộ thành công. Chế độ nền, ngoại tuyến hoặc polling suy giảm không có cam kết 5 giây; khi mở lại/kết nối lại phải lấy đầy đủ dữ liệu mới nhất, kể cả danh sách rỗng.

### Điều chỉnh yêu cầu F5 — 2026-09-04

Theo yêu cầu của operator, bỏ mục tiêu <500ms vì ứng dụng chia sẻ tủ lạnh không cần phản hồi ở mức dưới một giây. Mục tiêu ≤5 giây phù hợp việc cùng theo dõi đồ ăn và danh sách mua sắm; các mẫu Production đã quan sát mất khoảng 2,6–3,5 giây, chưa phải cam kết thống kê/SLA cho mọi mạng hoặc thiết bị. Ưu tiên giữ dữ liệu nhất quán, không mất thay đổi đã lưu, không tự khôi phục món đã xóa, và hiển thị trung thực trạng thái kết nối. Độ đúng dữ liệu, phân quyền phòng và phục hồi sau mất mạng vẫn là yêu cầu nghiệm thu.

---

## Bổ sung v7 — Phát hành công khai lên CH Play (2026-09-05)

### Thay đổi đối tượng người dùng

v1–v6 phục vụ đúng 2 người đã biết nhau, nhận link qua Zalo. v7 bổ sung một persona thứ hai
mà toàn bộ thiết kế hiện tại chưa tính đến:

- **Persona mới — "người lạ trên CH Play":** tìm thấy app qua tìm kiếm hoặc gợi ý, không có ai
  giải thích, không có ngữ cảnh về khái niệm "mã phòng". Đánh giá app trong 30 giây đầu và
  bỏ đi không để lại lời nào — hoặc để lại 1 sao.

### Yêu cầu phi chức năng bổ sung

- **Khởi động:** LCP dưới 2,5 giây trên mạng 4G ở URL production; Lighthouse mobile Performance ≥ 90.
- **Onboarding:** người chưa từng thấy app tự tạo phòng và thêm một món trong dưới 3 phút,
  không được hướng dẫn.
- **Khôi phục:** mọi đường vào có mật khẩu phải có đường lấy lại. Quên passcode không được
  dẫn đến mất dữ liệu vĩnh viễn.
- **Ổn định:** tỉ lệ phiên không crash ≥ 99,5%.
- **Xóa dữ liệu:** người dùng xóa được toàn bộ dữ liệu của mình, từ trong app và từ một URL web
  độc lập không cần cài app.
- **Đồng ý:** mọi mục đích xử lý dữ liệu được đồng ý riêng biệt; từ chối bất kỳ mục nào vẫn
  dùng được chức năng cốt lõi.
- **Vận hành:** lỗi production được ghi nhận và cảnh báo trong vòng 5 phút mà không cần
  người dùng báo.

### Chỉ số thành công bổ sung (số, không phải cảm tính)

Các chỉ số v1 (dưới 5 giây/món, dưới 1 món bỏ phí/tháng) giữ nguyên. Bổ sung nhóm chỉ số
phân phối, đo trong 30 ngày đầu sau khi mở production:

- **Tỉ lệ phòng có từ 2 thành viên trở lên: ≥ 55%.** Đây là chỉ số bắc cầu quan trọng nhất
  của sản phẩm — ShareFridge dùng một mình thì vô nghĩa, toàn bộ giá trị nằm ở việc mời được
  người thứ hai. Chỉ số này thấp nghĩa là vấn đề ở luồng mời, không phải ở tính năng.
- Giữ chân D1 ≥ 40%, D7 ≥ 20%.
- Số món tạo mỗi tuần trên mỗi phòng hoạt động: ≥ 5. Dưới ngưỡng này nghĩa là rào cản nhập
  liệu (pain point P5) vẫn chưa được giải quyết cho người lạ.
- Tỉ lệ phiên không crash ≥ 99,5%.
- Tỉ lệ gỡ cài trong 7 ngày ≤ 40%.
- Đánh giá trung bình trên CH Play ≥ 4,0.

### Ràng buộc lịch trình không rút ngắn được bằng kỹ thuật

Tài khoản Google Play cá nhân mở sau 13.11.2023 phải có ít nhất 12 người thử nghiệm giữ trạng
thái opt-in LIÊN TỤC trong 14 ngày trước khi được nộp đơn xin lên production; Google duyệt đơn
trong khoảng 7 ngày. Đồng hồ 14 ngày chạy theo thời gian tester opt-in, KHÔNG theo chất lượng
bản build — do đó bản AAB tối thiểu phải lên kênh closed sớm nhất có thể, và các card chất
lượng chạy song song trong lúc đồng hồ đếm.

### Pain chưa xử lý trong v7

- Người dùng iPhone không có app trên App Store (đánh đổi có ý thức, ADR quyết định 8).
- Chi phí Gemini theo mức dùng chưa có mô hình doanh thu bù lại — được kiểm soát bằng trần
  chi phí (F17) chứ không phải bằng doanh thu.
