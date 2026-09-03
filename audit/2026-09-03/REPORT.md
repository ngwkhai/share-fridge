# Kiểm toán mức độ hoàn thành ShareFridge — 03/09/2026

## Kết luận

**17/17 build card ghi `done`, nhưng trạng thái này chưa phản ánh mức độ hoàn thành của hệ thống hiện tại.** Có phần triển khai thực sự (giao diện React, CRUD trong RAM, ký token, lời gọi Gemini REST), nhưng các chức năng cốt lõi chưa hoạt động xuyên suốt từ giao diện đến dữ liệu và giữa hai thiết bị.

Không thể kết luận động cơ người viết là “làm cho có”. Có thể chứng minh những biểu hiện kỹ thuật: chức năng giả lập được trình bày như thật, kiểm thử không đi qua mã cần kiểm chứng, bản vá cache che lỗi lưu trữ và xác nhận nghiệm thu vượt quá bằng chứng.

**Ưu tiên cao nhất:** khóa truy cập dữ liệu trái phép và ghi đè phòng; thay kho RAM bằng database thật; sửa contract frontend/backend; bỏ cơ chế phục hồi cache làm sống lại món đã xóa.

## Phạm vi và phương pháp

- Đọc đủ C-001 → C-017, PRD, ADR, contract, quy định buildflow, DESIGN và các file nguồn/test liên quan.
- `npm run build`: thành công, Vite 6.4.3, tạo bundle và service worker.
- `GEMINI_API_KEY= node --test --test-timeout=10000 tests/*.test.js`: **18 pass, 0 fail**, thời gian báo cáo 220.53625 ms. Cố ý bỏ API key để xác định suite có phân biệt Gemini thật với fallback không.
- Chạy API server cục bộ tạm thời bằng chính `api/index.js`; transpile và gọi **API client thật** trong `src/services/api.ts`.
- Tái hiện cache bằng callback `loadData` lấy trực tiếp từ AST của App.tsx, với bộ nhận state thay React renderer. Đây là kiểm thử logic ứng dụng, không phải kiểm thử trình duyệt.
- Kiểm tra CSS build, metadata ảnh bằng `file`, thực thi generated service worker với Workbox stub để xem đăng ký handler. Không kiểm thử delivery push trên thiết bị.
- **13 phép kiểm tra xác nhận lỗi**, kết quả tại [results.json](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/audit/2026-09-03/results.json), script tại [probes.mjs](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/audit/2026-09-03/probes.mjs).
- Chưa kiểm chứng môi trường production, Google OAuth thật, Gemini có key, Supabase cloud, Lighthouse hay điện thoại thật. Không suy diễn rằng dịch vụ bên ngoài đã được cấu hình hoặc chưa được cấu hình.
- Lần chạy test trong sandbox bị `listen EPERM`; chạy lại sau khi được cấp quyền đã pass. Đây là giới hạn môi trường, không tính là lỗi sản phẩm.
- Audit không sửa mã ứng dụng hoặc tự đổi trạng thái card; build có sinh lại `dist/`.

Script audit **pass khi tái hiện được lỗi hiện tại**. Sau khi sửa đúng, các assertion xác nhận lỗi phải được thay bằng test hồi quy có kỳ vọng hành vi đúng; không đưa script này thành gate “release xanh”.

## Đánh giá đủ 17 card

| Card | Phần có thật | Phần chưa hoàn tất / bằng chứng còn thiếu | Kết luận audit |
|---|---|---|---|
| C-001 — Scaffold, slice, spec | Build, health, tạo/lấy phòng và JSON spec có chạy | Chỉ có evidence localhost; spec hiện thiếu auth mới; route tạo phòng cũ ghi đè phòng có mật khẩu | Nền tảng local có thật; cần cập nhật và nghiệm thu lại |
| C-002 — Food / shopping backend | CRUD happy path có test | Không phân quyền; không validate dữ liệu; thiếu `deleted_id`; bỏ qua `move_to_fridge`; thao tác consume chưa idempotent | Cần mở lại |
| C-003 — Voice / recipe | Parser regex và Gemini REST hiện tồn tại | Ví dụ card không đạt với fallback; evidence cũ sai màu túi; offline không có parser client; chưa chứng minh Gemini thật | Một phần; cần kiểm chứng lại |
| C-004 — Web Push / 16:30 | Route lưu subscription trong Map và file push worker | Subscription giả; client sai URL; thiếu VAPID sender, scheduler và nối push handler vào worker đang chạy | Chức năng chính chưa hoàn thành |
| C-005 — UI mock | Bộ React component có thật | Card yêu cầu operator duyệt nhưng evidence chỉ build và tự mô tả; không có screenshot/xác nhận được lưu; không có HTML mock theo buildflow | UI có triển khai, thiếu nghiệm thu có thể kiểm tra |
| C-006 — Frontend / realtime / camera | Form, SpeechRecognition, Canvas, các modal có thật | Ba API gọi sai; RAM chưa nối DB; polling 4s; không upload storage; trừ kho bằng tên | Cần mở lại |
| C-007 — E2E / Lighthouse / live | Bộ HTTP integration test có chạy | Không chạy browser/client React; không report Lighthouse, thiết bị thật hoặc live URL trong evidence | Chưa đạt scope nghiệm thu |
| C-008 — Security | Hash passcode, ký/verify token, limiter Map có thật | Không enforce token trên dữ liệu; lộ hash/salt; ghi đè phòng; secret mặc định; limiter không chia sẻ giữa worker | Cần mở lại ngay |
| C-009 — Gemini thật | Có gọi REST với key và fallback | Suite pass khi không có key; thiếu kiểm tra schema/timeout; không bằng chứng request thành công tới Gemini | Tích hợp một phần, chưa nghiệm thu provider thật |
| C-010 — Supabase / realtime / storage | File SQL và WebSocket helper | Không code CRUD tới Supabase; policies cho phép mọi hàng; không bucket/upload; test chỉ đọc chuỗi SQL | Phần cloud persistence/storage chưa hoàn thành |
| C-011 — Vercel / PWA live | Có cấu hình deploy, handler, guide; build được | Test “healthz and auth” chỉ gọi health; không bằng chứng 8 route trên Vercel; không QR generator như scope | Có scaffold deployment, chưa chứng minh chạy đủ trên live |
| C-012 — Logo / PWA icons | Logo có dùng ở header/login | Hai file .png thực chất JPEG 1024×1024, không đúng sizes/type khai báo; hai nguồn manifest khác nhau | Tích hợp có lỗi asset |
| C-013 — UI nâng cấp | CSS glass/glow và component thay đổi có thật | Dùng class không sinh CSS; thiếu reduced motion; nút nhỏ/không nhãn; không evidence mobile review | Có diện mạo mới, chưa hoàn thiện chất lượng UI |
| C-014 — Dock trắng / passcode | Dock trắng, ẩn/hiện/copy passcode có thật | Copy báo thành công trước khi clipboard thành công; evidence chưa có test trình duyệt | Phần chính có thật, cần hoàn thiện lỗi và nghiệm thu |
| C-015 — SWR / silent recreate | Có session cache và recreate | Recreate trên mọi HTTP lỗi; tạo lại phòng không khôi phục DB; token invalid bị bỏ qua khi có cache; test không gọi client cache | Bản vá chưa giải quyết nguyên nhân |
| C-016 — Local-first / nickname | Cache và hiển thị nickname có thật | Bỏ qua danh sách rỗng hợp lệ; phục hồi món đã xóa, đổi ID/hạn; shopping/history không restore server | Bản vá gây sai dữ liệu |
| C-017 — Google Sign-In | Có nút và state profile | Chỉ setTimeout + hồ sơ hardcode; không OAuth; test tự kiểm tra object giả; avatar/email không lưu đúng luồng tạo/join phòng | Đăng nhập Google chưa triển khai thật |

Việc xóa ô nhập Gemini key ở C-014 **đã được ghi thành scope thay thế**; không tính sự vắng mặt của ô đó là lỗi độc lập của C-009.

## Các phát hiện và bằng chứng

### F01 — P0: Mật khẩu không bảo vệ các API dữ liệu (C-008, C-002, C-010)

[apiHandler.js:204](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/apiHandler.js:204) đọc dữ liệu theo `room_code` do request gửi. Các route POST/PATCH/DELETE không lấy hoặc xác thực Authorization, không đối chiếu phòng sở hữu đối tượng. Token chỉ được kiểm tra ở endpoint verify-token riêng.

**Tái hiện P01:** tạo phòng test có mật khẩu, thêm một món, đọc không token → HTTP 200. Dùng token ký hợp lệ của phòng khác để xóa món → HTTP 200, món thực sự bị xóa.

[apiHandler.js:199](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/apiHandler.js:199) trải toàn bộ room vào response công khai. **P02:** GET room trả cả `passcode_hash` và `salt` (script chỉ ghi tên trường, không ghi giá trị hash).

[schema.sql:66](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/supabase/schema.sql:66) dùng `using (true)` / `with check (true)` cho các policy. Các policy này không ràng buộc danh tính/phòng. Nếu migration được áp dụng và role có quyền truy cập bảng, việc bật RLS như vậy vẫn không tạo cách ly phòng.

**Sửa:** middleware xác thực cho toàn bộ food/shopping/AI/push; xác định phòng từ session/membership được server kiểm chứng; điều kiện room ownership trên mọi query theo ID; DTO response whitelist; thiết kế policy theo membership thật. Không dùng room code do client tự khai làm bằng chứng quyền truy cập.

**Gate:** no-token 401; token phòng A không đọc/sửa/xóa/subcribe vào B; không response nào chứa hash/salt. Chạy cả HTTP và DB policy tests.

### F02 — P0: Có thể đổi hoặc xóa mật khẩu phòng qua API tạo phòng (C-001, C-008, C-015)

[apiHandler.js:99](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/apiHandler.js:99) nhận code từ client rồi `db.rooms.set(code, room)` không kiểm tra tồn tại. [Route cũ:176](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/apiHandler.js:176) làm tương tự nhưng không có hash.

**Tái hiện P03:** gọi create-room hai lần cùng code với mật khẩu khác → lần hai 201, join bằng mật khẩu mới 200. Sau khi gọi route tạo phòng cũ cùng code, join với passcode bất kỳ cũng 200 vì điều kiện kiểm tra hash bị bỏ qua.

**Sửa:** unique constraint và xử lý trùng mã; tạo phòng đã tồn tại trả 409; loại bỏ hoặc chuyển route cũ qua cùng quy tắc bảo mật; không có quyền ghi đè qua “silent recreate”. Đổi passcode phải là thao tác xác thực riêng.

**Gate:** cả route mới/cũ không ghi đè phòng khi thiếu quyền; mã ngẫu nhiên trùng phải retry có giới hạn; thay đổi mật khẩu/session có chính sách thu hồi rõ ràng.

### F03 — P1: Backend production vẫn là RAM; Cloud Database chưa được nối (C-010, C-011, C-015, C-016)

[apiHandler.js:13](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/apiHandler.js:13) khởi tạo toàn bộ rooms, foods, shopping, subscribers bằng Map. [api/index.js:1](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/api/index.js:1) dùng chính handler đó. [supabaseClient.ts:8](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/supabaseClient.ts:8) chỉ đọc cấu hình và mở WebSocket, không thực hiện CRUD hoặc upload.

**P07:** đánh giá lại module như một worker mới: phòng và món tạo ở instance trước đều không tồn tại. Đây là chứng minh kho không chia sẻ giữa hai instance trong mã hiện tại; không phải phép đo cold start trên Vercel.

Cấu hình thêm `VITE_SUPABASE_URL` không thể tự biến Map thành PostgreSQL. Cache trên điện thoại A cũng không phải cơ sở dữ liệu dùng chung cho điện thoại B.

**Sửa:** repository/service dữ liệu thật cho toàn bộ endpoint; migration có version; transaction cho consume/shopping; kết nối database là điều kiện readiness. Map chỉ dành cho test/demo có lựa chọn rõ ràng; production không âm thầm fallback về RAM.

**Gate:** tạo trên instance A, đọc trên B, restart A/B vẫn còn dữ liệu; hai thiết bị nhìn cùng ID/trạng thái; shopping, lịch sử và subscription cũng tồn tại bền vững.

### F04 — P1: Frontend gọi sai ba API, rồi dùng error JSON như dữ liệu thành công (C-002, C-004, C-006, C-007)

| Hành động | Client thực tế | Backend / contract | Kết quả kiểm tra |
|---|---|---|---|
| Đã nấu | `POST /api/foods/:id/consume`, `auto_shopping` | `PATCH`, `add_to_shopping_list` | 404; món không thành CONSUMED |
| Tích đi chợ | `PATCH /api/shopping-items/:id` | `PATCH /api/shopping-items/:id/toggle` | 404; is_bought vẫn false |
| Bật thông báo | `POST /api/push/subscribe` | `POST /api/notifications/subscribe` | 404; không lưu subscription |

Bằng chứng: [api.ts:210](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:210), [api.ts:249](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:249), [api.ts:292](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:292); **P04–P06 gọi chính các hàm này**, không viết client thay thế.

Các hàm gọi `res.json()` mà không kiểm tra `res.ok`. Trên handler trả JSON 404, promise vẫn resolve. [App.tsx:279](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:279) đưa object lỗi vào history; [App.tsx:343](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:343) thay shopping item bằng object lỗi. Trên môi trường trả body khác JSON, chúng sẽ throw nhưng UI cũng chưa xử lý lỗi đầy đủ.

**Sửa:** thống nhất method/path/body theo một contract; client dùng chung request helper kiểm tra status và schema; UI chỉ commit state sau thành công, có thông báo lỗi/retry. Không biểu diễn 401/500 của list thành “items rỗng”.

**Gate:** test đi qua API client thật và browser cho các nút; xác nhận record và ID trong DB; mock lỗi 401/404/500 không tạo history giả hoặc mất tên món.

### F05 — P1: Cache làm sống lại đồ đã xóa và tự gia hạn món hết hạn (C-015, C-016)

[App.tsx:81](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:81) coi server trả rỗng là mất dữ liệu, dùng cache cũ rồi POST lại món. `shelf_life_days: f.days_remaining || 3` biến giá trị 0 thành 3; API thêm mới cấp ID, added_date và expiry_date mới.

**P08 chạy callback loadData thật:** món đã bị xóa trên server, cache cũ còn trạng thái EXPIRED và 0 ngày. Sau loadData: server có lại 1 món, ID khác, trạng thái FRESH, còn 3 ngày.

[App.tsx:143](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:143) cũng bỏ qua snapshot realtime/polling rỗng. Nếu bạn A xóa món cuối cùng, bạn B vẫn thấy món. Reload phía B có thể tạo lại nó. Shopping rỗng cũng bị bỏ qua; history không được cập nhật trong subscription. Chỉ cần response có một phần món là cache đầy đủ có thể bị ghi đè, nên guard không giải quyết mất dữ liệu từng phần.

[api.ts:167](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:167) recreate room cho **mọi** `!res.ok`, gồm 401/403/500, không riêng 404. [App.tsx:129](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:129) bỏ qua token invalid khi đã có cache.

**Sửa:** xác định DB là nguồn trạng thái chuẩn; phân biệt response rỗng hợp lệ với lỗi kết nối. Nếu thực sự hỗ trợ offline write, cần outbox thao tác, UUID ổn định, version và dấu xóa (tombstone), cơ chế xử lý xung đột và retry idempotent. Giữ nguyên expiry_date tuyệt đối; không replay snapshot bằng addFood.

**Gate:** xóa món cuối từ A thì B thành rỗng; B offline/reload/reconnect không hồi sinh món; expiry không tăng; request cũ không cập nhật vào phòng sau logout/chuyển phòng.

### F06 — P1: “Đã bật thông báo” khi chưa có dịch vụ gửi (C-004, C-006)

[NotificationModal.tsx:33](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/NotificationModal.tsx:33) gửi endpoint `local-browser-subscription` với keys `mock`, không gọi PushManager.subscribe. Sau response, UI tự báo nhắc 16:30.

Ngoài URL sai ở F04, server chỉ lưu Map. Không có cấu hình/gửi VAPID hoặc scheduler 16:30 trong nguồn được kiểm tra. `sw-push.js` chỉ được precache: **P13 xác nhận generated sw.js không đăng ký push handler**. Cache file JavaScript không có nghĩa thực thi handler trong file đó.

**Sửa:** subscription thật từ serviceWorker.ready/PushManager, public VAPID key, lưu bền vững theo thiết bị/phòng; ghép handler vào worker hoạt động; job 16:30 theo Asia/Ho_Chi_Minh; khóa chống gửi lặp, xóa subscription chết, trạng thái bật/tắt thật.

**Gate:** nhận thông báo khi đóng app/khóa màn hình trên thiết bị hỗ trợ; kiểm tra từ chối quyền, retry, hết subscription; nhận đúng phòng/giờ và không trùng. UI không được báo thành công chỉ vì quyền Notification được cấp.

### F07 — P1: Google Sign-In hoàn toàn giả lập; profile còn mất sau reload (C-017)

[GoogleAuthButton.tsx:18](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/GoogleAuthButton.tsx:18) dùng setTimeout 400ms rồi tạo name/email cố định, avatar mặc định và sub ngẫu nhiên. Không OAuth request, Google credential hoặc xác minh token server. Mọi người dùng nút này nhận cùng danh tính hardcode.

[google_auth.test.js:4](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/google_auth.test.js:4) tự tạo object giả và assert chính giá trị vừa gán. Nó không import component, parser JWT, session helper hoặc backend.

[App.tsx:244](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:244) chỉ lưu profile nếu có session cache; nút Google nằm trên màn hình chưa vào phòng. Sau đó create/join ghi session mới không có google_email/user_avatar ([api.ts:107](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:107)). Settings vẫn hiển thị icon User, không nhận avatar.

**Sửa:** provider thật, server verify credential, định danh user ổn định và liên kết membership; giữ profile trong session đúng luồng; trạng thái canceled/error; chỉ ghi “đã liên kết” khi có bằng chứng xác thực. Trong thời gian chưa làm xong, đề xuất ẩn tính năng hoặc ghi rõ là demo.

**Gate:** hai tài khoản Google cho hai user ID khác nhau; credential giả/hết hạn/sai audience bị từ chối; avatar/email còn sau reload và không truyền sang người/phòng khác.

### F08 — P1: Gợi ý món và trừ kho chưa bảo toàn tính đúng (C-003, C-006, C-009)

[geminiService.js:55](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/geminiService.js:55) gộp EXPIRED vào nguyên liệu ưu tiên và yêu cầu AI bắt buộc dùng nhóm đó. **P11:** fallback vẫn chọn thịt EXPIRED làm nguyên liệu. Đây là lỗi phân loại ngay trong ứng dụng; không cần suy diễn về an toàn ăn uống của từng thực phẩm.

Fallback trứng còn gán `foods.slice(0, 2)` làm ingredients_used không theo công thức. **P11:** tủ chỉ có sữa chua → đề xuất trứng chiên nhưng ghi đã sử dụng sữa chua.

[App.tsx:324](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/App.tsx:324) trừ kho bằng tìm chuỗi con tên món và chỉ lấy phần tử đầu. Tên gần giống, nhiều lô cùng tên hoặc tên Gemini viết khác có thể trừ sai/bỏ sót. Gọi từng request không có transaction; lỗi giữa chừng tạo trạng thái một phần. Hiện luồng còn bị chặn bởi F04.

[RecipeModal.tsx:88](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/RecipeModal.tsx:88) không hiển thị ingredients_missing, dù dữ liệu có. Người dùng có thể bấm nấu khi thiếu nguyên liệu mà UI không giải thích.

**Sửa:** loại EXPIRED khỏi tập nguyên liệu mặc định; validate từng recipe theo schema và tập food ID thực có; hiển thị nguyên liệu thiếu; dùng food_id/lô thay tên cho consume; transaction và idempotency key cho một lần nấu. Hỗ trợ lượng dùng là nâng cấp tiếp theo nếu vẫn muốn giữ lượng còn lại.

**Gate:** không tự chọn EXPIRED; recipe không có ingredient ID ngoài phòng/tập khả dụng; hai người nấu cùng lô không trừ lặp; rollback khi batch thất bại.

### F09 — P1/P2: Gemini có tích hợp nhưng test không chứng minh chạy thật; parser fallback chưa đạt ví dụ (C-003, C-009)

Có lời gọi REST thật tại [geminiService.js:11](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/server/geminiService.js:11). Vì vậy không gọi toàn bộ AI là mock. Nhưng nếu thiếu key hoặc provider lỗi, fallback được trả như một kết quả bình thường.

**Suite 18 test vẫn pass khi key rỗng.** [gemini_ai.test.js:31](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/gemini_ai.test.js:31) không yêu cầu source Gemini. P10 trả `source: heuristic`, name còn “nửa cân”, quantity rỗng với chính câu ví dụ C-003.

[Card C-003:35](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/cards/C-003.md:35) còn ghi output “Túi zip trắng” trong khi input và verify yêu cầu “túi zip xanh”. Đây là mâu thuẫn trong evidence lịch sử, không khẳng định phiên bản hiện tại vẫn sai màu: bản hiện tại đã có rule túi zip xanh.

Schema đầu ra chỉ kiểm tra tên/compartment có giá trị hoặc recipe là mảng; chưa kiểm enum, bounds, các trường con. Không timeout cho provider. Recipe response không công bố source như type client khai báo. Offline parser nằm ở server, nên khi thiết bị mất mạng không có fallback local đúng nghĩa.

**Sửa:** phân biệt source và tình trạng fallback; schema validation; timeout/cancel; bộ mẫu tiếng Việt kiểm đủ tên/lượng/vị trí/bao bì; smoke provider thật riêng, không tự đánh pass nếu thiếu key. Nếu offline voice nằm trong scope, chạy parser fallback trên client.

### F10 — P1/P2: Đồng bộ realtime không đạt kiến trúc hoặc độ trễ đã cam kết (C-006, C-010)

[supabaseClient.ts:32](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/supabaseClient.ts:32) polling mỗi 4000ms trong khi C-006/PRD cam kết dưới 500ms. Khi bật config, WebSocket nghe Supabase nhưng API vẫn ghi vào Map, nên hai đường không có cùng nguồn thay đổi.

Helper chỉ catch lỗi ném đồng bộ khi tạo socket; không có onerror/onclose, reconnect/backoff hoặc heartbeat. Chưa kiểm chứng giao thức trên dịch vụ live, nên audit không kết luận chi tiết tương thích server từ suy đoán.

**Sửa:** cùng nguồn PostgreSQL cho write và subscription; triển khai channel với xác thực/phân quyền, reconnect và refresh snapshot khi reconnect; đồng bộ cả history; hiển thị trạng thái kết nối thật. Header hiện ghi “Online” cố định tại [Header.tsx:54](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/Header.tsx:54).

**Gate:** phép đo hai browser context ghi timestamp send/receive; ít nhất ghi rõ phân vị, mạng và cỡ mẫu khi cam kết dưới 500ms; ngắt/reconnect không bỏ sót insert/update/delete.

### F11 — P2: Ảnh mới ở mức preview; icon PWA sai định dạng (C-006, C-010, C-012)

[CameraCapture.tsx:16](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/CameraCapture.tsx:16) resize theo chiều rộng 600, xuất data URL JPEG quality 0.65. Không đo byte, không vòng lặp giảm chất lượng/kích thước, không xử lý reader/image error. Vì vậy chưa đảm bảo dưới 100KB, nhất là ảnh cao hoặc nhiều chi tiết.

Không có upload/bucket food-photos; base64 đi theo FoodItem vào Map/localStorage. Các catch trống khi lưu cache có thể che lỗi quota ([api.ts:42](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/services/api.ts:42)).

Kết quả `file public/*`:
- `logo.jpg`: JPEG 1024×1024.
- `pwa-192x192.png`: **JPEG 1024×1024**.
- `pwa-512x512.png`: **JPEG 1024×1024**.

Hai icon không khớp MIME/kích thước manifest. Đây là lỗi asset đã xác nhận; khả năng cài PWA trên từng thiết bị cần đo riêng, không suy ra tất cả thiết bị đều không cài được.

**Sửa:** nén Blob có kiểm size và giới hạn cả hai chiều; xử lý ảnh lỗi/hủy/chọn lại; upload có phân quyền, URL/metadata vào DB và dọn orphan; xuất PNG thật đúng kích thước, một nguồn cấu hình manifest.

**Gate:** byte <100KB trước upload với ảnh kiểm thử đa dạng; thiết bị B mở được ảnh; lỗi quota/upload hiển thị rõ; xác nhận MIME, dimensions và cài PWA thực tế.

### F12 — P2: Card UI thiên về trang trí, còn thiếu chức năng và khả năng sử dụng (C-005, C-013, C-014, C-016)

**P13:** JSX thực dùng `w-13 h-13` cho FoodCard/nút thêm và `w-22 h-22` cho mic, nhưng CSS build không có các selector đó. `text-fresh-800` cũng không được sinh; config chỉ định nghĩa một số shade. Build thành công không đồng nghĩa các class tồn tại.

[FoodCard.tsx:101](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/FoodCard.tsx:101) nút xóa chỉ icon, không tên truy cập, không busy state hoặc rollback/undo. Các nút header 36px và đóng modal 32px dưới mục tiêu 44px của PRD. Modal không có role dialog, aria-modal, quản lý focus/Escape; index.html còn tắt zoom. Không có reduced-motion trong CSS dù DESIGN yêu cầu.

[SettingsModal.tsx:36](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/SettingsModal.tsx:36) không await clipboard trước khi báo “Đã chép”; lỗi clipboard vẫn có thể báo thành công. [QuickAddModal.tsx:34](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/src/components/QuickAddModal.tsx:34) chỉ chép trường truthy của voice draft: form cũ có thể giữ lượng/bao bì/ảnh không còn đúng với lần nhập mới.

**Sửa:** token tồn tại trong CSS build; kích thước vùng chạm đúng; pending/error/retry/undo cho hành động; modal có nhãn và focus; giảm motion theo cài đặt người dùng; chờ clipboard; reset draft theo phiên thêm món. Inline edit tên/lượng/vị trí/hạn là khoảng trống so với DESIGN và nên được đưa vào scope sửa rõ ràng.

**Gate:** browser ở 390/430px với tên dài, ảnh lớn, phóng chữ, bàn phím mobile; keyboard và screen reader; lỗi API không báo thành công; voice draft mới không kế thừa dữ liệu cũ ngoài chủ ý.

### F13 — P1: Bộ test và gate done tạo cảm giác hoàn thành vượt quá khả năng chứng minh (C-007, C-008, C-009, C-010, C-011, C-015, C-017)

- [e2e.test.js:3](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/e2e.test.js:3): chỉ HTTP server + fetch; không mở trình duyệt, không import API client nên không bắt F04.
- [google_auth.test.js:4](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/google_auth.test.js:4): object hardcode tự kiểm tra chính nó.
- [supabase_schema.test.js:9](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/supabase_schema.test.js:9): tìm chuỗi trong file SQL; không kết nối DB, không chạy migration/policy/realtime.
- [session_cache.test.js:6](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/session_cache.test.js:6): gọi create/verify/get, không import sessionCache/foodCache, không mô phỏng restart.
- [vercel_config.test.js:21](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/tests/vercel_config.test.js:21): tên nói healthz và auth nhưng request duy nhất là GET healthz.
- Auth test thử sai một lần, chưa xác nhận lần thứ sáu 429 như checklist C-008.
- **P12:** spec thiếu ba auth endpoint; DELETE shopping thiếu `deleted_id` theo planning contract. Backend toggle bỏ qua `move_to_fridge`.
- **P09:** thiếu name, room không tồn tại, compartment sai vẫn 201; yêu cầu 0 ngày thành 3 ngày.
- C-005 thiếu bằng chứng operator duyệt; C-006 thiếu ảnh/video/network đã đặt ra; C-007 thiếu Lighthouse/live URL. Các card UI chủ yếu dùng build log làm evidence.
- [RETRO.md](/Users/nguyendinhkhai/Documents/Projects/ShareFridge/RETRO.md) khẳng định không bỏ gate / hoàn tất triệt để vượt quá bằng chứng có thể kiểm tra hiện tại.

**Sửa:** phân lớp unit, API integration, client-contract, DB/RLS, browser E2E và live smoke; mỗi card liên kết trực tiếp acceptance case và artifact. Mock test chỉ chứng minh nhánh mock. Không đóng card vì số lượng test tăng hoặc build xanh.

## Backlog nâng cấp đề xuất theo thứ tự

Đây là backlog đề xuất, chưa tạo card triển khai hoặc thay đổi gate hiện tại. Mỗi card khi bắt đầu cần scope/allowed-files/contract amendment và verify riêng.

| Card đề xuất | Công việc và phạm vi chính | Điều kiện nghiệm thu |
|---|---|---|
| C-018 — Khóa truy cập và tạo phòng | server/apiHandler.js, security.js, types/client và contract/test cần thiết; enforce auth/ownership; chặn overwrite; bỏ secret mặc định ở production; whitelist response | Test F01/F02 đảo sang kỳ vọng an toàn; no-token/cross-room bị chặn trên mọi nhóm API |
| C-019 — PostgreSQL là nguồn dữ liệu chuẩn | Migration/version, repository backend, RLS/membership, readiness; không fallback RAM ở production | Hai instance + restart không mất room/food/shopping/history/push; test cách ly phòng trực tiếp trên DB |
| C-020 — Contract và các luồng CRUD hoàn chỉnh | Đồng bộ planning contract/OpenAPI/client; đúng ba route; validate input/output; idempotent consume/move-to-fridge | Browser add → consume → history → shopping → tick; xác nhận state DB; lỗi 4xx/5xx không làm hỏng UI |
| C-021 — Sync/cache đúng nghiệp vụ | Bỏ silent recreate/reseed; xử lý rỗng hợp lệ, expiry tuyệt đối, stable ID; realtime/reconnect/history; outbox nếu giữ offline writes | Hai máy, xóa món cuối, reconnect và request race; không hồi sinh, nhân đôi hoặc gia hạn món |
| C-022 — Google identity thật | Provider, xác minh server, liên kết user/membership, session/profile/avatars | Hai tài khoản thật; invalid credential; cancel; reload/logout đúng danh tính |
| C-023 — AI có validation và trừ kho đúng | Schema, provider timeout/source, loại EXPIRED, recipe gắn food ID, batch consume, tiếng Việt/offline fallback theo scope | Mẫu voice đủ trường; không nguyên liệu lạ/hết hạn; transaction/cạnh tranh; smoke provider thật có log đã bỏ bí mật |
| C-024 — Web Push hoàn chỉnh | Subscription/VAPID/worker/job theo giờ địa phương, lưu trữ/retry/dedup/unsubscribe | Push trên thiết bị khi khóa/đóng app; đúng phòng/giờ; không success giả |
| C-025 — Ảnh, PWA và khả năng sử dụng | Storage, byte limit, icon đúng chuẩn, manifest thống nhất, CSS tokens, modal/nút/draft/clipboard | Ảnh đa thiết bị; cài PWA; keyboard/mobile/zoom/reduced-motion; visual artifacts |
| C-026 — Nghiệm thu live có thể kiểm tra | Browser E2E thật, CI với gate lỗi, báo cáo Lighthouse, smoke URL deploy có version, checklist acceptance/artifact | Production URL + version/commit + timestamp + trace/screenshots + DB/network proof, toàn bộ acceptance map đạt |

C-026 gom nghiệm thu cuối; test hồi quy phải bổ sung **ngay trong C-018 → C-025**, không chờ cuối mới kiểm tra. Google/AI/push chỉ nghiệm thu sau khi foundation dữ liệu và quyền truy cập đã ổn định.

## Quy tắc đóng lại card

1. Mỗi câu “đã hoàn tất” phải chỉ đến testcase và kết quả quan sát tương ứng; phân biệt implemented, tested-local, verified-live.
2. Mỗi luồng có success và ít nhất những failure/race có ảnh hưởng thực tế: sai quyền, mất mạng, trùng request, đổi phòng, hai thiết bị.
3. Đối với chức năng tích hợp, ghi rõ môi trường và provider thực hay mock; thiếu key/hạ tầng thì đánh blocked/partial bằng mô tả, không làm fallback rồi gọi là provider pass.
4. Bằng chứng UI phải có trình duyệt/viewport/ảnh hoặc trace; bằng chứng push phải có thiết bị nhận; bằng chứng DB phải có dữ liệu sau restart/instance khác.
5. Đề xuất mở lại các card có lỗi chức năng và bổ sung evidence cho các card chỉ thiếu nghiệm thu. Không kết luận mọi thay đổi trước đây vô giá trị: scaffold, UI và nhiều helper có thể tiếp tục dùng sau khi sửa nền tảng.

## Chạy lại bằng chứng audit

Tại thư mục dự án:

```sh
npm run build
GEMINI_API_KEY= node --test --test-timeout=10000 tests/*.test.js
node audit/2026-09-03/probes.mjs
file public/logo.jpg public/pwa-192x192.png public/pwa-512x512.png
```

Script dùng localhost, Map riêng trong tiến trình và hồ sơ kiểm thử dùng một lần; không sửa dữ liệu trên server deploy. Nó ghi đè results.json của đợt audit bằng kết quả chạy mới.

