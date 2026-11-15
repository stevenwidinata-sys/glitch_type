// Common Bahasa Indonesia words, lowercase, letters only.
const RAW = `
yang dan di ini itu dengan untuk tidak dari dalam akan pada juga saya ke karena ada bisa orang kita mereka sudah
kami atau seperti jadi lebih harus banyak apa kalau hanya baru semua sangat tahun hari waktu sama sekarang lagi
masih belum pernah selalu sering kadang mungkin tentu memang cukup terlalu paling agak hampir segera nanti tadi
kemarin besok lusa pagi siang sore malam minggu bulan jam menit detik
aku kamu dia kalian beliau anda
rumah sekolah kantor pasar jalan kota desa negara dunia pulau gunung laut sungai danau hutan pantai langit bumi
bintang bulan matahari awan hujan angin badai petir salju api air tanah batu pasir kayu besi emas perak
anak ibu ayah kakak adik nenek kakek paman bibi teman guru murid dokter polisi petani nelayan pedagang tentara
keluarga orang manusia laki perempuan bayi pemuda
makan minum tidur bangun duduk berdiri jalan lari lompat terbang berenang masak cuci baca tulis dengar lihat
bicara bilang tanya jawab beli jual bayar kirim terima buka tutup ambil bawa simpan buang cari temukan pakai
mulai selesai datang pergi pulang tinggal pindah tunggu ingat lupa tahu pikir rasa suka cinta benci takut marah
senang sedih tertawa menangis tersenyum bermain belajar bekerja mengajar membantu menolong menulis membaca
mendengar melihat berbicara bertanya menjawab membeli menjual membayar mengirim menerima membuka menutup
mengambil membawa menyimpan mencari menemukan memakai memulai menunggu mengingat melupakan berpikir merasa
berlari berjalan melompat memasak mencuci menyanyi menari menggambar mengetik menghitung
besar kecil panjang pendek tinggi rendah lebar sempit tebal tipis berat ringan cepat lambat baru lama tua muda
baik buruk bagus jelek cantik tampan bersih kotor panas dingin hangat sejuk terang gelap keras lembut kuat lemah
kaya miskin mahal murah mudah sulit susah senang sedih marah takut berani pintar bodoh rajin malas jujur sabar
ramah sopan lucu aneh penting benar salah sama beda penuh kosong manis asin pahit asam pedas segar
merah biru hijau kuning ungu oranye putih hitam abu coklat
satu dua tiga empat lima enam tujuh delapan sembilan sepuluh seratus seribu juta pertama kedua ketiga
nasi roti mie sayur buah daging ayam ikan telur susu kopi teh gula garam jeruk pisang apel mangga semangka
kucing anjing burung kuda sapi kambing ayam bebek ikan ular katak harimau singa gajah monyet kelinci
mata telinga hidung mulut tangan kaki kepala rambut gigi jari hati badan
buku pena pensil kertas meja kursi pintu jendela lampu tas sepatu baju celana topi jam kunci telepon komputer
layar papan ketik tombol kabel mesin robot roket kapal mobil motor sepeda pesawat kereta bus
sinyal kode data jaringan sistem memori virus galat program aplikasi internet server berkas folder
cahaya bayangan energi gravitasi galaksi planet asteroid komet orbit ruang angkasa lubang hitam
pekerjaan pelajaran pertanyaan jawaban cerita berita masalah jalan keluar harapan mimpi rencana tujuan
kesempatan pengalaman pengetahuan kebebasan kebahagiaan persahabatan perjalanan petualangan
tetapi namun karena sehingga supaya agar ketika saat sejak sampai hingga sebelum sesudah setelah selama
jika kalau maka walaupun meskipun bahwa tentang antara terhadap bersama tanpa melalui menuju oleh bagi
di atas bawah depan belakang samping dalam luar sini sana situ mana kapan bagaimana mengapa siapa berapa
`;

export const WORDS_ID: string[] = Array.from(new Set(RAW.split(/\s+/).filter((w) => /^[a-z]+$/.test(w))));
