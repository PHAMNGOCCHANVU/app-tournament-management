# 🏆 Hệ Thống Quản Lý Giải Đấu Thể Thao (Sport Tournament Management System)

Ứng dụng Web App quản lý giải đấu thể thao chuyên nghiệp (tạo giải đấu, đăng ký đội, thanh toán VietQR tự động, tự động sinh lịch thi đấu vòng tròn / loại trực tiếp, cập nhật tỉ số đa Set theo môn, tính bảng xếp hạng đa chiều, cây nhánh đấu và phát sóng Livescore theo thời gian thực) được xây dựng theo kiến trúc **Modular Monolith** trên nền tảng **Google Apps Script** và cơ sở dữ liệu **Google Sheets** (Zero-Config).

---

## 📑 Mục Lục
1. [Yêu Cầu Tiền Đề (Prerequisites)](#1-yêu-cầu-tiền-đề-prerequisites)
2. [Cài Đặt & Đăng Nhập Clasp](#2-cài-đặt--đăng-nhập-clasp)
3. [Các Lệnh Thao Tác Nhanh (NPM Scripts)](#3-các-lệnh-thao-tác-nhanh-npm-scripts)
4. [Cấu Trúc Thư Mục & Kiến Trúc Modular Monolith](#4-cấu-trúc-thư-mục--kiến-trúc-modular-monolith)
5. [Cơ Chế Livescore Smart Polling Thuần Google Sheets](#5-cơ-chế-livescore-smart-polling-thuần-google-sheets)
6. [Hướng Dẫn Triển Khai Web App (Production Deployment)](#6-hướng-dẫn-triển-khai-web-app-production-deployment)
7. [Chạy Kiểm Thử Tự Động (Automated Testing)](#7-chạy-kiểm-thử-tự-động-automated-testing)
8. [Lưu Ý Kỹ Thuật & Best Practices](#8-lưu-ý-kỹ-thuật--best-practices)

---

## 1. Yêu Cầu Tiền Đề (Prerequisites)

- **Node.js** (Phiên bản v18.0.0 trở lên): Download tại [nodejs.org](https://nodejs.org/).
- **npm** (Đi kèm với Node.js).
- **Tài khoản Google**: Quản lý Google Sheets và Google Apps Script.
- **Bật Google Apps Script API** *(Bắt buộc)*:
  1. Mở trang Cài đặt Apps Script: [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
  2. Chuyển tùy chọn **Google Apps Script API** sang trạng thái **ON** (Bật).

---

## 2. Cài Đặt & Đăng Nhập Clasp

1. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

2. **Đăng nhập tài khoản Google:**
   ```bash
   npm run login
   # Hoặc: npx clasp login
   ```
   *Trình duyệt sẽ mở ra để bạn cấp quyền cho công cụ Clasp CLI.*

3. **Kiểm tra liên kết dự án (`.clasp.json`):**
   ```json
   {
     "scriptId": "YOUR_APPS_SCRIPT_PROJECT_ID",
     "rootDir": "",
     "scriptExtensions": [".js", ".gs"],
     "htmlExtensions": [".html"],
     "jsonExtensions": [".json"]
   }
   ```

---

## 3. Các Lệnh Thao Tác Nhanh (NPM Scripts)

| Câu lệnh npm | Câu lệnh clasp tương đương | Mô tả chức năng |
|---|---|---|
| `npm run push` | `npx clasp push` | **Đẩy toàn bộ mã nguồn** từ máy tính lên Google Apps Script Editor |
| `npm run pull` | `npx clasp pull` | **Kéo mã nguồn mới nhất** từ Google Apps Script về máy tính |
| `npm run open` | `npx clasp open` | **Mở trình duyệt** vào giao diện chỉnh sửa Apps Script Editor |
| `npm run deploy` | `npx clasp deploy` | Đóng gói và tạo bản phát hành Deployment mới |
| `npm test` | `npx jest` | **Chạy toàn bộ 29 bài kiểm thử tự động** (100% Offline qua mock) |

---

## 4. Cấu Trúc Thư Mục & Kiến Trúc Modular Monolith

Hệ thống được tổ chức theo kiến trúc **Modular Monolith** phân tách rõ ràng thành các tầng (Layers) độc lập, sử dụng Google Sheets làm nguồn dữ liệu duy nhất (**Single Source of Truth**):

```text
d:\appscript\
├── .clasp.json                  # Cấu hình liên kết Google Apps Script Project ID
├── .claspignore                 # Danh sách các file bỏ qua khi push lên Apps Script
├── .env                         # Khai báo biến môi trường (Zero-Config)
├── .gitignore                   # Loại trừ node_modules, plan khỏi git
├── appsscript.json              # File manifest của Google Apps Script
├── package.json                 # Cấu hình dependencies (Jest, gas-local) và npm scripts
├── preview_vietqr.html          # File xem trước độc lập Modal VietQR trên trình duyệt
│
├── 📁 Infrastructure & Routing Layer
│   ├── Config.js                # Quản lý SCHEMAS, Enums trạng thái, Seed Data môn thể thao
│   ├── DB_Helper.js             # BaseRepository ORM, Batch Insert/Update, Cache Store, UUID
│   ├── EventBus.js              # Hệ thống Pub/Sub đồng bộ (Synchronous In-Memory Event Bus)
│   ├── ApiRouter.js             # Gateway tập trung Bundle APIs 1-roundtrip và đăng ký Event
│   └── Code.js                  # Entry point web app (doGet, doPost tiếp nhận Webhook)
│
├── 📁 Core Business Modules (7 Modules)
│   ├── Mod_Tournament.js        # Module 1: Quản lý vòng đời giải đấu, cấu hình môn & setup DB
│   ├── Mod_Registration.js      # Module 2: Đăng ký đội, kiểm tra luật giới tính/thủ môn, Webhook Sepay
│   ├── Mod_BracketEngine.js     # Module 3: Thuật toán sinh lịch Vòng tròn (Circle) & Cây Knockout
│   ├── Mod_MatchControl.js      # Module 4: Điều hành trận đấu & Match State Machine (LIVE/Chờ Ký/Xong)
│   ├── Mod_ScoreEngine.js       # Module 5: Bộ tính điểm Strategy Pattern theo từng môn thể thao
│   ├── Mod_Progression.js       # Module 6: Tự động tính BXH đa chiều (Tiebreaker) & Đẩy nhánh Cây
│   └── Mod_Archiver.js          # Module 7: Khóa giải đấu (Read-Only) & Báo cáo tổng kết giải
│
├── 📁 Sport Scoring Strategies (Strategy Pattern)
│   ├── Engine_Football.js       # Chiến lược tính điểm Bóng đá (bàn thắng, penalty luân lưu)
│   ├── Engine_Pickleball.js     # Chiến lược tính điểm Pickleball (3 set thắng 2, mốc 11/15 điểm)
│   └── Engine_Badminton.js      # Chiến lược tính điểm Cầu lông & Bóng bàn (tính theo Set)
│
├── 📁 Cross-Cutting Services
│   ├── Auth.js                  # Phân quyền 2 cấp (System-level & Tournament-level RBAC)
│   └── EmailService.js          # Tự động gửi email thông báo xác nhận và lịch thi đấu (GmailApp)
│
├── 📁 Client-side SPA Views & UI (.html)
│   ├── Index.html               # Khung HTML chính của Single Page App (Layout, Navbar, Drawer)
│   ├── Styles.html              # CSS Tokens, Dark Mode, Glassmorphism, Print Layout, Animations
│   ├── Scripts.html             # Client Router, State Store, Smart Polling Livescore, Helpers
│   ├── Dashboard.html           # View Trang chủ: Danh sách giải đấu, bộ lọc trạng thái & tìm kiếm
│   ├── TournamentCreate.html    # View Tạo giải đấu mới & thiết lập cấu hình môn (Option 2)
│   ├── TournamentManage.html    # View Quản trị giải: Duyệt đội, Import CSV, Full Roster, Báo cáo, Archive
│   ├── TeamRegister.html        # View Đăng ký đội & tự động hiển thị Modal VietQR thanh toán
│   ├── Schedule.html            # View Lịch thi đấu trực tiếp (🔴 LIVE Badge, bộ lọc môn)
│   ├── MatchResult.html         # View Nhập kết quả trận đấu đa Set (Set 1, 2, 3) & Giao bóng Pickleball
│   ├── RankingView.html         # View Bảng xếp hạng đa chiều (Set W/L, Point W/L, Goal W/L)
│   ├── BracketView.html         # View Sơ đồ Cây nhánh đấu loại trực tiếp (Live Score update)
│   └── Profile.html             # View Trang cá nhân: Giải do bạn tổ chức & Quản lý rút lui đội
│
└── 📁 tests (Automated Test Suites)
    ├── v3_test_plan.test.js     # 22 test cases kiểm thử logic đăng ký môn, RBAC, Deadline, Set Scoring
    └── modular_architecture.test.js # 7 test cases kiểm thử EventBus, Strategy Score, State Machine, Webhook
```

---

## 5. Cơ Chế Livescore Smart Polling Thuần Google Sheets

Hệ thống hoạt động theo cơ chế **Zero-Config Smart Polling**:
- **Tần suất Polling:** Mỗi **6 giây**, trình duyệt tự động cập nhật snapshot tỷ số từ Google Sheets khi người dùng đang ở trang **Lịch thi đấu** (`Schedule`) hoặc **Cây nhánh đấu** (`Bracket`).
- **Tự động tạm dừng (Auto-Pause with Page Visibility API):** Khi người dùng chuyển sang tab khác hoặc thu nhỏ trình duyệt (`document.hidden = true`), hệ thống tự động ngừng gửi request, tiết kiệm 100% quota của Google Apps Script.
- **DOM Diffing & Live Pulse:** Chỉ kích hoạt animation nhấp nháy vàng (`.score-pulse`) trên những ô điểm số có thay đổi thực tế.

---

## 6. Hướng Dẫn Triển Khai Web App (Production Deployment)

### Bước 1: Chia sẻ quyền cho File Google Sheet cơ sở dữ liệu
1. Mở file Google Sheet của dự án trên Google Drive.
2. Bấm **Chia sẻ (Share)** ở góc trên bên phải.
3. Ở mục **Quyền truy cập chung**, chọn: **"Bất kỳ ai có liên kết" (Anyone with the link)** với vai trò **"Người chỉnh sửa" (Editor)**.

### Bước 2: Triển khai Web App
1. Chạy lệnh: `npm run push` rồi `npm run open`
2. Nhấp **Triển khai (Deploy)** ➔ **Triển khai mới (New deployment)**.
3. Chọn loại: **Ứng dụng web (Web app)**.
4. Cấu hình thông số:
   - **Thực thi dưới dạng (Execute as):** `User accessing the web app` *(Người dùng truy cập ứng dụng web)*.
   - **Ai có quyền truy cập (Who has access):** `Anyone with Google account` *(Bất kỳ ai có tài khoản Google)*.
5. Bấm **Triển khai (Deploy)** và sao chép **Web App URL**.

---

## 7. Chạy Kiểm Thử Tự Động (Automated Testing)

Dự án tích hợp sẵn bộ kiểm thử đơn vị và tích hợp chạy trên Jest + `gas-local` (không cần kết nối internet):

```bash
npm test
```

---

## 8. Lưu Ý Kỹ Thuật & Best Practices

1. **Hiệu năng cao với Single Round-Trip Bundle APIs:**
   Giao diện người dùng sử dụng các endpoint gộp (`apiGetTournamentManageBundle`, `apiGetSchedulePageBundle`, `apiGetRankingPageBundle`) giúp tải toàn bộ dữ liệu chỉ trong **1 lần round-trip duy nhất**, loại bỏ hiện tượng giật lag khi tải trang.

2. **In-Memory Cache & Batch Insert:**
   `DB_Helper.js` trang bị bộ nhớ đệm `CACHE_STORE` và phương thức `batchInsert()` sử dụng `setValues()` ghi hàng loạt thay vì lặp `appendRow()`, tăng tốc độ sinh lịch thi đấu lên gấp 10 lần.

3. **Cơ chế Event-Driven Loose Coupling:**
   `EventBus.js` tự động kích hoạt tính toán Bảng xếp hạng và đẩy nhánh đấu Knockout ngay khi trọng tài lưu kết quả trận đấu.