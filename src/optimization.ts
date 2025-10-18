import { exec } from '@actions/exec';
import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';
import { BuildResult } from './types/GodotExport';
import { APPLY_WASM_OPT, WASM_OPT_LEVEL, APPLY_BROTLI, GODOT_WORKING_PATH } from './constants';

const BINARYEN_VERSION = '119'; // Latest stable version as of writing

/**
 * Applies post-processing optimizations to exported builds.
 * This includes wasm-opt for Web builds and Brotli compression.
 */
async function applyPostProcessingOptimizations(buildResults: BuildResult[]): Promise<void> {
  if (!APPLY_WASM_OPT && !APPLY_BROTLI) {
    return;
  }

  for (const buildResult of buildResults) {
    const isWebBuild = isWebExport(buildResult);

    if (isWebBuild) {
      core.startGroup(`🔧 Optimizing Web export "${buildResult.preset.name}"`);

      if (APPLY_WASM_OPT) {
        await applyWasmOpt(buildResult);
      }

      if (APPLY_BROTLI) {
        await applyBrotliCompression(buildResult);
      }

      core.endGroup();
    }
  }
}

/**
 * Determines if a build result is a Web export by checking the platform.
 */
function isWebExport(buildResult: BuildResult): boolean {
  const platform = buildResult.preset.platform?.toLowerCase() || '';
  return platform === 'web' || platform === 'html5' || platform === 'javascript';
}

/**
 * Applies wasm-opt optimization to WebAssembly files in the build directory.
 */
async function applyWasmOpt(buildResult: BuildResult): Promise<void> {
  core.info(`Applying wasm-opt with optimization level ${WASM_OPT_LEVEL}`);

  // Ensure wasm-opt is available
  await ensureWasmOptAvailable();

  // Find all .wasm files in the build directory
  const wasmFiles = fs
    .readdirSync(buildResult.directory)
    .filter(file => file.endsWith('.wasm'))
    .map(file => path.join(buildResult.directory, file));

  if (wasmFiles.length === 0) {
    core.warning('No .wasm files found in the build directory. Skipping wasm-opt.');
    return;
  }

  for (const wasmFile of wasmFiles) {
    const originalSize = fs.statSync(wasmFile).size;
    const tempFile = wasmFile + '.tmp';

    core.info(`Optimizing ${path.basename(wasmFile)}...`);

    try {
      // Run wasm-opt on the file
      await exec('wasm-opt', [
        wasmFile,
        '-o',
        tempFile,
        '--all',
        '--post-emscripten',
        WASM_OPT_LEVEL,
      ]);

      // Replace original with optimized version
      fs.renameSync(tempFile, wasmFile);

      const newSize = fs.statSync(wasmFile).size;
      const reduction = ((originalSize - newSize) / originalSize) * 100;
      core.info(
        `✅ Optimized ${path.basename(wasmFile)}: ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${reduction.toFixed(1)}% reduction)`,
      );
    } catch (error) {
      core.warning(`Failed to optimize ${path.basename(wasmFile)}: ${error}`);
      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

/**
 * Ensures wasm-opt is available by checking if it's installed or downloading Binaryen.
 */
async function ensureWasmOptAvailable(): Promise<void> {
  try {
    // Check if wasm-opt is already available
    await exec('wasm-opt', ['--version'], { silent: true });
    core.info('✅ wasm-opt is already available');
  } catch (error) {
    core.info('wasm-opt not found. Downloading Binaryen...');
    await downloadBinaryen();
  }
}

/**
 * Downloads and extracts Binaryen to make wasm-opt available.
 */
async function downloadBinaryen(): Promise<void> {
  const binaryenDir = path.join(GODOT_WORKING_PATH, 'binaryen');
  const binPath = path.join(binaryenDir, 'bin');

  // Determine platform-specific download URL
  let platform = 'linux';
  let ext = 'tar.gz';
  if (process.platform === 'darwin') {
    platform = 'macos';
  } else if (process.platform === 'win32') {
    platform = 'windows';
    ext = 'tar.gz';
  }

  const filename = `binaryen-version_${BINARYEN_VERSION}-x86_64-${platform}.${ext}`;
  const downloadUrl = `https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/${filename}`;
  const downloadPath = path.join(GODOT_WORKING_PATH, filename);

  core.info(`Downloading Binaryen from ${downloadUrl}`);
  await exec('wget', ['-nv', downloadUrl, '-O', downloadPath]);

  core.info('Extracting Binaryen...');
  await exec('tar', ['-xzf', downloadPath, '-C', GODOT_WORKING_PATH]);

  // Move to consistent directory name
  const extractedDir = path.join(
    GODOT_WORKING_PATH,
    `binaryen-version_${BINARYEN_VERSION}`,
  );
  if (fs.existsSync(extractedDir)) {
    fs.renameSync(extractedDir, binaryenDir);
  }

  // Add to PATH
  core.addPath(binPath);
  core.info(`✅ Binaryen installed to ${binaryenDir}`);

  // Clean up downloaded file
  fs.unlinkSync(downloadPath);
}

/**
 * Applies Brotli compression to Web export files (.wasm and .pck).
 */
async function applyBrotliCompression(buildResult: BuildResult): Promise<void> {
  core.info('Applying Brotli compression to Web export files');

  // Ensure brotli is available
  try {
    await exec('brotli', ['--version'], { silent: true });
  } catch (error) {
    core.warning('Brotli is not installed. Installing...');
    if (process.platform === 'linux') {
      await exec('sudo', ['apt-get', 'update', '-qq']);
      await exec('sudo', ['apt-get', 'install', '-y', 'brotli']);
    } else if (process.platform === 'darwin') {
      await exec('brew', ['install', 'brotli']);
    } else {
      core.warning('Cannot install Brotli on this platform. Skipping Brotli compression.');
      return;
    }
  }

  // Find files to compress (.wasm and .pck)
  const filesToCompress = fs
    .readdirSync(buildResult.directory)
    .filter(file => file.endsWith('.wasm') || file.endsWith('.pck'))
    .map(file => path.join(buildResult.directory, file));

  if (filesToCompress.length === 0) {
    core.warning('No .wasm or .pck files found for Brotli compression.');
    return;
  }

  for (const file of filesToCompress) {
    const originalSize = fs.statSync(file).size;
    const compressedFile = file + '.br';

    core.info(`Compressing ${path.basename(file)} with Brotli...`);

    try {
      // Compress with maximum compression level (11)
      await exec('brotli', ['-q', '11', '-o', compressedFile, file]);

      const compressedSize = fs.statSync(compressedFile).size;
      const reduction = ((originalSize - compressedSize) / originalSize) * 100;
      core.info(
        `✅ Compressed ${path.basename(file)}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${reduction.toFixed(1)}% reduction)`,
      );
    } catch (error) {
      core.warning(`Failed to compress ${path.basename(file)}: ${error}`);
    }
  }
}

/**
 * Formats bytes to a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { applyPostProcessingOptimizations };
