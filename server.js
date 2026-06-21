const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
// Melayani file tampilan dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE SIMULASI (IN-MEMORY) UNTUK INSTANT HOSTING ---
// Data otomatis tersimpan selama server menyala. Sangat cocok untuk langsung testing setelah dihosting.
let database = {
    users: [
        { id: "ADM01", username: "admin", password: "password123", role: "ADMIN", name: "Budi Pemilik" },
        { id: "SLS01", username: "sales1", password: "salespassword", role: "SALES", name: "Andi Lapangan" },
        { id: "SLS02", username: "sales2", password: "salespassword", role: "SALES", name: "Citra Lapangan" }
    ],
    warung: [
        { id: "WRG01", name: "Warkop Berkah Grogol", owner: "Pak Haji", latitude: -6.2088, longitude: 106.8456, qrToken: "QR-WARKOP-BERKAH-99" },
        { id: "WRG02", name: "Toko Kelontong Intan", owner: "Ibu Intan", latitude: -6.2140, longitude: 106.8500, qrToken: "QR-TOKO-INTAN-88" }
    ],
    visitLogs: [
        { id: "LOG01", userId: "SLS01", userName: "Andi Lapangan", warungId: "WRG01", warungName: "Warkop Berkah Grogol", timestamp: new Date(Date.now() - 3600000).toISOString(), distance: 12.4, status: "SUCCESS" }
    ]
};

// --- RUMUS HAVERSINE UNTUK MENGHITUNG JARAK NYATA DUA KOORDINAT BUMI ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius bumi dalam satuan METER
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Mengembalikan hasil jarak dalam satuan meter
}

// --- API ENDPOINTS ---

// 1. Endpoint Login Multi-User (Admin & Sales)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = database.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.status(401).json({ success: false, message: "Username atau password salah!" });
    }
    return res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
});

// 2. Admin Endpoint: Mengambil Semua Data Statistik & Log Aktivitas
app.get('/api/admin/dashboard', (req, res) => {
    return res.json({
        stats: {
            totalWarung: database.warung.length,
            totalSales: database.users.filter(u => u.role === 'SALES').length,
            totalKunjungan: database.visitLogs.length,
            totalFraud: database.visitLogs.filter(l => l.status.includes('FRAUD')).length
        },
        visitLogs: database.visitLogs,
        warungList: database.warung
    });
});

// 3. Admin Endpoint: Mendaftarkan Toko / Warung Baru ke Peta
app.post('/api/admin/warung', (req, res) => {
    const { name, owner, latitude, longitude, qrToken } = req.body;
    if (!name || !latitude || !longitude || !qrToken) {
        return res.status(400).json({ success: false, message: "Data pendaftaran tidak lengkap!" });
    }
    
    const newWarung = {
        id: "WRG" + (database.warung.length + 1).toString().padStart(2, '0'),
        name, owner,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        qrToken
    };
    database.warung.push(newWarung);
    return res.json({ success: true, message: "Warung berhasil didaftarkan di peta kontrol!", data: newWarung });
});

// 4. Karyawan Endpoint: Mengambil Daftar Target Warung
app.get('/api/karyawan/warung', (req, res) => {
    return res.json(database.warung);
});

// 5. Karyawan Endpoint: Validasi Kehadiran Fisik Sales (GPS + QR)
app.post('/api/karyawan/checkin', (req, res) => {
    const { userId, userName, warungId, salesLat, salesLng, scannedToken } = req.body;
    
    const warung = database.warung.find(w => w.id === warungId);
    if (!warung) {
        return res.status(404).json({ success: false, message: "Warung tidak ditemukan!" });
    }

    // Mengukur jarak real-time HP Karyawan dengan letak fisik Warung asli
    const distance = calculateDistance(parseFloat(salesLat), parseFloat(salesLng), warung.latitude, warung.longitude);
    const MAX_ALLOWED_DISTANCE = 30; // Batas toleransi GPS hardware HP: 30 Meter

    let status = "SUCCESS";
    let message = "Check-in berhasil! Kehadiran Anda tervalidasi.";
    let isSuccess = true;

    // Validasi Tingkat Keamanan Tinggi
    if (warung.qrToken !== scannedToken) {
        status = "FRAUD_QR_INVALID";
        message = "Gagal: Token QR Code palsu atau salah sasaran!";
        isSuccess = false;
    } else if (distance > MAX_ALLOWED_DISTANCE) {
        status = "FRAUD_DISTANCE_TOO_FAR";
        message = `Gagal: Anda berada di luar radius warung! Jarak Anda: ${distance.toFixed(1)} meter dari target.`;
        isSuccess = false;
    }

    const logEntry = {
        id: "LOG" + (database.visitLogs.length + 1).toString().padStart(2, '0'),
        userId, userName, warungId,
        warungName: warung.name,
        timestamp: new Date().toISOString(),
        distance: parseFloat(distance.toFixed(1)),
        status
    };

    database.visitLogs.unshift(logEntry); // Log dimasukkan ke baris teratas agar real-time terpantau owner

    return res.json({ success: isSuccess, message, data: logEntry });
});

app.listen(PORT, () => {
    console.log(`Sistem Pemantauan Distribusi SFA aktif di port ${PORT}`);
});
