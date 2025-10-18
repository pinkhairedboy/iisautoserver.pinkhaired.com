const express = require('express');
const fs = require('fs');
const path = require('path');
const { checkForUpdate, downloadFile } = require('./driveClient');
const { buildServer } = require('./builder');
const { getCurrentVersion, hasBuiltServer, getFileSizeMB, log } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3003;

// Track build status
let isBuildInProgress = false;
let buildProgress = '';
let buildSteps = [
  { id: 1, name: 'Checking for updates', status: 'pending' },
  { id: 2, name: 'Downloading modpack', status: 'pending', detail: '' },
  { id: 3, name: 'Verifying file integrity', status: 'pending' },
  { id: 4, name: 'Extracting modpack', status: 'pending' },
  { id: 5, name: 'Copying Forge template', status: 'pending' },
  { id: 6, name: 'Removing client-side mods', status: 'pending' },
  { id: 7, name: 'Creating start scripts', status: 'pending' },
  { id: 8, name: 'Creating server archive', status: 'pending' },
  { id: 9, name: 'Finalizing', status: 'pending' }
];

function updateBuildStep(stepId, status, detail = '') {
  const step = buildSteps.find(s => s.id === stepId);
  if (step) {
    step.status = status;
    step.detail = detail;
  }
}

function resetBuildSteps() {
  buildSteps.forEach(step => {
    step.status = 'pending';
    step.detail = '';
  });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

/**
 * GET / - Landing page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * GET /version - Get current version info (JSON)
 */
app.get('/version', async (req, res) => {
  try {
    const currentVersion = getCurrentVersion();
    const hasServer = hasBuiltServer();

    let latestInfo = null;
    try {
      latestInfo = await checkForUpdate(currentVersion || 'none');
    } catch (error) {
      log(`Warning: Could not check for updates: ${error.message}`);
    }

    res.json({
      currentVersion: currentVersion || 'none',
      hasBuiltServer: hasServer,
      latestVersion: latestInfo ? latestInfo.latestVersion : 'unknown',
      updateAvailable: latestInfo ? latestInfo.hasUpdate : false,
      buildInProgress: isBuildInProgress,
      buildProgress: buildProgress,
      buildSteps: buildSteps
    });

  } catch (error) {
    log(`Error in /version: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /building - Show build progress page
 */
app.get('/building', async (req, res) => {
  try {
    const currentVersion = getCurrentVersion();
    const hasServer = hasBuiltServer();

    // Check for updates
    let updateInfo;
    try {
      updateInfo = await checkForUpdate(currentVersion || 'none');
    } catch (error) {
      // If we can't check for updates but have a built server, redirect to download
      if (hasServer) {
        log('Warning: Cannot check for updates, redirecting to download');
        return res.redirect('/download');
      }
      throw new Error('Cannot check for updates and no built server available');
    }

    // If server is ready and no update needed, redirect to download
    if (!updateInfo.hasUpdate && hasServer) {
      log(`Server ready, redirecting to download (${currentVersion})`);
      return res.redirect('/download');
    }

    // If build is not in progress, start it
    if (!isBuildInProgress) {
      log(`Starting build for new version: ${updateInfo.latestVersion}`);
      isBuildInProgress = true;
      resetBuildSteps();
      buildProgress = 'Starting build process...';

      // Build in background
      performBuild(updateInfo).catch(error => {
        log(`Build failed: ${error.message}`);
        isBuildInProgress = false;
        buildProgress = `Build failed: ${error.message}`;
      });
    }

    // Show build progress page
    res.send(getBuildProgressHTML(updateInfo.latestVersion));

  } catch (error) {
    log(`Error in /building: ${error.message}`);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; }
          h1 { color: #f44336; }
        </style>
      </head>
      <body>
        <h1>Error</h1>
        <p>${error.message}</p>
        <a href="/">Go back</a>
      </body>
      </html>
    `);
  }
});

/**
 * GET /download - Download server file (or redirect to build page)
 */
app.get('/download', async (req, res) => {
  try {
    const currentVersion = getCurrentVersion();
    const hasServer = hasBuiltServer();

    // If build is in progress, redirect to building page
    if (isBuildInProgress) {
      return res.redirect('/building');
    }

    // Check for updates
    let updateInfo;
    try {
      updateInfo = await checkForUpdate(currentVersion || 'none');
    } catch (error) {
      // If we can't check for updates but have a built server, serve it
      if (hasServer) {
        log('Warning: Cannot check for updates, serving existing server');
        return serveExistingServer(res);
      }
      // Redirect to building page to start the process
      return res.redirect('/building');
    }

    // If no server or update needed, redirect to building page
    if (!hasServer || updateInfo.hasUpdate) {
      return res.redirect('/building');
    }

    // Server is ready, serve it
    log(`Serving existing server (${currentVersion})`);
    return serveExistingServer(res);

  } catch (error) {
    log(`Error in /download: ${error.message}`);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; }
          h1 { color: #f44336; }
        </style>
      </head>
      <body>
        <h1>Error</h1>
        <p>${error.message}</p>
        <a href="/">Go back</a>
      </body>
      </html>
    `);
  }
});

/**
 * Generate build progress HTML page
 */
function getBuildProgressHTML(version) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Building Server ${version}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Courier New', monospace;
            background: #d5d5d5 url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDAsMCwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+');
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 10px;
            color: #2a2a2a;
            overflow: hidden;
        }

        .container {
            background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
            border: 3px solid #999;
            box-shadow: 0 0 0 1px #bbb, 0 5px 20px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8);
            width: 100%;
            max-width: 700px;
            max-height: 95vh;
            padding: 0;
            position: relative;
            display: flex;
            flex-direction: column;
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #4a90e2, #357abd, #4a90e2);
        }

        .header {
            background: linear-gradient(180deg, #e0e0e0 0%, #d0d0d0 100%);
            padding: 15px 20px;
            border-bottom: 2px solid #aaa;
            flex-shrink: 0;
        }

        h1 {
            font-family: 'Press Start 2P', monospace;
            color: #2c5aa0;
            font-size: 1em;
            margin-bottom: 8px;
            text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.8);
        }

        .subtitle {
            color: #666;
            font-size: 0.8em;
            margin-top: 5px;
        }

        .content {
            padding: 15px 20px;
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .content::-webkit-scrollbar {
            width: 6px;
        }

        .content::-webkit-scrollbar-track {
            background: #e0e0e0;
        }

        .content::-webkit-scrollbar-thumb {
            background: #4a90e2;
            border-radius: 3px;
        }

        .progress-bar-container {
            background: #fff;
            border: 2px solid #4a90e2;
            height: 24px;
            margin-bottom: 15px;
            position: relative;
            overflow: hidden;
        }

        .progress-bar {
            background: linear-gradient(90deg, #5a9fd4, #4a90e2);
            height: 100%;
            width: 0%;
            transition: width 0.3s ease;
            position: relative;
        }

        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            right: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-weight: bold;
            color: #2c5aa0;
            font-size: 0.85em;
        }

        .steps-list {
            list-style: none;
        }

        .step {
            background: rgba(255, 255, 255, 0.6);
            border: 2px solid #ccc;
            border-left: 4px solid #ccc;
            padding: 8px 12px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            transition: all 0.3s ease;
        }

        .step.completed {
            border-left-color: #27ae60;
            background: rgba(39, 174, 96, 0.1);
        }

        .step.in-progress {
            border-left-color: #4a90e2;
            background: rgba(74, 144, 226, 0.1);
            animation: pulse 2s infinite;
        }

        .step.failed {
            border-left-color: #c0392b;
            background: rgba(192, 57, 43, 0.1);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .step-icon {
            width: 20px;
            height: 20px;
            margin-right: 10px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .step.pending .step-icon::before {
            content: '○';
            color: #999;
            font-size: 16px;
        }

        .step.in-progress .step-icon::before {
            content: '◉';
            color: #4a90e2;
            font-size: 16px;
            animation: spin 2s linear infinite;
        }

        .step.completed .step-icon::before {
            content: '✓';
            color: #27ae60;
            font-size: 14px;
        }

        .step.failed .step-icon::before {
            content: '✗';
            color: #c0392b;
            font-size: 14px;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .step-name {
            flex: 1;
            color: #333;
            font-weight: bold;
            font-size: 0.9em;
        }

        .step-detail {
            font-size: 0.8em;
            color: #666;
            margin-top: 3px;
        }

        .info-box {
            background: rgba(74, 144, 226, 0.1);
            border: 2px solid #4a90e2;
            border-left: 4px solid #4a90e2;
            padding: 10px 15px;
            margin-top: 15px;
            color: #333;
            font-size: 0.85em;
        }

        .info-box strong {
            color: #2c5aa0;
        }

        footer {
            background: #d0d0d0;
            padding: 10px 20px;
            border-top: 2px solid #aaa;
            text-align: center;
            font-size: 0.75em;
            color: #666;
            flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 data-i18n="title">BUILDING SERVER</h1>
            <p class="subtitle" data-i18n="version">Version: <strong>${version}</strong></p>
            <p class="subtitle" style="margin-top: 5px;" data-i18n="subtitle">Building ready-to-run Minecraft server...</p>
        </div>

        <div class="content">
            <div class="progress-bar-container">
                <div class="progress-bar" id="progress-bar"></div>
                <div class="progress-text" id="progress-text">0%</div>
            </div>

            <ul class="steps-list" id="steps-list">
                <!-- Steps will be populated by JavaScript -->
            </ul>

            <div class="info-box" data-i18n="info">
                <strong>ℹ️</strong> Build takes 10-15 seconds. You'll see a download button when complete.
            </div>
        </div>

        <footer>
            <p data-i18n="footer">IIS Auto Server • Industrial Automation System</p>
        </footer>
    </div>

    <script>
        const translations = {
            en: {
                title: 'BUILDING SERVER',
                version: 'Version: <strong>${version}</strong>',
                subtitle: 'Building ready-to-run Minecraft server...',
                info: '<strong>ℹ️</strong> Build takes 10-15 seconds. You\\'ll see a download button when complete.',
                footer: 'IIS Auto Server • Industrial Automation System',
                buildComplete: '✓ Build Complete!',
                serverReady: 'Server is ready to download.',
                downloadButton: '⬇ DOWNLOAD SERVER ⬇',
                steps: {
                    'Checking for updates': 'Checking for updates',
                    'Downloading modpack': 'Downloading modpack',
                    'Verifying file integrity': 'Verifying file integrity',
                    'Extracting modpack': 'Extracting modpack',
                    'Copying Forge template': 'Copying Forge template',
                    'Removing client-side mods': 'Removing client-side mods',
                    'Creating start scripts': 'Creating start scripts',
                    'Creating server archive': 'Creating server archive',
                    'Finalizing': 'Finalizing'
                }
            },
            ru: {
                title: 'СБОРКА СЕРВЕРА',
                version: 'Версия: <strong>${version}</strong>',
                subtitle: 'Создание готового к запуску Minecraft сервера...',
                info: '<strong>ℹ️</strong> Сборка занимает 10-15 секунд. После завершения появится кнопка загрузки.',
                footer: 'IIS Auto Server • Система промышленной автоматизации',
                buildComplete: '✓ Сборка завершена!',
                serverReady: 'Сервер готов к загрузке.',
                downloadButton: '⬇ СКАЧАТЬ СЕРВЕР ⬇',
                steps: {
                    'Checking for updates': 'Проверка обновлений',
                    'Downloading modpack': 'Загрузка модпака',
                    'Verifying file integrity': 'Проверка целостности файла',
                    'Extracting modpack': 'Извлечение модпака',
                    'Copying Forge template': 'Копирование шаблона Forge',
                    'Removing client-side mods': 'Удаление клиентских модов',
                    'Creating start scripts': 'Создание скриптов запуска',
                    'Creating server archive': 'Создание архива сервера',
                    'Finalizing': 'Завершение'
                }
            }
        };

        function detectLanguage() {
            const browserLang = navigator.language || navigator.userLanguage;
            const langCode = browserLang.split('-')[0].toLowerCase();
            return translations[langCode] ? langCode : 'en';
        }

        const currentLang = new URLSearchParams(window.location.search).get('lang') || detectLanguage();
        const t = translations[currentLang];

        // Apply translations
        document.documentElement.lang = currentLang;
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (t[key]) {
                if (key === 'version') {
                    element.innerHTML = t[key];
                } else {
                    element.innerHTML = t[key];
                }
            }
        });

        let pollInterval;

        function updateProgress() {
            fetch('/version')
                .then(response => response.json())
                .then(data => {
                    if (!data.buildInProgress) {
                        // Build complete, show download button
                        clearInterval(pollInterval);
                        showDownloadButton();
                        return;
                    }

                    const steps = data.buildSteps || [];
                    const completedSteps = steps.filter(s => s.status === 'completed').length;
                    const totalSteps = steps.length;
                    const progress = Math.round((completedSteps / totalSteps) * 100);

                    // Update progress bar
                    document.getElementById('progress-bar').style.width = progress + '%';
                    document.getElementById('progress-text').textContent = progress + '%';

                    // Update steps list
                    const stepsList = document.getElementById('steps-list');
                    stepsList.innerHTML = steps.map(step => \`
                        <li class="step \${step.status}">
                            <div class="step-icon"></div>
                            <div style="flex: 1;">
                                <div class="step-name">\${t.steps[step.name] || step.name}</div>
                                \${step.detail ? '<div class="step-detail">' + step.detail + '</div>' : ''}
                            </div>
                        </li>
                    \`).join('');
                })
                .catch(error => console.error('Error fetching progress:', error));
        }

        function showDownloadButton() {
            // Mark all steps as completed
            const stepsList = document.getElementById('steps-list');
            const allSteps = stepsList.querySelectorAll('.step');
            allSteps.forEach(step => {
                step.className = 'step completed';
            });

            // Update info box with download button
            const infoBox = document.querySelector('.info-box');
            infoBox.innerHTML = \`
                <div style="text-align: center;">
                    <h3 style="color: #27ae60; margin-bottom: 10px; font-size: 1.1em;">\${t.buildComplete}</h3>
                    <p style="margin-bottom: 15px; font-size: 0.9em;">\${t.serverReady}</p>
                    <a href="/download" style="
                        display: inline-block;
                        background: linear-gradient(180deg, #5a9fd4 0%, #4a90e2 100%);
                        color: #fff;
                        border: 3px solid #2c5aa0;
                        padding: 12px 28px;
                        font-size: 0.95em;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                        text-transform: uppercase;
                        cursor: pointer;
                        text-decoration: none;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3);
                        letter-spacing: 2px;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                        transition: all 0.3s ease;
                    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        \${t.downloadButton}
                    </a>
                </div>
            \`;

            // Update progress bar to 100%
            document.getElementById('progress-bar').style.width = '100%';
            document.getElementById('progress-text').textContent = '100%';
        }

        // Initial update
        updateProgress();

        // Update every 2 seconds
        pollInterval = setInterval(updateProgress, 2000);
    </script>
</body>
</html>
  `;
}

/**
 * Perform build process in background
 */
async function performBuild(updateInfo) {
  const modpackPath = path.join(__dirname, '../storage/modpack-temp.zip');

  try {
    // Step 1: Checking for updates (already done, mark as complete)
    updateBuildStep(1, 'completed');

    // Step 2: Download modpack
    updateBuildStep(2, 'in-progress');
    buildProgress = 'Downloading modpack from Yandex.Disk...';
    await downloadFile(updateInfo.filePath, modpackPath, {
      expectedMD5: updateInfo.md5,
      expectedSize: updateInfo.size
    });
    updateBuildStep(2, 'completed');

    // Step 3: Verify integrity
    updateBuildStep(3, 'in-progress');
    buildProgress = 'Verifying file integrity...';
    // Verification happens inside downloadFile
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for visual
    updateBuildStep(3, 'completed');

    // Step 4-8: Build server (multiple steps)
    updateBuildStep(4, 'in-progress');
    buildProgress = 'Building server...';
    await buildServer(modpackPath, updateInfo.latestVersion, (step) => {
      // Callback from builder to update steps 4-8
      if (step === 'template') {
        updateBuildStep(4, 'completed');
        updateBuildStep(5, 'in-progress');
      } else if (step === 'extracting') {
        updateBuildStep(5, 'completed');
        updateBuildStep(6, 'in-progress');
      } else if (step === 'mods') {
        updateBuildStep(6, 'completed');
        updateBuildStep(7, 'in-progress');
      } else if (step === 'scripts') {
        updateBuildStep(7, 'completed');
        updateBuildStep(8, 'in-progress');
      } else if (step === 'archiving') {
        updateBuildStep(8, 'completed');
      }
    });

    // Step 9: Finalize
    updateBuildStep(9, 'in-progress');
    buildProgress = 'Build completed!';
    log(`Build completed successfully: ${updateInfo.latestVersion}`);
    updateBuildStep(9, 'completed');

  } catch (error) {
    log(`Build error: ${error.message}`);
    buildProgress = `Build failed: ${error.message}`;
    // Mark current in-progress step as failed
    const currentStep = buildSteps.find(s => s.status === 'in-progress');
    if (currentStep) {
      currentStep.status = 'failed';
      currentStep.detail = error.message;
    }
    throw error;
  } finally {
    // Clean up temp files
    if (fs.existsSync(modpackPath)) {
      try {
        fs.unlinkSync(modpackPath);
        log('Cleaned up temporary modpack file');
      } catch (err) {
        log(`Warning: Could not delete temp file: ${err.message}`);
      }
    }

    isBuildInProgress = false;
  }
}

/**
 * Serve existing server file
 */
function serveExistingServer(res) {
  const latestZip = path.join(__dirname, '../storage/latest.zip');
  const currentVersion = getCurrentVersion() || 'unknown';
  const fileSize = getFileSizeMB(latestZip);

  // Get file size in bytes for Content-Length header
  const stats = fs.statSync(latestZip);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="IIS-Server-${currentVersion}.zip"`);
  res.setHeader('Content-Length', stats.size);

  log(`Serving server: ${currentVersion} (${fileSize})`);

  const fileStream = fs.createReadStream(latestZip);
  fileStream.pipe(res);
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: getCurrentVersion() || 'none' });
});

// Cleanup function for orphaned temp files
function cleanupOrphanedFiles() {
  const modpackPath = path.join(__dirname, '../storage/modpack-temp.zip');

  // Remove incomplete modpack downloads
  if (fs.existsSync(modpackPath)) {
    try {
      fs.unlinkSync(modpackPath);
      log('Cleaned up orphaned modpack file from previous run');
    } catch (err) {
      log(`Warning: Could not delete orphaned file: ${err.message}`);
    }
  }
}

// Start server
app.listen(PORT, () => {
  log(`IIS Auto Server running on port ${PORT}`);
  log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  log(`Current version: ${getCurrentVersion() || 'none'}`);

  // Clean up any orphaned files from interrupted builds
  cleanupOrphanedFiles();
});
