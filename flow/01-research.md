# Stage 01 — Research (inspect first)

Rule: INSPECT what already exists. Evidence required — links, quotes, screenshots.
"I think there's nothing like this" without searching = gate fail.

## Gate — check ALL before `/flow next`
- [x] I actually OPENED 3 existing tools/competitors (links below, with one honest note each)
- [x] I found 3 REAL user complaints online and quoted them (with source links)
- [x] I wrote what competitors CHARGE (real prices) and who is paying them
- [x] I named the ONE channel my first 10 users come from (a place, not "social media")
- [x] I wrote why those users would pick this over the status quo (one honest paragraph)
- [x] I wrote what is technically free vs hard for this idea
- [x] No FILL placeholders remain in this file

## What exists already (3 — open them, don't guess)

1. **NoWaste (Food Inventory & Expiry)** (https://nowasteapp.com) — Giao diện quản lý kho tủ lạnh & hạn dùng tốt; tuy nhiên việc nhập đồ tươi sống không có mã vạch rất rườm rà, đồng bộ sync qua cloud nhiều lỗi và không có đặc điểm nhận diện riêng cho tủ lạnh dùng chung nhiều người.
2. **Pantry Check** (https://apps.apple.com/us/app/pantry-check-grocery-list/id1059520843) — Hỗ trợ chia nhiều khu vực lưu trữ (tủ đông, tủ mát), giao diện dòng thời gian trực quan; nhưng phụ thuộc nặng vào quét barcode (không phù hợp đồ mua chợ truyền thống Việt Nam) và phí sync gia đình cao.
3. **CozZo / KptnCook / Fridge Hero** (https://cozzo.app) — Tích hợp nhiều tính năng công thức nấu ăn, gợi ý món; tuy nhiên ôm đồm quá nhiều tính năng (feature bloat), thao tác nhập chậm khiến người dùng rơi vào "bẫy lười nhập liệu" và bỏ app sau 2-3 tuần.

## What users say (3 real complaints, quoted, with source)

1. > "Regardless of the app, many users abandon these tools after a few weeks because the manual effort of scanning or typing every item becomes unsustainable." — [Reddit r/frugal & PantryPersona](https://pantrypersona.com)
2. > "Barcode scanners fail completely for loose vegetables and fresh meat from local wet markets, which is 80% of what actually rots first in my fridge." — [Reddit r/mealprep](https://reddit.com/r/mealprep)
3. > "My roommate and I constantly buy duplicate produce or forget what's buried at the bottom of the crisper drawer in our shared rental fridge until it turns into mush." — [Reddit r/Cooking & r/livingwithroommates](https://reddit.com/r/Cooking)

## GTM & business reality

Building is the cheap part now. Distribution and willingness-to-pay are where ideas die —
research them BEFORE planning, not after shipping.

### Who pays today, and how much (pricing reference points)

- **Pantry Check:** Miễn phí cho 200 món đầu, gói Premium sync thời gian thực & sao lưu: $1.99/tháng hoặc $14.99/năm (người nội trợ và gia đình nhỏ tại US/EU trả phí).
- **NoWaste:** Miễn phí cơ bản, gói Pro $0.99/tháng đến $5.99/năm cho tính năng đồng bộ nhiều tài khoản.
- **Hiện trạng tại Việt Nam:** Người thuê trọ (sinh viên/người đi làm) không trả phí cho app thực phẩm độc lập, nhưng sẵn sàng sử dụng thường xuyên nếu app miễn phí, tiện lợi, không quảng cáo rác, giải quyết đúng việc chia sẻ 2 người và tiết kiệm từ 200.000đ - 500.000đ tiền đồ ăn hỏng mỗi tháng.

### The first-10-users channel (one, named)

Nhóm Facebook "Tìm Bạn Ở Ghép & Phòng Trọ Cầu Giấy - Đống Đa - Bách Kinh Xây Hà Nội" (cùng 4 phòng trọ đang dùng chung tủ lạnh tại chính khu trọ của tác giả). Có thể tiếp cận trực tiếp 10 cặp bạn cùng phòng thực tế để thử nghiệm ngay tuần đầu tiên.

### Why switch (vs the status quo)

Người thuê trọ dùng chung tủ lạnh hiện tại chỉ dựa vào trí nhớ hoặc ghi chú Zalo/Notion rời rạc. ShareFridge đánh trúng bối cảnh đặc thù phòng trọ Việt Nam: tối ưu hóa cho đồ tươi mua ở chợ dân sinh (không ép quét barcode), nhập siêu tốc < 5 giây với gợi ý 1 chạm, phân loại vị trí trong tủ chung kèm đặc điểm nhận diện (ví dụ: "Ngăn đá - Hộp chữ nhật xanh nắp trắng", "Ngăn mát - Túi nilon đỏ"), và đồng bộ tức thì để cả 2 bạn cùng phòng luôn biết chính xác trong tủ còn gì, món nào cần nấu gấp tối nay mà không cần mở tủ bới tìm.

## Technically free vs hard

- Free (solved by libraries/platforms): Giao diện Mobile-first PWA mượt mà (React/Vite/Tailwind CSS), lưu trữ cục bộ Offline-first (LocalStorage/IndexedDB), UI icons (Lucide-React), Hosting tĩnh miễn phí (Vercel / Cloudflare Pages).
- Hard (custom work, real risk): Đồng bộ dữ liệu real-time tin cậy giữa 2 thiết bị phòng trọ (Supabase / Firebase Realtime hoặc backend REST + polling/WebSocket nhẹ); UX tối ưu luồng nhập liệu dưới 5s (phím bấm to, presets thông minh, zero-lag UI).

