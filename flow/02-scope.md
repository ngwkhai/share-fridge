# Stage 02 — Scope (go/no-go)

Scope = features chosen by IMPACT × COST, inside your time budget.
KILL here is cheap and smart. Killing a weak idea at this gate is a SUCCESS outcome.

## Impact rubric (business value — score BEFORE looking at cost)

| Impact | Meaning |
|---|---|
| H | moves money or the core promise: gets users in (acquisition), gets them paying (revenue), or delivers the one job they came for |
| M | keeps users / saves real time weekly (retention, operations) |
| L | nice-to-have; nobody would pay for or switch over it |

Decision matrix: **H-impact features justify B/C cost** (via the C-paths below).
**L-impact features must be grade A or they're cut** — and even grade-A L-features are
cut when the budget is tight. The classic failure is a v1 full of A-grade L-impact
features: cheap to build, worthless to sell.

## AI coding grade rubric

| Grade | Meaning | Examples |
|---|---|---|
| A | cheap for AI | CRUD, forms, dashboards, content sites, API wrappers |
| B | moderate | file processing, 3rd-party integrations, auth via library, single LLM call, HITL AI drafts |
| C | expensive | realtime, payments from scratch, custom auth, autonomous agentic AI pipelines, heavy concurrency |

**Grade is a COST estimate, not a permission.** The gate is fit(grades, budget), not "no C allowed."
When a C feature is the real need, three honest paths:
1. **The C feature IS the product** → invert the cut: C goes FIRST (riskiest assumption first),
   everything else is minimized to serve it, and the budget is renegotiated against reality.
   But: one C proves the value prop — its siblings are v2 cards, not v1 scope.
2. **Re-architect C down to B** (highest-leverage move): multi-step agent → single LLM call;
   auto-send → human-approves-draft; custom pipeline → managed service / library.
   Same user value, one grade cheaper.
3. **Irreducible C that doesn't fit the budget** → KILL or re-budget. Both are honest.

## Gate — check ALL before `/flow next`
- [x] Every feature below has an IMPACT (H/M/L with the business reason) AND a grade (A/B/C)
- [x] No L-impact feature above grade A survives in v1
- [x] The suggested-features section was actually considered (each suggestion has an in/out decision)
- [x] fit(grades, budget) holds — every C in scope is justified as path 1, 2, or 3 above (written next to the feature)
- [x] If the product IS a C feature: it is FIRST in build order, and its sibling C features are on the cut list
- [x] The cut list is written (what I am NOT building in v1)
- [x] GO / KILL decision is written below
- [x] No FILL placeholders remain in this file

## Time budget

2 weekends (~16-20 giờ làm việc thực tế).

## Features in v1 (each with impact AND grade)

- **F1: Nhập món siêu tốc (< 5 giây / món)** — **Impact H** (Core job: Phá vỡ rào cản lười nhập liệu, phím bấm to, presets ngày 1/3/7/14 ngày, chọn nhanh vị trí/màu sắc) — **Grade A** (Client form & smart state UX).
- **F2: Trực quan hóa hạn dùng & Cảnh báo "Nấu gấp hôm nay"** — **Impact H** (Core job: Trị dứt điểm nỗi đau quên thực phẩm dẫn đến hỏng, phân màu Đỏ ≤0d / Cam ≤2d / Xanh tươi) — **Grade A** (Computed state & visual badge list).
- **F3: Quản lý Vị trí & Dấu hiệu nhận diện bao bì tủ chung** — **Impact H** (Core job: Tìm nhanh đồ phòng mình trong tủ chung nhiều phòng: Ngăn đông/mát + Tag Hộp xanh/Túi zip/Túi đỏ) — **Grade A** (Tagging & filter system).
- **F4: Đánh dấu đã dùng / Đã nấu (1 chạm)** — **Impact M** (Retention: Giữ dữ liệu tủ luôn cập nhật, chuyển sang lịch sử / mua lại) — **Grade A** (Status toggle / Quick action).
- **F5: Đồng bộ kho 2 người cùng phòng (Room Code Sync)** — **Impact H** (Core promise: 2 người cùng thấy và cập nhật 1 kho tủ lạnh) — **Grade C re-architected down to Grade B** (Path 2: Sử dụng Supabase / Firebase backend-as-a-service hoặc lightweight REST SWR sync thay vì tự code websocket server phức tạp).
- **F6: Chụp ảnh thực phẩm & bao bì (Camera Photo Capture)** — **Impact H** (Core job: Nhìn ảnh nhận diện ngay bao bì/hộp trong tủ chung mà không cần bới tìm) — **Grade A** (HTML5 Camera + Client image compression < 100KB + Storage).
- **F7: Nhập liệu bằng giọng nói (Voice-to-Food Parsing)** — **Impact H** (Core job: Nói 1 câu khi tay đang bận xách đồ chợ, tự động trích xuất món/vị trí/tag) — **Grade B** (Web Speech API tiếng Việt + Gemini JSON extractor).
- **F8: Gợi ý món ăn thông minh (Smart AI Recipe Suggester)** — **Impact H** (Core job: Phân tích đồ cận date trong tủ để gợi ý 2-3 món nấu nhanh cho phòng trọ) — **Grade B** (Gemini 2.5 Flash API prompt tối ưu món Việt).
- **F9: Thông báo đẩy tự động lên màn hình (Push Notifications)** — **Impact M** (Retention & Đồng bộ: Cảnh báo đồ sắp hỏng lúc 16:30 và báo khi bạn cùng phòng mua/dùng đồ) — **Grade B** (Web Push API + Service Worker).
- **F10: Danh sách "Cần mua thêm" (Quick Shopping List)** — **Impact M** (Retention: Tự động chuyển món đã hết vào danh sách đi chợ, tích chọn khi mua xong) — **Grade A** (Sub-list / Local state sync).

## Suggested features (impact-first — proposed, not decided)

- **S1: Danh sách "Cần mua thêm" (Shopping List)** — **Impact M** — **Grade A** — **IN** (Bổ sung làm F10).
- **S2: Gợi ý món ăn thông minh từ đồ sắp hỏng (AI Recipe Suggester)** — **Impact H** — **Grade B** — **IN** (Người dùng yêu cầu bổ sung làm F8).
- **S3: Nhập liệu giọng nói & Chụp ảnh thực phẩm** — **Impact H** — **Grade A/B** — **IN** (Người dùng yêu cầu bổ sung làm F6, F7).
- **S4: Thông báo đẩy PWA (Push Notifications)** — **Impact M** — **Grade B** — **IN** (Người dùng yêu cầu bổ sung làm F9).

## Cut list (NOT in v1 — deferred, not deleted)

- Quét mã vạch Barcode sản phẩm đóng gói (ưu tiên chợ dân sinh).
- Quản lý ngân sách / Chia tiền đi chợ nâng cao (để người dùng dùng app chuyên dụng).
- Đăng nhập email/mật khẩu phức tạp (v1 dùng Room ID 6 ký tự + Nickname).

## Decision

**GO** — Phạm vi v1 hoàn chỉnh gồm 6 tính năng Grade A và 4 tính năng Grade B (tận dụng Web Speech API, Gemini Flash và Supabase BaaS). Giải quyết triệt để toàn bộ 5 pain points và đáp ứng chính xác yêu cầu mở rộng của người dùng.



---

# Stage 02 — Scope revision v7: phát hành lên CH Play (2026-09-05)

Authored in work mode. Operator signed off on the release dossier before this revision was
written; the scope pause of the work-mode protocol is therefore satisfied by that approval.

## Gate — check ALL before `/flow next`
- [x] Every feature below has an IMPACT (H/M/L with the business reason) AND a grade (A/B/C)
- [x] No L-impact feature above grade A survives in v7
- [x] The suggested-features section was actually considered (each suggestion has an in/out decision)
- [x] fit(grades, budget) holds — every C in scope is justified as path 1, 2, or 3
- [x] If the product IS a C feature: it is FIRST in build order, and its sibling C features are on the cut list
- [x] The cut list is written (what I am NOT building in v7)
- [x] GO / KILL decision is written below
- [x] No FILL placeholders remain in this file

## Time budget

2–3 tháng làm nghiêm túc (operator xác nhận). Đường găng KHÔNG phải là code: quy định
12 tester opt-in liên tục 14 ngày của Google Play cho tài khoản cá nhân mở sau 13.11.2023.

## Sự thay đổi bối cảnh khiến v7 tồn tại

v1–v6 tối ưu cho đúng 2 người dùng đã biết nhau, nhận link qua Zalo. v7 đổi đối tượng sang
người lạ tự tìm thấy app trên CH Play. Người lạ không có ai giải thích "mã phòng 6 số" là gì,
không tha thứ cho LCP 4,9 giây, và sẽ để lại 1 sao khi quên passcode mà không có đường lấy lại.
Phần lớn khối lượng v7 vì thế KHÔNG phải là tính năng mới — mà là nghĩa vụ pháp lý, nghĩa vụ
vận hành, và chất lượng đủ cho người không có ngữ cảnh.

## Features in v7 (each with impact AND grade)

- **F11: Xóa phòng & xóa tài khoản có cascade thật** — **Impact H** (Điều kiện cần: Google Play bắt buộc app cho tạo tài khoản phải có đường xóa trong app VÀ một URL web độc lập; Luật 91/2025/QH15 hiệu lực 01.01.2026 biến quyền xóa thành nghĩa vụ pháp lý. Không có = không được duyệt) — **Grade A** (CRUD + transaction cascade + dọn Storage).
- **F12: Trang pháp lý công khai (Quyền riêng tư, Điều khoản, Hỗ trợ)** — **Impact H** (Điều kiện cần để duyệt; đồng thời là nguồn duy nhất sinh ra biểu mẫu Data safety) — **Grade A** (trang tĩnh + định tuyến).
- **F13: Màn hình đồng ý xử lý dữ liệu theo PDPL** — **Impact H** (Nghĩa vụ pháp lý: app gửi nội dung giọng nói và danh sách thực phẩm sang Google Gemini — đây là chuyển dữ liệu xuyên biên giới, phải có đồng ý riêng cho từng mục đích, không chấp nhận ô tích sẵn) — **Grade A** (UI + lưu trạng thái phía server).
- **F14: Khôi phục truy cập phòng khi quên passcode hoặc mất thiết bị** — **Impact H** (Lỗ hổng sản phẩm nguy hiểm nhất còn lại: hiện tại quên passcode 4 số = mất toàn bộ dữ liệu vĩnh viễn. Với người lạ, đây chính là nội dung review 1 sao đầu tiên) — **Grade B** (tận dụng hạ tầng Google Identity đã có từ C-022, path 2).
- **F15: Onboarding, trạng thái rỗng và thông báo lỗi cho người chưa biết gì** — **Impact H** (Acquisition: màn hình đầu hiện yêu cầu "mã phòng 6 số", một khái niệm chỉ tồn tại trong đầu người đã hiểu sản phẩm) — **Grade A** (UI theo DESIGN.md).
- **F16: Hiệu năng — LCP từ 4,9s xuống dưới 2,5s** — **Impact H** (Retention: người dùng bỏ app ở giây thứ 3. Nguyên nhân gốc đã được đo và ghi trong DEBT.md: `GET /api/foods` mất 0,8–1,3s/lần, độc lập với tầng realtime) — **Grade B** (gộp bootstrap + đối chiếu region, path 2 — không tự dựng CDN/cache layer).
- **F17: Trần chi phí và chống lạm dụng endpoint AI** — **Impact M** (Vận hành: với 2 người, một API key dùng chung là hợp lý; với người lạ, `/api/ai/*` là hai vòi tiền mở sẵn) — **Grade A** (hạn mức + cache + hạ cấp về heuristic đã có sẵn).
- **F18: Quan trắc lỗi, uptime và cảnh báo chi phí** — **Impact M** (Vận hành: hiện tại nếu app hỏng lúc 3 giờ sáng, bạn biết khi có người nhắn tin — mà người lạ thì không nhắn, họ gỡ cài) — **Grade A** (SDK bên thứ ba, không tự dựng).
- **F19: Đóng gói TWA và hồ sơ Play Console** — **Impact H** (Chính là kênh phân phối — không có nó thì toàn bộ v7 vô nghĩa) — **Grade B** (Bubblewrap + Digital Asset Links + ký số; có bẫy targetSdk đã biết trước).
- **F20: Rà soát an ninh chống liệt kê và dò passcode** — **Impact M** (Bảo vệ người dùng dưới giả định có kẻ tấn công có động cơ: không gian PIN 10^6 + passcode 10^4, kẻ tấn công liệt kê PIN tồn tại trước rồi mới dò passcode) — **Grade B** (khóa theo phòng + thời gian phản hồi hằng số).

## Suggested features (impact-first — proposed, not decided)

- **S5: Widget màn hình chính Android hiển thị món sắp hết hạn** — **Impact M** — **Grade C** — **OUT** (TWA không truy cập được widget API; sẽ kéo theo Capacitor. Ứng viên cho v8 nếu quyết định 8 bị đảo).
- **S6: Chia sẻ mã phòng qua Zalo với nội dung soạn sẵn** — **Impact H** (đây là bề mặt mời — chỉ số bắc cầu quan trọng nhất của sản phẩm là tỉ lệ phòng có ≥2 thành viên; app một mình dùng thì vô nghĩa) — **Grade A** — **IN** (gộp vào F15).
- **S7: Gói trả phí / mở khóa số phòng không giới hạn** — **Impact M** — **Grade B** — **OUT** (chưa có bằng chứng giữ chân; tính tiền trước khi biết người lạ có ở lại hay không là tối ưu sai thứ tự).

## Cut list (NOT in v7 — deferred, not deleted)

- Nộp App Store / bọc Capacitor cho iOS — xem điều kiện đảo ngược ở ADR quyết định 8.
- Widget màn hình chính, quét mã vạch tốc độ cao, chạy nền thật — đều đòi lớp native.
- Monetization và gói trả phí.
- Đa ngôn ngữ / i18n.
- Chia tiền đi chợ, OCR hóa đơn, barcode — giữ nguyên trạng thái cut từ v1.

## Decision

**GO** — 10 tính năng: 6 Grade A, 4 Grade B, không có Grade C nào sống sót trong v7.
Không có tính năng L-impact nào trong phạm vi. Đường găng là quy định của Google chứ không
phải khối lượng code, nên chiến thuật lịch trình là đưa AAB tối thiểu lên kênh closed sớm nhất
có thể (tuần 3) để đồng hồ 14 ngày chạy SONG SONG với F14–F16 và F20 — rút ngắn khoảng 3 tuần
so với cách làm tuần tự.
