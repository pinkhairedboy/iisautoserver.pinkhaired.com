# IIS Auto Server - Development Log

## Project Overview

Automated Minecraft Forge server builder for **Ideal Industrial Assembly** modpack.

**Purpose:** Automatically download the latest modpack from Yandex.Disk, build a ready-to-run Forge server, and serve it to users through a web interface.

---

## Tech Stack

- **Backend:** Node.js + Express
- **Storage:** Yandex.Disk Public API (no authentication required)
- **Archive Processing:** adm-zip (supports Cyrillic filenames)
- **Deployment:** Docker + Docker Compose
- **Frontend:** Vanilla HTML/CSS/JS with i18n (EN/RU)

---

## What Was Implemented

### 1. Backend Architecture

**Files:**
- `src/index.js` - Express server with 4 endpoints
- `src/driveClient.js` - Yandex.Disk API integration
- `src/builder.js` - Server build pipeline
- `src/utils.js` - Helper functions

**API Endpoints:**
- `GET /` - Landing page
- `GET /version` - JSON with version info and build status
- `GET /download` - Download server (triggers build if needed)
- `GET /health` - Health check for monitoring

### 2. Yandex.Disk Integration

**Features:**
- ✅ Public folder access without credentials
- ✅ Automatic version detection from filename patterns (`ИИС v1.19.1.zip`, `IIS-v1.09.3.zip`)
- ✅ File integrity verification (MD5 hash + file size check)
- ✅ Download progress logging

**API Flow:**
1. List files in public folder
2. Filter ZIP files matching pattern
3. Sort by modification time (newest first)
4. Get file metadata (name, size, MD5, SHA256)
5. Generate download link
6. Download and verify integrity

### 3. Build Pipeline

**Process:**
1. Download modpack from Yandex.Disk → `storage/modpack-temp.zip`
2. Clean `storage/temp/` directory
3. Copy Forge template from `forge-clean/`
4. Extract modpack into temp directory
5. Remove 4 client-side mods:
   - OptiFine_1.7.10_HD_U_E7.jar
   - ResourceLoader-MC1.7.10-1.3.jar
   - CustomMainMenu-MC1.7.10-1.9.2.jar
   - MapWriter-2.1.21-II-Edition.jar
6. Create start scripts (start.sh, start.bat)
7. Archive everything → `storage/latest.zip`
8. Save version → `storage/current.txt`
9. Cleanup temp files

### 4. File Integrity & Cleanup

**Integrity Checks:**
- File size verification after download
- MD5 hash calculation and comparison
- Automatic rejection of corrupted files

**Cleanup System:**
- `finally` blocks ensure temp files are deleted
- Orphaned file cleanup on server startup
- Automatic temp directory cleaning before/after build

### 5. Frontend (Industrial Theme)

**Design:**
- Dark industrial theme (GregTech/Minecraft inspired)
- Cyan/blue accent colors (#00c8ff)
- Pixel font "Press Start 2P" for headers
- Technical elements (grid pattern, glowing borders)
- Animated effects (pulsing header, glowing buttons)

**i18n Support:**
- Automatic language detection from browser
- Manual override via `?lang=ru` or `?lang=en`
- Full translation for all UI elements
- Dynamic status messages

### 6. Docker Setup

**Configuration:**
- Alpine-based Node.js 18 image
- Java 8 JRE included (for potential testing)
- Multi-stage build for optimization
- Health check endpoint monitoring

**Volumes:**
- `./storage` - Persistent data (latest.zip, current.txt)
- `./forge-clean` - Read-only Forge template

**Environment:**
- `PORT=3003`
- `NODE_ENV=production`
- `YANDEX_DISK_URL=https://disk.yandex.ru/d/m0vmhfXyyBE7G`

---

## Project Structure

```
iisautoserver.pinkhaired.com/
├── src/
│   ├── index.js          # Express server & API routes
│   ├── builder.js        # Server build pipeline
│   ├── driveClient.js    # Yandex.Disk API client
│   └── utils.js          # Helper functions
├── public/
│   └── index.html        # Landing page (Industrial theme)
├── forge-clean/          # Clean Forge 1.7.10 template
├── storage/              # Runtime data (Docker volume)
│   ├── current.txt       # Current version
│   ├── latest.zip        # Built server archive
│   └── temp/             # Build workspace
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── .dockerignore
└── README.md
```

---

## Key Features

1. **Zero Configuration** - Works out of the box with Docker
2. **Auto-Updates** - Detects new versions automatically
3. **Build on Demand** - First user triggers the build
4. **Concurrent Requests** - Build status prevents duplicate builds
5. **File Verification** - MD5 hash ensures integrity
6. **Clean Architecture** - Modular, maintainable code
7. **Error Handling** - Graceful failures with cleanup
8. **Responsive UI** - Works on mobile and desktop
9. **Multilingual** - Russian and English support

---

## Security Considerations

- ✅ No credentials in code (public API only)
- ✅ Read-only Forge template mount
- ✅ File integrity verification
- ✅ No shell injection risks (no user input to commands)
- ✅ Temp file cleanup prevents disk filling
- ✅ Docker isolation

---

## Testing Checklist

- [x] Download latest version from Yandex.Disk
- [x] Verify file integrity (MD5 + size)
- [x] Build server from modpack
- [x] Remove client-side mods correctly
- [x] Create proper start scripts
- [x] Serve built server via HTTP
- [x] Handle concurrent requests
- [x] Clean up temp files on interruption
- [x] Auto-clean orphaned files on restart
- [x] Language switching (EN/RU)
- [x] Responsive design
- [x] Docker container health

---

## Future Improvements

1. **Caching:** Cache Yandex.Disk API responses (5 min TTL)
2. **Metrics:** Add Prometheus metrics for monitoring
3. **Notifications:** Webhook/Discord notifications on new versions
4. **Admin Panel:** Force rebuild, clear cache, view logs
5. **Multiple Versions:** Keep last N versions available
6. **Progress WebSocket:** Real-time build progress updates
7. **Error Recovery:** Automatic retry on network failures

---

## Deployment

```bash
# Clone repository
git clone <repo-url>
cd iisautoserver.pinkhaired.com

# Start with Docker
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

**Production Setup:**
1. Configure reverse proxy (Nginx)
2. Add SSL certificate (Cloudflare/Let's Encrypt)
3. Set up monitoring (Uptime Kuma, etc.)
4. Configure backups for `storage/` directory

---

## License

MIT

---

**Built with ⚡ for the Ideal Industrial Assembly community**
