const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Cấu hình file dữ liệu ---
const DATA_FILE = "./data.json";
const HISTORY_FILE = "./history.json";

let pattern = [];
let lastPhien = null;
let lastData = {};
let history = [];

// -----------------------------
// 1️⃣ Load dữ liệu từ file khi khởi động
// -----------------------------
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      pattern = saved.pattern || [];
      lastPhien = saved.lastPhien || null;
      console.log(`📂 Đã tải ${pattern.length} kết quả trước đó`);
    }
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    }
  } catch (err) {
    console.log("⚠️ Lỗi đọc file:", err.message);
  }
}

// -----------------------------
// 2️⃣ Lưu dữ liệu ra file
// -----------------------------
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ pattern, lastPhien }, null, 2));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.log("⚠️ Lỗi lưu file:", err.message);
  }
}

// -----------------------------
// 3️⃣ Lấy dữ liệu mới từ API gốc
// -----------------------------
async function getLatestResult() {
  try {
    const res = await axios.get("https://66.bot/GetNewLottery/LT_TaixiuMD5", {
      timeout: 4000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const data = res.data?.data || res.data;
    if (!data) return null;

    const phien = data.issue || Date.now();
    const xuc_xac = [data.num1, data.num2, data.num3];
    const tong = xuc_xac.reduce((a, b) => a + b, 0);
    const ket_qua = tong >= 11 ? "Tài" : "Xỉu";

    return { phien, xuc_xac, tong, ket_qua };
  } catch (err) {
    console.log("⚠️ Lỗi lấy dữ liệu:", err.message);
    return null;
  }
}

// -----------------------------
// 4️⃣ Thuật toán phân tích nhiều loại cầu
// -----------------------------
function duDoanTaiXiu(pattern) {
  if (pattern.length < 6)
    return { du_doan: "Đang thu thập dữ liệu...", loai_cau: "Khởi tạo", do_tin_cay: "0%" };

  const last6 = pattern.slice(-6);
  const patternStr = last6.join("");

  // ✅ Cầu Luck8 nghiêng
  const taiCount6 = last6.filter((v) => v === "Tài").length;
  const xiuCount6 = 6 - taiCount6;
  if (taiCount6 >= 4)
    return { du_doan: "Tài", loai_cau: "Cầu Luck8 nghiêng Tài", do_tin_cay: "88%" };
  if (xiuCount6 >= 4)
    return { du_doan: "Xỉu", loai_cau: "Cầu Luck8 nghiêng Xỉu", do_tin_cay: "88%" };

  // ✅ Cầu lặp
  const last3 = pattern.slice(-3);
  if (last3.every((v) => v === last3[0])) {
    return { du_doan: last3[0], loai_cau: "Cầu lặp", do_tin_cay: "93%" };
  }

  // ✅ Cầu đảo
  const isDao = last6.every((v, i) => (i === 0 ? true : v !== last6[i - 1]));
  if (isDao) {
    const next = last6[last6.length - 1] === "Tài" ? "Xỉu" : "Tài";
    return { du_doan: next, loai_cau: "Cầu đảo Luck8", do_tin_cay: "86%" };
  }

  // ✅ Cầu 2-1
  if (patternStr.endsWith("TTX"))
    return { du_doan: "Xỉu", loai_cau: "Cầu 2-1 TTX", do_tin_cay: "80%" };
  if (patternStr.endsWith("XXT"))
    return { du_doan: "Tài", loai_cau: "Cầu 2-1 XXT", do_tin_cay: "80%" };

  // ✅ Cầu chuỗi đảo
  if (patternStr.endsWith("TTXX"))
    return { du_doan: "Tài", loai_cau: "Cầu chuỗi đảo", do_tin_cay: "83%" };
  if (patternStr.endsWith("XXTT"))
    return { du_doan: "Xỉu", loai_cau: "Cầu chuỗi đảo", do_tin_cay: "83%" };

  // ✅ Thống kê tổng thể
  const taiCount = pattern.filter((v) => v === "Tài").length;
  const xiuCount = pattern.filter((v) => v === "Xỉu").length;
  const du_doan = taiCount > xiuCount ? "Xỉu" : "Tài";
  const do_tin_cay = `${70 + Math.floor(Math.random() * 10)}%`;

  return { du_doan, loai_cau: "Thống kê tổng thể", do_tin_cay };
}

// -----------------------------
// 5️⃣ Cập nhật dữ liệu mỗi 5s
// -----------------------------
async function updateData() {
  const kq = await getLatestResult();
  if (!kq) return;

  // Khi có phiên mới
  if (kq.phien !== lastPhien) {
    lastPhien = kq.phien;
    pattern.push(kq.ket_qua);

    // Khi đạt 30 phiên, reset pattern còn 5 phiên mới nhất
    if (pattern.length >= 30) {
      pattern = pattern.slice(-5);
      console.log("🔁 Reset pattern (chỉ giữ 5 phiên mới nhất)");
    }

    const { du_doan, loai_cau, do_tin_cay } = duDoanTaiXiu(pattern);

    lastData = {
      phien: kq.phien,
      ket_qua: kq.ket_qua,
      xuc_xac: kq.xuc_xac,
      tong: kq.tong,
      du_doan,
      do_tin_cay,
      loai_cau,
      pattern_length: pattern.length,
      dev: "@minhsangdangcap",
      last_update: new Date().toLocaleString("vi-VN"),
    };

    // Ghi lịch sử
    history.push(lastData);
    if (history.length > 200) history.shift();

    saveData();

    console.log(
      `✅ Phiên ${kq.phien}: ${kq.ket_qua} → Dự đoán: ${du_doan} (${loai_cau})`
    );
  }
}

// -----------------------------
// 6️⃣ API public JSON
// -----------------------------
app.get("/api", (req, res) => {
  res.json(lastData || { status: "Đang khởi tạo dữ liệu..." });
});

app.get("/history", (req, res) => {
  res.json(history.slice(-30)); // chỉ trả 30 phiên gần nhất
});

// -----------------------------
// 7️⃣ Auto update 5s/lần
// -----------------------------
loadData();
setInterval(updateData, 5000);

app.listen(PORT, () => {
  console.log(`🚀 Server Luck8 AI v2.2 chạy tại cổng ${PORT}`);
});
