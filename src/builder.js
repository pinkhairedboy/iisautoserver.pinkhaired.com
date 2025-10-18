const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  copyDirectory,
  deleteDirectory,
  saveCurrentVersion,
  log
} = require('./utils');

// Client-side mods that must be removed from server
const CLIENT_SIDE_MODS = [
  'OptiFine_1.7.10_HD_U_E7.jar',
  'ResourceLoader-MC1.7.10-1.3.jar',
  'CustomMainMenu-MC1.7.10-1.9.2.jar',
  'MapWriter-2.1.21-II-Edition.jar'
];

/**
 * Build server from modpack
 * @param {string} modpackPath - Path to downloaded modpack ZIP
 * @param {string} version - Version string (e.g., "v1.09.3")
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<void>}
 */
async function buildServer(modpackPath, version, progressCallback = null) {
  const tempDir = path.join(__dirname, '../storage/temp');
  const outputZip = path.join(__dirname, '../storage/latest.zip');

  try {
    log(`Starting build process for ${version}`);

    // Step 1: Clean temp directory
    log('Cleaning temp directory...');
    deleteDirectory(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });

    // Step 2: Copy forge-clean template
    log('Copying Forge template...');
    const forgeCleanPath = path.join(__dirname, '../forge-clean');
    if (progressCallback) progressCallback('template');
    copyDirectory(forgeCleanPath, tempDir);

    // Step 3: Extract modpack
    log('Extracting modpack...');
    if (progressCallback) progressCallback('extracting');
    const modpackZip = new AdmZip(modpackPath);
    modpackZip.extractAllTo(tempDir, true);

    // Step 4: Remove client-side mods
    log('Removing client-side mods...');
    const modsDir = path.join(tempDir, 'mods');
    let removedCount = 0;

    for (const modFile of CLIENT_SIDE_MODS) {
      const modPath = path.join(modsDir, modFile);
      if (fs.existsSync(modPath)) {
        fs.unlinkSync(modPath);
        log(`  Removed: ${modFile}`);
        removedCount++;
      }
    }

    log(`Removed ${removedCount} client-side mods`);
    if (progressCallback) progressCallback('mods');

    // Step 5: Create start scripts
    log('Creating start scripts...');
    createStartScripts(tempDir);
    if (progressCallback) progressCallback('scripts');

    // Step 6: Create output ZIP
    log('Creating server archive...');
    if (progressCallback) progressCallback('archiving');
    const outputZipFile = new AdmZip();
    addDirectoryToZip(outputZipFile, tempDir, 'minecraft-server');
    outputZipFile.writeZip(outputZip);

    // Step 7: Save version
    saveCurrentVersion(version);

    // Step 8: Clean up temp directory
    log('Cleaning up...');
    deleteDirectory(tempDir);

    const stats = fs.statSync(outputZip);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log(`Build completed! Server archive: ${sizeMB} MB`);

  } catch (error) {
    log(`Build failed: ${error.message}`);
    throw error;
  }
}

/**
 * Create start.sh and start.bat scripts
 * @param {string} serverDir - Server directory path
 */
function createStartScripts(serverDir) {
  const forgeJar = 'forge-1.7.10-10.13.4.1614-1.7.10-universal.jar';

  // start.sh for Linux/Mac
  const startSh = `#!/bin/bash
java -Xmx24G -Xms4G -jar ${forgeJar} nogui
`;

  // start.bat for Windows
  const startBat = `@echo off
java -Xmx24G -Xms4G -jar ${forgeJar} nogui
pause
`;

  fs.writeFileSync(path.join(serverDir, 'start.sh'), startSh, 'utf8');
  fs.writeFileSync(path.join(serverDir, 'start.bat'), startBat, 'utf8');

  // Make start.sh executable
  fs.chmodSync(path.join(serverDir, 'start.sh'), 0o755);
}

/**
 * Recursively add directory to ZIP archive
 * @param {AdmZip} zip - AdmZip instance
 * @param {string} dirPath - Directory to add
 * @param {string} zipPath - Path inside ZIP
 */
function addDirectoryToZip(zip, dirPath, zipPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipEntryPath = path.join(zipPath, entry.name);

    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, zipEntryPath);
    } else {
      zip.addLocalFile(fullPath, path.dirname(zipEntryPath));
    }
  }
}

module.exports = {
  buildServer
};
