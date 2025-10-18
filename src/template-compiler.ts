import { exec } from '@actions/exec';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from 'path';
import * as fs from 'fs';
import {
  COMPILE_CUSTOM_TEMPLATES,
  GODOT_SOURCE_DOWNLOAD_URL,
  CUSTOM_BUILD_PROFILE_PATH,
  CUSTOM_ENGINE_CONFIG_PATH,
  GODOT_WORKING_PATH,
  GODOT_EXPORT_TEMPLATES_PATH,
} from './constants';

const GODOT_SOURCE_DIR = path.join(GODOT_WORKING_PATH, 'godot-source');

/**
 * Compiles custom export templates from Godot source with optimization flags.
 * This is only executed if COMPILE_CUSTOM_TEMPLATES is true.
 */
async function compileCustomTemplatesIfNeeded(): Promise<void> {
  if (!COMPILE_CUSTOM_TEMPLATES) {
    return;
  }

  core.startGroup('🔨 Compiling Custom Export Templates');

  // Validate required inputs
  if (!GODOT_SOURCE_DOWNLOAD_URL) {
    throw new Error('godot_source_download_url is required when compile_custom_templates is enabled');
  }

  try {
    // Install build dependencies
    await installBuildDependencies();

    // Download Godot source
    await downloadGodotSource();

    // Get Godot version from source
    const godotVersion = await getGodotVersionFromSource();
    core.info(`Building templates for Godot version: ${godotVersion}`);

    // Prepare build profiles if provided
    const buildProfileArg = await prepareBuildProfile();
    const engineConfigArg = await prepareEngineConfig();

    // Compile templates for each platform needed
    await compileTemplates(godotVersion, buildProfileArg, engineConfigArg);

    core.info('✅ Custom templates compiled successfully');
  } catch (error) {
    core.setFailed(`Failed to compile custom templates: ${error}`);
    throw error;
  } finally {
    core.endGroup();
  }
}

/**
 * Installs build dependencies required for compiling Godot.
 */
async function installBuildDependencies(): Promise<void> {
  core.info('Installing build dependencies...');

  if (process.platform === 'linux') {
    core.info('Installing SCons and build tools on Linux');
    await exec('sudo', ['apt-get', 'update', '-qq']);
    await exec('sudo', [
      'apt-get',
      'install',
      '-y',
      'build-essential',
      'scons',
      'pkg-config',
      'libx11-dev',
      'libxcursor-dev',
      'libxinerama-dev',
      'libgl1-mesa-dev',
      'libglu-dev',
      'libasound2-dev',
      'libpulse-dev',
      'libudev-dev',
      'libxi-dev',
      'libxrandr-dev',
      'python3-pip',
    ]);
  } else if (process.platform === 'darwin') {
    core.info('Installing SCons on macOS');
    await exec('brew', ['install', 'scons']);
  } else {
    core.warning('Custom template compilation is primarily tested on Linux');
  }

  core.info('✅ Build dependencies installed');
}

/**
 * Downloads Godot source code from the provided URL.
 */
async function downloadGodotSource(): Promise<void> {
  core.info(`Downloading Godot source from ${GODOT_SOURCE_DOWNLOAD_URL}`);

  await io.mkdirP(GODOT_SOURCE_DIR);

  if (GODOT_SOURCE_DOWNLOAD_URL.endsWith('.git') || GODOT_SOURCE_DOWNLOAD_URL.includes('github.com')) {
    // Git repository
    core.info('Cloning Godot repository...');
    await exec('git', [
      'clone',
      '--depth',
      '1',
      GODOT_SOURCE_DOWNLOAD_URL,
      GODOT_SOURCE_DIR,
    ]);
  } else {
    // Assume it's a tarball
    const sourceTarball = path.join(GODOT_WORKING_PATH, 'godot-source.tar.gz');
    core.info('Downloading Godot source tarball...');
    await exec('wget', ['-nv', GODOT_SOURCE_DOWNLOAD_URL, '-O', sourceTarball]);

    core.info('Extracting Godot source...');
    await exec('tar', ['-xzf', sourceTarball, '-C', GODOT_WORKING_PATH]);

    // Find the extracted directory and rename it
    const extractedDirs = fs
      .readdirSync(GODOT_WORKING_PATH)
      .filter(
        file =>
          file.startsWith('godot') &&
          file !== 'godot-source' &&
          fs.statSync(path.join(GODOT_WORKING_PATH, file)).isDirectory(),
      );

    if (extractedDirs.length > 0) {
      const extractedDir = path.join(GODOT_WORKING_PATH, extractedDirs[0]);
      fs.renameSync(extractedDir, GODOT_SOURCE_DIR);
    }

    // Clean up tarball
    fs.unlinkSync(sourceTarball);
  }

  core.info('✅ Godot source downloaded');
}

/**
 * Gets the Godot version from the source code by reading version.py.
 */
async function getGodotVersionFromSource(): Promise<string> {
  const versionFile = path.join(GODOT_SOURCE_DIR, 'version.py');

  if (!fs.existsSync(versionFile)) {
    throw new Error('Could not find version.py in Godot source');
  }

  const versionContent = fs.readFileSync(versionFile, 'utf-8');

  // Parse version.py to extract version numbers
  const majorMatch = versionContent.match(/major\s*=\s*(\d+)/);
  const minorMatch = versionContent.match(/minor\s*=\s*(\d+)/);
  const patchMatch = versionContent.match(/patch\s*=\s*(\d+)/);
  const statusMatch = versionContent.match(/status\s*=\s*"([^"]*)"/);

  if (!majorMatch || !minorMatch) {
    throw new Error('Could not parse version from version.py');
  }

  const major = majorMatch[1];
  const minor = minorMatch[1];
  const patch = patchMatch ? patchMatch[1] : '0';
  const status = statusMatch ? statusMatch[1] : 'stable';

  return `${major}.${minor}.${patch}.${status}`;
}

/**
 * Prepares the build profile argument if a custom profile is provided.
 */
async function prepareBuildProfile(): Promise<string> {
  if (!CUSTOM_BUILD_PROFILE_PATH) {
    return '';
  }

  const profilePath = path.resolve(CUSTOM_BUILD_PROFILE_PATH);

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Custom build profile not found at ${profilePath}`);
  }

  // Copy to Godot source directory
  const targetPath = path.join(GODOT_SOURCE_DIR, path.basename(profilePath));
  fs.copyFileSync(profilePath, targetPath);

  core.info(`Using custom build profile: ${path.basename(profilePath)}`);
  return `profile=${path.basename(profilePath)}`;
}

/**
 * Prepares the engine configuration argument if a custom config is provided.
 */
async function prepareEngineConfig(): Promise<string> {
  if (!CUSTOM_ENGINE_CONFIG_PATH) {
    return '';
  }

  const configPath = path.resolve(CUSTOM_ENGINE_CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Custom engine config not found at ${configPath}`);
  }

  // Copy to Godot source directory
  const targetPath = path.join(GODOT_SOURCE_DIR, path.basename(configPath));
  fs.copyFileSync(configPath, targetPath);

  core.info(`Using custom engine config: ${path.basename(configPath)}`);
  return `build_profile=${path.basename(configPath)}`;
}

/**
 * Compiles export templates for the needed platforms.
 */
async function compileTemplates(
  godotVersion: string,
  buildProfileArg: string,
  engineConfigArg: string,
): Promise<void> {
  // Determine which platforms to build based on common CI needs
  // For now, we'll build Web and Linux as they're most common for size optimization
  const platforms = [
    { platform: 'web', target: 'template_release' },
    { platform: 'linuxbsd', target: 'template_release' },
  ];

  for (const { platform, target } of platforms) {
    core.info(`Compiling ${platform} ${target} template...`);

    const sconsArgs = ['platform=' + platform, 'target=' + target];

    if (buildProfileArg) {
      sconsArgs.push(buildProfileArg);
    }

    if (engineConfigArg) {
      sconsArgs.push(engineConfigArg);
    }

    const startTime = Date.now();

    try {
      await exec('scons', sconsArgs, {
        cwd: GODOT_SOURCE_DIR,
      });

      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      core.info(`✅ Compiled ${platform} template in ${duration} minutes`);
    } catch (error) {
      core.error(`Failed to compile ${platform} template: ${error}`);
      throw error;
    }
  }

  // Install templates to the expected location
  await installCompiledTemplates(godotVersion);
}

/**
 * Copies compiled templates to the Godot templates directory.
 */
async function installCompiledTemplates(godotVersion: string): Promise<void> {
  core.info('Installing compiled templates...');

  const templatesDir = path.join(GODOT_EXPORT_TEMPLATES_PATH, godotVersion);
  await io.mkdirP(templatesDir);

  // Find and copy compiled templates from the bin directory
  const binDir = path.join(GODOT_SOURCE_DIR, 'bin');

  if (!fs.existsSync(binDir)) {
    throw new Error('No bin directory found. Compilation may have failed.');
  }

  const binFiles = fs.readdirSync(binDir);

  for (const file of binFiles) {
    const sourcePath = path.join(binDir, file);

    // Rename templates to match Godot's expected naming convention
    let targetName = file;

    // Map compiled binary names to template names
    if (file.includes('web')) {
      targetName = 'web_release.zip';
    } else if (file.includes('linuxbsd') || file.includes('x11')) {
      if (file.includes('64')) {
        targetName = 'linux_release.x86_64';
      } else {
        targetName = 'linux_release.x86_32';
      }
    }

    const targetPath = path.join(templatesDir, targetName);
    fs.copyFileSync(sourcePath, targetPath);
    core.info(`Installed template: ${targetName}`);
  }

  core.info(`✅ Templates installed to ${templatesDir}`);
}

export { compileCustomTemplatesIfNeeded };
