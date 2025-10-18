const fs = require('fs');
const path = require('path');

/**
 * Recursively copy directory
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirectory(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively delete directory
 * @param {string} dirPath - Directory to delete
 */
function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Read current version from storage
 * @returns {string|null} Current version or null if not exists/empty
 */
function getCurrentVersion() {
  const versionFile = path.join(__dirname, '../storage/current.txt');
  if (fs.existsSync(versionFile)) {
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    return version || null;
  }
  return null;
}

/**
 * Save current version to storage
 * @param {string} version - Version string to save
 */
function saveCurrentVersion(version) {
  const versionFile = path.join(__dirname, '../storage/current.txt');
  fs.writeFileSync(versionFile, version, 'utf8');
}

/**
 * Check if latest.zip exists in storage
 * @returns {boolean}
 */
function hasBuiltServer() {
  const latestZip = path.join(__dirname, '../storage/latest.zip');
  return fs.existsSync(latestZip);
}

/**
 * Get file size in MB
 * @param {string} filePath - Path to file
 * @returns {string} File size formatted as "X.XX MB"
 */
function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  return `${sizeMB} MB`;
}

/**
 * Extract version from filename
 * Supports formats: "IIS-v1.09.3.zip", "ИИС v1.19.1.zip", "IIS v1.09.3.zip"
 * @param {string} filename - Modpack filename
 * @returns {string} Extracted version
 */
function extractVersionFromFilename(filename) {
  // Try different patterns
  const patterns = [
    /IIS[-\s]+(v[\d.]+)\.zip/i,  // IIS-v1.09.3 or IIS v1.09.3
    /ИИС\s+(v[\d.]+)\.zip/i       // ИИС v1.19.1
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Fallback - return filename without extension
  return filename.replace(/\.zip$/i, '');
}

/**
 * Log with timestamp
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = {
  copyDirectory,
  deleteDirectory,
  getCurrentVersion,
  saveCurrentVersion,
  hasBuiltServer,
  getFileSizeMB,
  extractVersionFromFilename,
  log
};
