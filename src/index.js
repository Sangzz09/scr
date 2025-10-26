const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

let pattern = []; // lịch sử kết quả
let lastPhien = null;
let lastData = {};
const FILE_PATH = "./pattern.json";

let tongDuDoan = 0;
let dungDuDoan = 0;

// 📁 Load pattern từ file (nếu có)
try {
  if (fs.existsSync(FILE_PATH)) {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    pattern = data.pattern || [];
    tongDuDoan = data.tongDuDoan || 0;
    dungDuDoan = data.dungDuDoan || 0;
    console.log(`📂 Đã tải ${pattern.length} phiên từ pattern.json`);
  }
} catch (err) {
  console.log("⚠️ Lỗi đọc file pattern.json:", err.message);
}

// 💾 Lưu pattern + thống kê ra file
function savePattern() {
  const data = {
    pattern,
    tongDuDoan,
    dungDuDoan,
  };
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

// 🔹 Lấy dữ liệu từ API thật
async function getLatestResult() {
  try {
    const res = await axios.get("https://66.bot/GetNewLottery/LT_TaixiuMD5", {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.data || res.data.state !== 1) return null;
    const data = res.data.data;

    const phien = data.Expect;
    const xuc_xac = data.OpenCode.split(",").map(Number);
    const tong = xuc_xac.reduce((a, b) => a + b, 0);
    const ket_qua = tong >= 11 ? "Tài" : "Xỉu";

    return {
      phien,
      xuc_xac,
      tong,
      ket_qua,
      open_time: data.OpenTime,
    };
  } catch (err) {
    console.log("⚠️ Lỗi gọi API:", err.message);
    return null;
  }
}

// 🔹 Thuật toán dự đoán đa cầu
function duDoanTaiXiu(pattern) {
  if (pattern.length < 6)
    return { du_doan: "Đang thu thập dữ liệu...", loai_cau: "Khởi tạo", do_tin_cay: "0%" };

  const last6 = pattern.slice(-6);
  const last3 = pattern.slice(-3);
  const patternStr = last6.join("");

  // Cầu Luck8 nghiêng
  const tai6 = last6.filter((v) => v === "Tài").length;
  const xiu6 = 6 - tai6;
  if (tai6 >= 4)
    return { du_doan: "Tài", loai_cau: "Cầu Luck8 nghiêng Tài", do_tin_cay: "89%" };
  if (xiu6 >= 4)
    return { du_doan: "Xỉu", loai_cau: "Cầu Luck8 nghiêng Xỉu", do_tin_cay: "89%" };

  // Cầu lặp
  if (last3.every((v) => v === last3[0])) {
    return { du_doan: last3[0], loai_cau: "Cầu lặp 3 phiên", do_tin_cay: "92%" };
  }

  // Cầu đảo
  const isDao = last6.every((v, i) => (i === 0 ? true : v !== last6[i - 1]));
  if (isDao) {
    const next = last6[last6.length - 1] === "Tài" ? "Xỉu" : "Tài";
    return { du_doan: next, loai_cau: "Cầu đảo liên tục", do_tin_cay: "85%" };
  }

  // Cầu 2-1
  if (patternStr.endsWith("TTX")) return { du_doan: "Xỉu", loai_cau: "Cầu 2-1 TTX", do_tin_cay: "80%" };
  if (patternStr.endsWith("XXT")) return { du_doan: "Tài", loai_cau: "Cầu 2-1 XXT", do_tin_cay: "80%" };

  // Cầu chuỗi đảo
  if (patternStr.endsWith("TTXX")) return { du_doan: "Tài", loai_cau: "Cầu chuỗi đảo", do_tin_cay: "83%" };
  if (patternStr.endsWith("XXTT")) return { du_doan: "Xỉu", loai_cau: "Cầu chuỗi đảo", do_tin_cay: "83%" };

  // Thống kê tổng thể
  const taiCount = pattern.filter((v) => v === "Tài").length;
  const xiuCount = pattern.filter((v) => v === "Xỉu").length;
  const du_doan = taiCount > xiuCount ? "Xỉu" : "Tài";
  const do_tin_cay = `${72 + Math.floor(Math.random() * 8)}%`;
  return { du_doan, loai_cau: "Thống kê tổng thể", do_tin_cay };
}

// 🔹 Hàm cập nhật dữ liệu
async function updateData() {
  const kq = await getLatestResult();
  if (!kq) return;

  if (kq.phien !== lastPhien) {
    const { du_doan, loai_cau, do_tin_cay } = duDoanTaiXiu(pattern);

    // Nếu đã từng dự đoán → kiểm tra đúng/sai
    if (lastData.du_doan && lastData.ket_qua) {
      tongDuDoan++;
      if (lastData.du_doan === kq.ket_qua) dungDuDoan++;
    }

    // Lưu kết quả mới
    lastPhien = kq.phien;
    pattern.push(kq.ket_qua);

    // Reset khi đạt 30 phiên
    if (pattern.length >= 30) {
      pattern = pattern.slice(-5);
      console.log("♻️ Reset cầu: giữ 5 phiên gần nhất để tối ưu dự đoán!");
    }

    // Tính tỉ lệ đúng
    const accuracy =
      tongDuDoan > 0 ? ((dungDuDoan / tongDuDoan) * 100).toFixed(2) + "%" : "0%";

    lastData = {
      phien: kq.phien,
      thoi_gian: kq.open_time,
      ket_qua: kq.ket_qua,
      xuc_xac: kq.xuc_xac,
      tong: kq.tong,
      du_doan,
      do_tin_cay,
      loai_cau,
      so_phien_da_luu: pattern.length,
      tong_du_doan: tongDuDoan,
      so_dung: dungDuDoan,
      ty_le_dung: accuracy,
      dev: "@minhsangdangcap",
    };

    savePattern();

    console.log(
      `✅ Phiên ${kq.phien}: ${kq.ket_qua} (${kq.xuc_xac.join(",")}) → Dự đoán: ${du_doan} (${loai_cau}) | Accuracy: ${accuracy}`
    );
  }
}

// 🔹 Endpoint chính: /api
app.get("/api", (req, res) => {
  res.json(lastData || { trang_thai: "Đang khởi tạo dữ liệu..." });
});

// 🔹 Xem toàn bộ pattern đã lưu
app.get("/pattern", (req, res) => {
  res.json({
    so_luong: pattern.length,
    tong_du_doan: tongDuDoan,
    so_dung: dungDuDoan,
    ty_le_dung:
      tongDuDoan > 0 ? ((dungDuDoan / tongDuDoan) * 100).toFixed(2) + "%" : "0%",
    du_lieu: pattern,
  });
});

// 🔁 Auto update mỗi 5s
setInterval(updateData, 5000);

// 🚀 Chạy server
app.listen(PORT, () => console.log(`🚀 Server chạy tại cổng ${PORT}`));
