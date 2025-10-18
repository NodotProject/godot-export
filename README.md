# Godot Export
A workflow action to automatically export your Godot games. Supports standard and **Mono** builds!

## Contents
- [How it works](#how-it-works)
- [Setting Up Export Presets](#setting-up-export-presets)
- [Workflow Configuration](#workflow-configuration)
  - [Example Configuration](#example-configuration)
  - [Mono Builds](#mono-builds)
  - [Android Builds](#android-builds)
- [Build Size Optimization](#build-size-optimization)
  - [Web Export Optimization](#web-export-optimization)
  - [Custom Template Compilation](#custom-template-compilation)
  - [Custom Build Profiles](#custom-build-profiles)
- [Custom Editor Settings](#custom-editor-settings)
- [Tips](#tips)
  - [Supply custom editor settings](#supplying-a-custom-editor-settings-file)
  - [Setup Windows Icons](#setup-windows-icons)
- [Example Projects](#example-projects)

## How it Works

This action automatically reads your `export_presets.cfg` file to determine which builds to make. Whenever this action runs each of your defined exports will run. The resulting executables can then be optionally attached to a release. See [the example configuration](#example-configuration).

## Setting Up Export Presets
Define at least 1 export preset by going to `Project -> Export` in the Godot editor and creating a configuration. Set the file name in the "Export Path" box. This is how the action knows how to name your binary. Notice how the below image has "win.exe" in the "Export Path" for my windows export. Your executables can be named however you like, as long as they include the appropriate extension `.exe`, `.x86_64`, etc.
![](docs/exports.png)

**NOTE**: The file extension for the Mac OSX export must be anything but `.zip` for versions of Godot before 3.2. If the Mac OSX export file extension is `.zip` for a Godot version earlier than 3.2, then your project source files will be exported instead of a Mac application. [This was a known issue with the Godot command line export](https://github.com/godotengine/godot/issues/23073). For reference, I used a `.z` file extension to make it work for my Mac OSX builds.

## Workflow Configuration

### Action Inputs

| Input Name                            | Description                                                                                                                                                                                                                                                                          | Type      | Default | Required |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|---------|----------|
| `godot_executable_download_url`       | The **Linux Headless** version of Godot that you want to use to export your project. If you do not use the Linux Headless version exporting will fail.                                                                                                                               | `string`  |         | Yes      |
| `godot_export_templates_download_url` | The link to the `.tpz` archive of export templates.                                                                                                                                                                                                                                  | `string`  |         | Yes      |
| `relative_project_path`               | The relative path to the directory containing your `project.godot` file. If your `project.godot` file is at the root of your repository then this value should be `./`. Do _not_ include `project.godot` as part of this path.                                                       | `string`  |         | Yes      |
| `cache`                               | Use the GitHub Actions workflow cache to cache the Godot export templates and Godot executable. Helps speed up builds by not having to download them every time.                                                                                                                     | `boolean` | `false` | No       |
| `export_debug`                        | Export builds in debug mode.                                                                                                                                                                                                                                                         | `boolean` | `false` | No       |
| `archive_output`                      | Archive each export into a `.zip` file.                                                                                                                                                                                                                                              | `boolean` | `false` | No       |
| `archive_root_folder`                 | Place exported files under a root folder when archiving, rather than placing the files themselves at the root of the archive.                                                                                                                                                        | `boolean` | `false` | No       |
| `relative_export_path`                | Move exports to the provided directory relative to the root of the Git repository. **NOTE**: This setting is overridden by `use_preset_export_path`.                                                                                                                                 | `string`  | `''`    | No       |
| `use_preset_export_path`              | Move exports to the directory defined in `export_presets.cfg` relative to `relative_project_path`. In other words, exports will use the export path specified in the export preset in relation to the location of the `project.godot` file. Prioritized over `relative_export_path`. | `boolean` | `false` | No       |
| `wine_path`                           | The absolute path to the wine binary. If specified, Godot will use this to run rcedit to update Windows exe icons. See the [setup Windows icons](#setup-windows-icons) example configuration.                                                                                        | `string`  | `''`    | No       |
| `verbose`                             | Use the `--verbose` flag when exporting.                                                                                                                                                                                                                                             | `boolean` | `false` | No       |
| `use_godot_3`                         | Build using Godot 3 executable. **NOTE**: `godot_executable_download_url` and `godot_export_templates_download_url` still need to be configured to download the correct version.                                                                                                     | `boolean` | `false` | No       |
| `export_as_pack`                      | Export project files as a .pck file                                                                                                                                                                                                                                                  | `boolean` | `false` | No       |
| `presets_to_export`                   | A comma-separated list of export presets to export. If not specified, all presets will be exported. EX: `Windows, Mac OSX, android`                                                                                                                                                  | `string`  | `''`    | No       |

### Build Size Optimization Options

| Input Name                            | Description                                                                                                                                                                                                                                                                          | Type      | Default | Required |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|---------|----------|
| `compile_custom_templates`            | Compile custom export templates from source with size optimization flags instead of using pre-built templates. This significantly increases build time (5-15 minutes) but allows for maximum size reduction. See [Custom Template Compilation](#custom-template-compilation).        | `boolean` | `false` | No       |
| `godot_source_download_url`           | The URL to download Godot source code (git repository or tarball). Required when `compile_custom_templates` is true.                                                                                                                                                                 | `string`  | `''`    | No       |
| `custom_build_profile_path`           | Path to a custom .py file containing SCons build configuration (optimize, lto, disable_3d, modules, etc.). Relative to the repository root. See [Custom Build Profiles](#custom-build-profiles).                                                                                     | `string`  | `''`    | No       |
| `custom_engine_config_path`           | Path to a custom .gdbuild file for engine compilation configuration (enables/disables specific nodes and resources). Relative to the repository root.                                                                                                                                | `string`  | `''`    | No       |
| `apply_wasm_opt`                      | Run wasm-opt on Web exports to optimize WebAssembly files. Binaryen will be installed automatically if not available. See [Web Export Optimization](#web-export-optimization).                                                                                                        | `boolean` | `false` | No       |
| `wasm_opt_level`                      | Optimization level for wasm-opt. Options: `-O`, `-O1`, `-O2`, `-O3`, `-O4`, `-Os`, `-Oz`. Default is `-Oz` (optimize for size).                                                                                                                                                      | `string`  | `'-Oz'` | No       |
| `apply_brotli`                        | Compress Web exports using Brotli compression (.br files). Only useful if your hosting platform supports Brotli decompression.                                                                                                                                                       | `boolean` | `false` | No       |


### Action Outputs

| Output Name         | Description                                                                                                                                                                                                       | Type     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `build_directory`   | The directory containing the raw (unarchived) exported files. Note that the inputs `relative_export_path` and `use_preset_export_path` do not change this output value.                                           | `string` |
| `archive_directory` | The directory containing archived exports. This directory will be empty if `archive_output` is not set. Note that the inputs `relative_export_path` and `use_preset_export_path` do not change this output value. | `string` |


### Example Configuration
Below is a sample workflow configuration file utilizing this action. This example workflow could be defined in `.github/workflows/main.yml`. For more information about defining workflows see [the workflow docs](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/configuring-a-workflow).

This workflow will export your game when a tag is pushed, archive the files, and create a release containing the archives.

```yml
# Whenever a tag push matching pattern "v*" then run the job
on: 
  push:
    tags:
      - "v*"

jobs:
  # job id, can be anything
  export_game:
    # Always use ubuntu-latest for this action
    runs-on: ubuntu-latest
    # Add permission for release creation. Can be made narrower according to your needs
    permissions:
      contents: write
    # Job name, can be anything
    name: Export Game
    steps:
      # Always include the checkout step so that 
      # your project is available for Godot to export
    - name: checkout
      uses: actions/checkout@v5
  
    - name: export game
      id: export
      # Use latest version (see releases for all versions)
      uses: NodotProject/godot-export@v7.0.0
      with:
        # Defining all the required inputs
        godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.0/Godot_v4.0-stable_linux.x86_64.zip
        godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.0/Godot_v4.0-stable_export_templates.tpz
        relative_project_path: ./
        archive_output: true

      # This release action has worked well for me. However, you can most likely use any release action of your choosing.
      # https://github.com/ncipollo/release-action
    - name: create release
      uses: ncipollo/release-action@v1.18.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        generateReleaseNotes: true
        tag: ${{ github.ref_name }}
        artifacts: ${{ steps.export.outputs.archive_directory }}/*
```

## Custom Editor Settings
Some Godot configurations are editor-based and not project-based. This includes items like Android paths. This repository provides a [base editor settings](./dist/editor_settings-4.tres) that will be used by default when exporting your games. However, you can supply a custom editor settings configuration file by simply copying your custom editor settings file to `~/.config/godot/editor_settings-4.tres` _before_ this action runs. This action will not overwrite an existing `editor_settings-4.tres` file.

## Mono Builds
Mono builds do not require additional configuration. However, if you want to change the build tool that is used (currently defaults to `dotnet cli`) then you need to [supply your own editor settings](#custom-editor-settings) with the line `mono/builds/build_tool`. This value corresponds to the build tool dropdown in the editor settings window at `Editor Settings -> Mono -> Builds -> Build Tool`. You can look at your local `editor_settings-3.tres` to see what this value should be if you want to match the build tool used during local development.

## Android Builds
For Android builds, use the [setup-android](https://github.com/android-actions/setup-android) action before this one in your workflow. [The default editor settings file](./dist/editor_settings-3.tres) used by this action already provides a default path to the Android SDK. If your path is different then [supply your own editor settings file](#custom-editor-settings).


## Build Size Optimization

This action supports comprehensive build size optimization based on the [Godot minification guide](https://popcar.bearblog.dev/how-to-minify-godots-build-size/). You can significantly reduce your exported game size using two approaches:

### Web Export Optimization

For Web exports, you can apply post-processing optimizations that work with any export templates:

#### Using wasm-opt

Enable `apply_wasm_opt` to optimize WebAssembly files. This typically reduces Web build sizes by 5-10% with minimal performance impact:

```yml
- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
    godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
    relative_project_path: ./
    apply_wasm_opt: true
    wasm_opt_level: '-Oz'  # Optimize for size
```

#### Using Brotli Compression

Enable `apply_brotli` to create `.br` compressed versions of your Web exports. **Note**: This only works if your hosting platform supports Brotli decompression (most modern CDNs do, but itch.io does not):

```yml
- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
    godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
    relative_project_path: ./
    apply_wasm_opt: true
    apply_brotli: true
```

### Custom Template Compilation

For maximum size reduction (50-70% smaller builds), you can compile custom export templates from Godot source code with size optimization flags. **Note**: This increases build time by 5-15 minutes per platform.

#### Basic Custom Template Compilation

```yml
- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
    godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
    relative_project_path: ./
    compile_custom_templates: true
    godot_source_download_url: https://github.com/godotengine/godot/archive/refs/tags/4.5-stable.tar.gz
```

This will compile templates with default optimization settings. For more control, use custom build profiles.

### Custom Build Profiles

Create a Python file (e.g., `custom_build.py`) in your repository with SCons build configuration:

```python
# custom_build.py - Optimized build profile for 2D games
target="template_release"
debug_symbols="no"
optimize="size_extra"  # Godot 4.5+ only, otherwise use "size"
lto="full"             # Full link-time optimization (slower build, smaller size)

# Disable 3D if you're making a 2D game
disable_3d="yes"
disable_advanced_gui="yes"

# Disable unnecessary features
deprecated="no"
vulkan="no"       # Using Compatibility renderer (OpenGL)
use_volk="no"
openxr="no"       # No VR/AR
minizip="no"      # No ZIP archive support
graphite="no"     # No SIL Graphite fonts

# Disable navigation if not needed
disable_navigation_2d="yes"
disable_navigation_3d="yes"
disable_xr="yes"

# Module configuration - disable all, enable only what you need
modules_enabled_by_default="no"
module_gdscript_enabled="yes"
module_text_server_fb_enabled="yes"  # Fallback text server (no RTL support)
module_freetype_enabled="yes"
module_svg_enabled="yes"
module_webp_enabled="yes"
module_godot_physics_2d_enabled="yes"  # Enable if you use 2D physics
```

Then reference it in your workflow:

```yml
- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
    godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
    relative_project_path: ./
    compile_custom_templates: true
    godot_source_download_url: https://github.com/godotengine/godot/archive/refs/tags/4.5-stable.tar.gz
    custom_build_profile_path: ./custom_build.py
```

#### Using Engine Compilation Configuration

For even more granular control, you can disable specific nodes and resources using Godot's `.gdbuild` files. Create a build configuration in your project:

1. In Godot Editor: `Project > Tools > Engine Compilation Configuration Editor`
2. Use "Auto-detect" to disable unused classes (you may need to manually re-enable some core classes)
3. Save as `custom_engine.gdbuild`
4. Commit the file to your repository

Then use it in your workflow:

```yml
- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
    godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
    relative_project_path: ./
    compile_custom_templates: true
    godot_source_download_url: https://github.com/godotengine/godot/archive/refs/tags/4.5-stable.tar.gz
    custom_build_profile_path: ./custom_build.py
    custom_engine_config_path: ./custom_engine.gdbuild
    apply_wasm_opt: true  # Can combine with post-processing!
```

#### Complete Optimization Example

Here's a complete workflow that combines custom template compilation with post-processing for maximum size reduction:

```yml
on:
  push:
    tags:
      - "v*"

jobs:
  export_optimized_game:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    name: Export Optimized Game
    steps:
      - name: checkout
        uses: actions/checkout@v5

      - name: export game
        id: export
        uses: NodotProject/godot-export@v7.0.0
        with:
          godot_executable_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_linux.x86_64.zip
          godot_export_templates_download_url: https://downloads.tuxfamily.org/godotengine/4.5/Godot_v4.5-stable_export_templates.tpz
          relative_project_path: ./
          archive_output: true

          # Custom template compilation
          compile_custom_templates: true
          godot_source_download_url: https://github.com/godotengine/godot/archive/refs/tags/4.5-stable.tar.gz
          custom_build_profile_path: ./custom_build.py
          custom_engine_config_path: ./custom_engine.gdbuild

          # Post-processing optimization
          apply_wasm_opt: true
          wasm_opt_level: '-Oz'
          apply_brotli: true

      - name: create release
        uses: ncipollo/release-action@v1.18.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          generateReleaseNotes: true
          tag: ${{ github.ref_name }}
          artifacts: ${{ steps.export.outputs.archive_directory }}/*
```

**Expected Results**: With full optimization, you can typically achieve:
- **Web builds**: 42MB → 16MB (uncompressed), 8.7MB → 3.6MB (compressed), or 2.7MB with Brotli
- **Desktop builds**: 93MB → 21MB (uncompressed), 30MB → 7.2MB (compressed)

For more details on optimization strategies, see the [comprehensive guide](.ai/minify_build.md).

## Tips

### Supplying a Custom Editor Settings File
Include the following step before this action. For example:
```yml
# Above this line is the workflow job setup
- name: use custom editor settings
  run: |
    mkdir -p ~/.config/godot
    cp ~/path/to/my/editor_settings-3.tres ~/.config/godot/
# Note that you can use ${{ github.workspace }} to get the default location of your checked-out repository
# Use NodotProject/godot-export sometime after the above step
```

### Setup Windows Icons
In order to configure this action to update your game's Windows exe icon, include the following configuration:
```yml
- name: install wine
  id: wine_install
  run: |
    sudo dpkg --add-architecture i386
    sudo apt update
    sudo apt install -y wine64 wine32
    echo "WINE_PATH=$(which wine)" >> $GITHUB_OUTPUT

# Any other intermediate steps can go here

- name: export game
  uses: NodotProject/godot-export@v7.0.0
  with:
    # ...supply your other options here
    wine_path: ${{ steps.wine_install.outputs.WINE_PATH }} # set the wine path here which is the output of the wine_install step
```

### Example Projects
See the [example projects](./examples/README.md) for more info.
