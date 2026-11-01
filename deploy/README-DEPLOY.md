# Deploy Tilt Plane ke server rumah (game.ainulhakim.com)

Semua perintah dijalankan DI SERVER RUMAH kecuali scp (dari VM).

## 0. Dari VM (kirim paket)
```
scp /home/ubuntu/tilt-plane/deploy/tilt-plane-deploy.tar.gz ainul@<IP-TAILNET>:~/
```

## 1. Pasang file
```
tar xzf ~/tilt-plane-deploy.tar.gz -C ~/
mkdir -p ~/games
cp -r ~/tilt-plane-deploy/pesawat ~/games/
cp ~/tilt-plane-deploy/landing/index.html ~/games/index.html
# hasil: ~/games/index.html (landing) + ~/games/pesawat/ (build game)
```

## 2. Service statis port 8095
```
sudo cp ~/tilt-plane-deploy/tilt-plane.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tilt-plane
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8095/        # harus 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8095/pesawat/ # harus 200
```

## 3. Ingress tunnel cloudflared-cctv
⚠️ CCTV putus ±5-10 detik saat restart.
```
sudo cp <file-config-cloudflared-cctv> <file-config-cloudflared-cctv>.bak-pesawat
# tambahkan DI BARIS PERTAMA setelah 'ingress:' (sebelum cctv.ainulhakim.com):
#   - hostname: game.ainulhakim.com
#     service: http://127.0.0.1:8095
sudo systemctl restart cloudflared-cctv
```
Catatan: WAJIB 127.0.0.1 (bukan localhost) agar tidak kena IPv6 EOF.

## 4. DNS (sekali saja, di server rumah, butuh cert cloudflared)
```
cloudflared tunnel route dns <UUID-TUNNEL-CCTV> game.ainulhakim.com
```

## 5. Verifikasi (dari VM)
```
nslookup game.ainulhakim.com 1.1.1.1          # CNAME ke <uuid>.cfargotunnel.com
curl -s -o /dev/null -w '%{http_code}' https://game.ainulhakim.com/pesawat/  # 200
curl -s -o /dev/null -w '%{http_code}' https://game.ainulhakim.com/          # 200
```

## Update build berikutnya
Build ulang di VM (npx vite build), lalu:
```
scp -r /home/ubuntu/tilt-plane/dist/* ainul@<IP-TAILNET>:~/games/pesawat/
```
Tanpa restart apapun (http.server langsung sajikan file baru).
