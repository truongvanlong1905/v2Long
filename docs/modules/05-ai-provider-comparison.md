# Báo cáo Nghiên cứu & Lựa chọn Nhà cung cấp AI Image (M05 — AI Design Studio)

**Hệ thống**: Toàn Trung Marketing–Sales Internal System  
**Ngày cập nhật**: 06/11/2026  
**Tác giả**: Senior Full-Stack & AI Integration Engineer  

---

## 1. Nghiên cứu & So sánh các Nhà cung cấp AI Image

Theo yêu cầu nghiệp vụ UC06 (Hỗ trợ Thiết kế & Phối cảnh AI màn hình LED), hệ thống cần một giải pháp AI có khả năng:
1. **Dựng nháp phối cảnh 3D màn hình LED lên ảnh hiện trạng**: Yêu cầu tính năng Inpainting / Image-to-Image có điều kiện (Reference-conditioned editing), cho phép chèn màn hình LED vào vị trí mong muốn mà **bảo toàn nguyên vẹn bối cảnh xung quanh (tường, trần, sàn, nội thất showroom/hội trường)**.
2. **Tạo Banner truyền thông màn hình LED**: Sinh ảnh theo tỷ lệ khung hình tùy chỉnh (16:9, 4:3, 1:1, siêu dài...), độ phân giải sắc nét và phong cách hiện đại.
3. **Đơn vị tính phí thực tế (Billing Units)**: Không ngộ nhận rằng mọi API AI đều tính theo text token. Các dịch vụ sinh ảnh/chỉnh sửa ảnh thương mại **tính phí theo lượt sinh ảnh (Per Generated Image)** hoặc theo megapixel/bước lấy mẫu (steps).

### Bảng so sánh chi tiết các nhà cung cấp (Cập nhật tháng 11/2026):

| Tiêu chí | 1. Google Imagen 3 (Vertex AI / Gemini API) | 2. OpenAI Images Edit (DALL-E 2/3) | 3. Stability AI (Stable Image Inpaint) | 4. Fal.ai / Replicate (FLUX.1-Fill dev) |
| :--- | :--- | :--- | :--- | :--- |
| **Model chính** | `imagen-3.0-generate-002` / `imagen-3.0-capability-001` | `dall-e-2` (edits) / `dall-e-3` (generate) | `stable-image/edit/inpaint` | `black-forest-labs/flux-fill-dev` |
| **Khả năng Inpainting & Giữ nguyên bối cảnh** | **Xuất sắc**: Hỗ trợ mask inpainting và reference conditioning; giữ nguyên cấu trúc phòng họp/showroom đến từng pixel ngoài vùng mask. | **Tốt**: DALL-E 2 edits nhận RGBA PNG có alpha mask; tuy nhiên độ tương phản và màu sắc rìa mask đôi khi bị làm mịn. | **Rất tốt**: Thuật toán inpainting chuyên sâu, bảo tồn chi tiết kiến trúc cao. | **Xuất sắc**: Khả năng blend bề mặt và đổ bóng ánh sáng LED lên sàn/tường rất tự nhiên. |
| **Chất lượng & Độ phân giải** | Lên tới 1536x1536 hoặc 16:9, độ chân thực vật liệu LED và phản quang kim loại/kính rất cao. | 1024x1024 (Edits) hoặc 1792x1024 (DALL-E 3). | Lên tới 1024x1024 hoặc 1536x1024. | Lên tới 2048x2048, chi tiết vật liệu cực kỳ sắc nét. |
| **Độ trễ trung bình** | ~4.0 – 6.5 giây / ảnh | ~6.0 – 11.0 giây / ảnh | ~3.5 – 5.0 giây / ảnh | ~7.0 – 14.0 giây (có cold start) |
| **Đơn vị tính cước (Billing Unit)** | **Per image generated** (Tính theo ảnh) | **Per image generated** | **Per credit** (~1 credit = $0.01) | **Per megapixel / GPU-second** |
| **Đơn giá niêm yết (Official Pricing)** | - Tiêu chuẩn (Standard): **$0.030 USD/ảnh** (~750 VNĐ)<br>- Chất lượng cao/Nhanh: **$0.040 USD/ảnh** (~1,000 VNĐ) | - DALL-E 2 Edit: **$0.020 USD/ảnh** (~500 VNĐ)<br>- DALL-E 3 Standard: **$0.040 USD/ảnh** (~1,000 VNĐ)<br>- DALL-E 3 HD: **$0.080 USD/ảnh** | - Inpaint: 3 credits = **$0.030 USD/ảnh** (~750 VNĐ) | ~$0.045 – $0.060 USD/ảnh |
| **Tích hợp & Bảo mật** | REST API chuẩn, xác thực qua API Key hoặc Google Cloud Service Account IAM; tuân thủ SLA doanh nghiệp. | REST multipart/form-data qua Bearer API Key. | REST multipart qua API Key. | REST / Webhook qua API Token. |

---

## 2. Đề xuất Lựa chọn Nhà cung cấp

### 2.1. Nhà cung cấp chính (PRIMARY): **Google Imagen 3 (Vertex AI / Gemini API)**
- **Lý do**:
  1. **Bảo tồn bối cảnh tốt nhất**: Chế độ Inpainting của Imagen 3 cho phép giữ nguyên 100% các khu vực không khoanh chọn (tủ trưng bày, trần thạch cao, sàn gỗ của showroom Toàn Trung), chỉ thay thế vùng màn hình LED và tính toán tán xạ ánh sáng tương ứng.
  2. **Chi phí hợp lý và minh bạch**: $0.030 USD (~750 VNĐ) cho mỗi bản nháp phối cảnh 3D. Với 100 bản nháp/tháng của phòng thiết kế, chi phí chỉ khoảng $3.00 USD (~75,000 VNĐ), hoàn toàn nằm trong ngân sách vận hành.
  3. **Độ ổn định và tích hợp hệ thống Google**: Tương thích hoàn hảo với hạ tầng Google Cloud và SDK sẵn có.

### 2.2. Nhà cung cấp dự phòng (FALLBACK): **OpenAI Images Edit (DALL-E)**
- **Lý do**: Cung cấp endpoint dự phòng tin cậy khi Google Cloud Vertex AI gặp sự cố gián đoạn kết nối hoặc bảo trì vùng. Đơn giá $0.020 – $0.040 USD/ảnh.

---

## 3. Chiến lược Kiểm soát Chi phí & Tối ưu Trải nghiệm người dùng

1. **Phân cấp chất lượng nháp (Quality Selector)**:
   - *Tiết kiệm (Draft)*: Dùng cấu hình chuẩn ($0.030 USD/lượt), rút ngắn thời gian phản hồi cho các vòng lặp ý tưởng ban đầu.
   - *Chất lượng cao (High Quality)*: Dùng cho bản nháp chốt để trình bày với khách hàng ($0.040 USD/lượt).
2. **Kéo thả 4 góc tọa độ hoàn toàn ở tầng Client (Local Canvas)**:
   - Thao tác kéo 4 điểm neo LED và phóng to/thu nhỏ trên canvas được tính toán cục bộ bằng ma trận biến đổi (Homography/Matrix3D) với tần số 60fps qua `requestAnimationFrame`.
   - **Tuyệt đối không gọi AI khi người dùng đang kéo thả điểm neo hoặc gõ phím**. Chỉ khi nhấn nút **"Gửi yêu cầu"** thì payload hoàn chỉnh mới được gửi lên server.
3. **Chống trùng lặp yêu cầu (Idempotency Protection)**:
   - Mỗi lần gửi yêu cầu đi kèm một `idempotencyKey` duy nhất dạng `design-req-{id}-v{ver}-{timestamp}`. Nếu mạng bị gián đoạn hoặc người dùng nhấn kép, hệ thống không tạo thêm lượt gọi AI trùng lặp.
4. **Bảo mật dữ liệu cá nhân (Zero PII to AI)**:
   - Module tự động quét và chặn ngay lập tức nếu Designer vô tình nhập số điện thoại (SĐT), email, tên khách hàng vào prompt mô tả.
5. **Ghi vết chi phí minh bạch (`ai_usage_logs`)**:
   - Mọi lượt gọi AI (kể cả thành công, lỗi hay timeout) đều được ghi nhận chi tiết: Provider, Model, thời gian chạy (`durationMs`), số lượng ảnh/token, chi phí thực tế quy đổi sang micros và đơn vị tiền tệ USD/VND.
   - Nếu không cấu hình API Key, hệ thống hiển thị rõ ràng trạng thái `Thiết kế minh họa · Chưa kết nối AI (Chưa cấu hình API Key)` và chuyển sang chế độ Sandbox an toàn mà không bịa đặt số liệu thành công.

