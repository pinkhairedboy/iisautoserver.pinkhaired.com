# IIS Auto Server

Automated Minecraft Forge server builder for **Ideal Industrial Assembly** modpack.

## What it does

- Monitors Yandex.Disk for modpack updates
- Automatically builds ready-to-run servers
- Removes client-side mods (OptiFine, CustomMainMenu, etc.)
- Serves pre-built servers through web interface

## Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/iisautoserver.pinkhaired.com.git
cd iisautoserver.pinkhaired.com

# Start with Docker
docker compose up -d

# Access
open http://localhost:3003
```

## Project Structure

```
├── src/
│   ├── index.js          # Express server & routes
│   ├── builder.js        # Server build pipeline
│   ├── driveClient.js    # Yandex.Disk API client
│   └── utils.js          # Helper functions
├── public/
│   └── index.html        # Landing page
├── forge-clean/          # Clean Forge 1.7.10 template
├── storage/              # Runtime data (Docker volume)
│   ├── current.txt       # Current version
│   ├── latest.zip        # Built server archive
│   └── temp/             # Build workspace
├── Dockerfile
└── docker-compose.yml
```

## API Endpoints

- `GET /` - Landing page
- `GET /building` - Build progress page with real-time updates
- `GET /download` - Download server (redirects to /building if needed)
- `GET /version` - Version info and build progress (JSON)
- `GET /health` - Health check

## Configuration

Environment variables (docker-compose.yml):

```yaml
PORT: 3003
NODE_ENV: production
YANDEX_DISK_URL: https://disk.yandex.ru/d/m0vmhfXyyBE7G
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Dev mode with auto-reload
npm run dev
```

## Deployment

1. Deploy to server with Docker
2. Configure Nginx reverse proxy
3. Point domain to server
4. Add SSL certificate (Cloudflare/Let's Encrypt)

## Tech Stack

- **Node.js** - Runtime
- **Express** - Web server
- **adm-zip** - ZIP handling (Cyrillic support)
- **Docker** - Containerization

## Notes

- Works with **public** Yandex.Disk folders (no authentication required)
- Automatically handles file downloads and version checking
- Storage is persistent via Docker volumes
