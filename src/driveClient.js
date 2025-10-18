const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { extractVersionFromFilename, log } = require('./utils');

// Yandex.Disk public folder URL from environment variable
const YANDEX_DISK_URL = process.env.YANDEX_DISK_URL || 'https://disk.yandex.ru/d/m0vmhfXyyBE7G';

// Yandex.Disk API base URL
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public';

/**
 * Make HTTPS request to Yandex.Disk API
 * @param {string} url - API URL
 * @returns {Promise<any>} Response data
 */
function makeApiRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Get latest modpack file from public Yandex.Disk folder
 * @returns {Promise<{path: string, name: string, version: string}>} Latest modpack info
 */
async function getLatestModpack() {
  try {
    log('Fetching latest modpack from Yandex.Disk...');

    // Get public folder contents
    const url = `${YANDEX_API_BASE}/resources?public_key=${encodeURIComponent(YANDEX_DISK_URL)}&limit=100`;
    const response = await makeApiRequest(url);

    if (!response._embedded || !response._embedded.items) {
      throw new Error('No files found in Yandex.Disk folder');
    }

    // Filter ZIP files with IIS/ИИС pattern
    const zipFiles = response._embedded.items.filter(item =>
      item.type === 'file' &&
      (item.name.toLowerCase().includes('иис') || item.name.toLowerCase().includes('iis')) &&
      item.name.toLowerCase().endsWith('.zip')
    );

    if (zipFiles.length === 0) {
      throw new Error('No modpack files found in Yandex.Disk folder');
    }

    // Sort by modification time (newest first)
    zipFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    const latestFile = zipFiles[0];
    const version = extractVersionFromFilename(latestFile.name);

    log(`Found latest modpack: ${latestFile.name} (${version})`);

    return {
      path: latestFile.path,
      name: latestFile.name,
      version: version,
      md5: latestFile.md5,
      sha256: latestFile.sha256,
      size: latestFile.size
    };

  } catch (error) {
    log(`Error getting latest modpack: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate MD5 hash of a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} MD5 hash
 */
function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verify downloaded file integrity
 * @param {string} filePath - Path to downloaded file
 * @param {number} downloadedBytes - Number of bytes downloaded
 * @param {Object} options - Verification options
 */
async function verifyDownload(filePath, downloadedBytes, options) {
  // Check file size
  if (options.expectedSize && downloadedBytes !== options.expectedSize) {
    throw new Error(
      `File size mismatch: expected ${options.expectedSize} bytes, got ${downloadedBytes} bytes`
    );
  }

  // Verify MD5 hash
  if (options.expectedMD5) {
    log('Verifying file integrity (MD5)...');
    const actualMD5 = await calculateMD5(filePath);

    if (actualMD5 !== options.expectedMD5) {
      throw new Error(
        `MD5 hash mismatch: expected ${options.expectedMD5}, got ${actualMD5}`
      );
    }

    log('File integrity verified successfully!');
  }
}

/**
 * Download file from public Yandex.Disk
 * @param {string} filePath - File path in Yandex.Disk
 * @param {string} destPath - Destination file path
 * @param {Object} options - Download options
 * @param {string} options.expectedMD5 - Expected MD5 hash for verification
 * @param {number} options.expectedSize - Expected file size in bytes
 * @returns {Promise<void>}
 */
async function downloadFile(filePath, destPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      log(`Getting download link for ${filePath}...`);

      // Get download link from Yandex.Disk API
      const apiUrl = `${YANDEX_API_BASE}/resources/download?public_key=${encodeURIComponent(YANDEX_DISK_URL)}&path=${encodeURIComponent(filePath)}`;
      const response = await makeApiRequest(apiUrl);

      if (!response.href) {
        throw new Error('Failed to get download link from Yandex.Disk');
      }

      const downloadUrl = response.href;
      log(`Got download URL, initiating connection...`);

      // Download file from the link
      https.get(downloadUrl, (downloadResponse) => {
        log(`Connection established, waiting for data stream...`);
        // Handle redirects
        if (downloadResponse.statusCode === 302 || downloadResponse.statusCode === 301) {
          const redirectUrl = downloadResponse.headers.location;
          log('Following redirect...');

          https.get(redirectUrl, (redirectResponse) => {
            const dest = fs.createWriteStream(destPath);
            let downloadedBytes = 0;

            redirectResponse
              .on('data', (chunk) => {
                if (downloadedBytes === 0) {
                  log(`Data stream started, downloading...`);
                }
                downloadedBytes += chunk.length;
                // Log progress every 10MB
                if (downloadedBytes % (10 * 1024 * 1024) < chunk.length) {
                  log(`Downloaded: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`);
                }
              })
              .on('end', async () => {
                log(`Download completed: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`);

                // Verify download
                try {
                  await verifyDownload(destPath, downloadedBytes, options);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              })
              .on('error', (err) => {
                log(`Download error: ${err.message}`);
                reject(err);
              })
              .pipe(dest);
          }).on('error', reject);

          return;
        }

        const dest = fs.createWriteStream(destPath);
        let downloadedBytes = 0;

        downloadResponse
          .on('data', (chunk) => {
            if (downloadedBytes === 0) {
              log(`Data stream started, downloading...`);
            }
            downloadedBytes += chunk.length;
            // Log progress every 10MB
            if (downloadedBytes % (10 * 1024 * 1024) < chunk.length) {
              log(`Downloaded: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`);
            }
          })
          .on('end', async () => {
            log(`Download completed: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`);

            // Verify download
            try {
              await verifyDownload(destPath, downloadedBytes, options);
              resolve();
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (err) => {
            log(`Download error: ${err.message}`);
            reject(err);
          })
          .pipe(dest);

      }).on('error', (error) => {
        log(`Error downloading file: ${error.message}`);
        reject(error);
      });

    } catch (error) {
      log(`Error getting download link: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Check if new version is available
 * @param {string} currentVersion - Current version string
 * @returns {Promise<{hasUpdate: boolean, latestVersion: string, filePath: string}>}
 */
async function checkForUpdate(currentVersion) {
  try {
    const latestModpack = await getLatestModpack();

    const hasUpdate = currentVersion !== latestModpack.version;

    return {
      hasUpdate: hasUpdate,
      latestVersion: latestModpack.version,
      filePath: latestModpack.path,
      fileName: latestModpack.name,
      md5: latestModpack.md5,
      sha256: latestModpack.sha256,
      size: latestModpack.size
    };

  } catch (error) {
    log(`Error checking for update: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getLatestModpack,
  downloadFile,
  checkForUpdate
};
