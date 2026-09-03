# ShareFridge — Quản Lý Tủ Lạnh Dùng Chung Phòng Trọ

Ứng dụng web Mobile-First / PWA giúp các bạn ở ghép quản lý kho thực phẩm dùng chung trong bối cảnh tủ lạnh sinh hoạt chung nhiều phòng trọ.

---

## 1. Bối cảnh sử dụng (Context)

- **Người dùng:** 2 người cùng phòng trọ dùng chung một kho dữ liệu thực phẩm & kế hoạch nấu ăn.
- **Môi trường:** Khu trọ sử dụng chung một tủ lạnh lớn với nhiều phòng khác; đồ ăn của phòng bị để lẫn lộn với đồ của các phòng khác trong cùng một không gian tủ lạnh chật chội.

## 2. Các nỗi đau thực tế (Core Pain Points)

1. **Dễ quên và bỏ sót thực phẩm:** Đồ ăn cất trong tủ lạnh thường bị đồ của phòng khác (hoặc đồ khác của phòng mình) đè lên, khuất tầm nhìn, dẫn đến việc quên lãng cho tới khi thực phẩm hỏng, bốc mùi, chảy nước phải vứt bỏ.
2. **Khó nhận diện đồ của phòng mình:** Khi cần lấy đồ nấu nướng, việc lục lọi cả tủ lạnh chung rất bất tiện, tốn thời gian và dễ gây nhầm lẫn với thực phẩm của phòng khác. Cần có cơ chế ghi nhớ vị trí và dấu hiệu nhận biết cụ thể (ngăn nào, đựng trong hộp gì, túi màu gì).
3. **Mất kết nối thông tin giữa 2 người cùng phòng:**
   - Một người đi chợ mua đồ về nhưng người kia không biết trong tủ đang có gì để nấu.
   - Một người đã lấy đồ ra ăn/nấu hết nhưng người kia không biết, dẫn đến việc đi chợ mua trùng hoặc lên thực đơn hụt nguyên liệu.
4. **Áp lực "Hôm nay ăn gì?":** Mỗi khi nấu ăn phải mở tủ bới tìm xem món nào sắp hỏng để ưu tiên nấu trước, không có cái nhìn tổng quan về hạn sử dụng của từng nguyên liệu.
5. **Rào cản nhập liệu:** Nếu quy trình thêm đồ ăn quá phức tạp, nhiều bước hoặc chậm chạp, người dùng sẽ lười cập nhật sau mỗi lần đi chợ về, khiến ứng dụng nhanh chóng bị bỏ xó.

## 3. Mục tiêu giải pháp mong muốn (High-Level Objectives)

- **Mobile-First / PWA:** Gọn nhẹ, mở nhanh trên điện thoại, hỗ trợ add-to-homescreen, tối ưu thao tác 1 tay.
- **Tối ưu luồng nhập dữ liệu cực nhanh (< 5 giây cho mỗi món):** Gợi ý món, chọn nhanh thời hạn (preset ngày/hạn dùng), chọn vị trí và dấu hiệu nhận diện trong vài lần chạm.
- **Theo dõi trực quan trạng thái hạn dùng của thực phẩm:** Phân loại rõ ràng (Cần nấu gấp hôm nay / Còn tươi / Quá hạn) với chỉ số trực quan.
- **Quản lý rõ ràng vị trí lưu trữ và đặc điểm nhận dạng:** Vị trí tủ (Ngăn đông, Ngăn mát tầng 1, Ngăn rau...) + Dấu hiệu bao bì (Hộp xanh lock&lock, Túi zip trắng, Túi nilon đỏ...).
- **Đồng bộ thời gian thực giữa 2 người cùng phòng:** Chia sẻ cùng 1 mã kho/tủ, cập nhật tức thì khi có thay đổi.

---

## 4. Quy trình phát triển (Buildflow)

Dự án áp dụng quy trình **buildflow** nghiêm ngặt:

```
Idea → Research → Scope → PRD → ADR → Contract → Cards → Build → Review → Deploy → Verify-live → Retro
└────────────── planning (files in flow/) ──────────────┘└────── shipping (files in cards/) ──────┘
```

### Lệnh thao tác

| Lệnh | Ý nghĩa |
|---|---|
| `bash .claude/skills/flow/runner/flow.sh status` | Xem trạng thái quy trình & gate kiểm tra |
| `bash .claude/skills/flow/runner/flow.sh next` | Kiểm tra gate hiện tại & mở khóa stage tiếp theo |
| `bash .claude/skills/flow/runner/flow.sh card` | Tạo build card tiếp theo (`cards/C-NNN.md`) |
| `bash .claude/skills/flow/runner/flow.sh check C-NNN` | Kiểm tra tính hợp lệ của card |
| `bash .claude/skills/flow/runner/flow.sh ready` | Xem card sẵn sàng thực thi & song song |
| `bash .claude/skills/flow/runner/flow.sh auto` | Preflight cho chế độ build tự động |
| `bash .claude/skills/flow/runner/flow.sh retro` | Đánh giá sau khi hoàn thành |

---

## 5. Cấu trúc thư mục

- `flow/`: Hồ sơ quy hoạch dự án từ ý tưởng đến hợp đồng API (`00-idea.md` → `05-contract.md`).
- `cards/`: Các build card thực thi theo từng slice chức năng (`C-001.md`, ...).
- `playbooks/`: Tài liệu kiến thức và kinh nghiệm thực tế của tech stack.
- `DESIGN.md`: Quy chuẩn thiết kế giao diện (Object-first, Visual tokens, Affordance ladder).
- `CLAUDE.md`: Quy tắc làm việc và kỷ luật lập trình.

