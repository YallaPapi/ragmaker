const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'RAGMaker Desktop',
    executableName: 'ragmaker-desktop',
    icon: path.join(__dirname, '..', 'assets', 'icon'),
    appBundleId: 'com.ragmaker.desktop',
    appCategoryType: 'public.app-category.productivity',
    protocols: [
      {
        name: 'RAGMaker Protocol',
        schemes: ['ragmaker']
      }
    ],
    // Code signing
    osxSign: {
      identity: process.env.APPLE_IDENTITY,
      'hardened-runtime': true,
      'gatekeeper-assess': false,
      entitlements: path.join(__dirname, 'entitlements.mac.plist'),
      'entitlements-inherit': path.join(__dirname, 'entitlements.mac.plist')
    },
    osxNotarize: {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASS,
      teamId: process.env.APPLE_TEAM_ID
    },
    win32metadata: {
      CompanyName: 'RAGMaker Inc.',
      FileDescription: 'RAGMaker Desktop Application',
      OriginalFilename: 'ragmaker-desktop.exe',
      ProductName: 'RAGMaker Desktop',
      InternalName: 'RAGMaker Desktop'
    }
  },
  rebuildConfig: {},
  makers: [
    // Windows
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'ragmaker-desktop',
        authors: 'RAGMaker Inc.',
        description: 'Desktop application for RAGMaker',
        exe: 'ragmaker-desktop.exe',
        setupExe: 'RAGMaker-Desktop-Setup.exe',
        setupIcon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        loadingGif: path.join(__dirname, '..', 'assets', 'loading.gif'),
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
        signWithParams: '/a /fd SHA256 /tr http://timestamp.digicert.com /td SHA256'
      },
      platforms: ['win32']
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin']
    },
    {
      name: '@electron-forge/maker-wix',
      config: {
        language: 1033,
        manufacturer: 'RAGMaker Inc.',
        appUserModelId: 'com.ragmaker.desktop',
        shortName: 'RAGMaker',
        name: 'RAGMaker Desktop',
        description: 'Desktop application for RAGMaker',
        programFilesFolderName: 'RAGMaker Desktop',
        version: '3.0.0',
        arch: 'x64',
        ui: {
          chooseDirectory: true,
          images: {
            background: path.join(__dirname, '..', 'assets', 'wix-background.jpg'),
            banner: path.join(__dirname, '..', 'assets', 'wix-banner.jpg')
          }
        },
        features: {
          autoUpdate: true,
          autoLaunch: true
        },
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD
      },
      platforms: ['win32']
    },
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: path.join(__dirname, '..', 'assets', 'dmg-background.png'),
        icon: path.join(__dirname, '..', 'assets', 'icon.icns'),
        iconSize: 100,
        contents: [
          {
            x: 180,
            y: 170,
            type: 'file'
          },
          {
            x: 480,
            y: 170,
            type: 'link',
            path: '/Applications'
          }
        ],
        additionalDMGOptions: {
          window: {
            size: {
              width: 660,
              height: 400
            }
          }
        }
      },
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-pkg',
      config: {
        identity: process.env.APPLE_INSTALLER_IDENTITY || process.env.APPLE_IDENTITY
      },
      platforms: ['darwin']
    },
    // Linux
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'RAGMaker Inc.',
          homepage: 'https://ragmaker.com',
          description: 'Desktop application for RAGMaker - AI-powered document processing',
          productDescription: 'RAGMaker Desktop provides a powerful interface for managing and processing documents with AI-powered insights.',
          categories: ['Office', 'Productivity'],
          priority: 'optional',
          section: 'utils',
          depends: [
            'gconf2',
            'gconf-service',
            'libnotify4',
            'libappindicator1',
            'libxtst6',
            'libnss3'
          ],
          recommends: [
            'pulseaudio | libasound2'
          ],
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
          desktopTemplate: path.join(__dirname, '..', 'assets', 'desktop.ejs')
        }
      },
      platforms: ['linux']
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'ragmaker-desktop',
          summary: 'RAGMaker Desktop Application',
          description: 'Desktop application for RAGMaker - AI-powered document processing',
          homepage: 'https://ragmaker.com',
          license: 'MIT',
          requires: [
            'libnotify',
            'libappindicator',
            'libxtst',
            'nss'
          ],
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
          categories: [
            'Office',
            'Productivity'
          ]
        }
      },
      platforms: ['linux']
    },
    {
      name: '@electron-forge/maker-flatpak',
      config: {
        options: {
          id: 'com.ragmaker.Desktop',
          productName: 'RAGMaker Desktop',
          genericName: 'Document Processor',
          description: 'AI-powered document processing application',
          categories: ['Office', 'Productivity'],
          mimeType: ['text/plain', 'application/pdf'],
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
          base: 'org.electronjs.Electron2.BaseApp',
          baseVersion: '23.08',
          runtime: 'org.freedesktop.Platform',
          runtimeVersion: '23.08',
          sdk: 'org.freedesktop.Sdk',
          finishArgs: [
            '--share=ipc',
            '--socket=x11',
            '--socket=wayland',
            '--socket=pulseaudio',
            '--share=network',
            '--device=dri',
            '--filesystem=home'
          ],
          modules: [
            {
              name: 'ragmaker-desktop',
              buildsystem: 'simple',
              build_commands: [
                'cp -r * /app/',
                'chmod +x /app/ragmaker-desktop'
              ],
              sources: [
                {
                  type: 'dir',
                  path: '.'
                }
              ]
            }
          ]
        }
      },
      platforms: ['linux']
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'your-username',
          name: 'ragmaker'
        },
        prerelease: false,
        draft: false
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: path.join(__dirname, 'webpack.main.config.js'),
        renderer: {
          config: path.join(__dirname, 'webpack.renderer.config.js'),
          entryPoints: [
            {
              html: path.join(__dirname, '..', '..', 'renderer', 'index.html'),
              js: path.join(__dirname, '..', '..', 'renderer', 'index.js'),
              name: 'main_window',
              preload: {
                js: path.join(__dirname, '..', '..', 'preload.js')
              }
            }
          ]
        }
      }
    }
  ],
  hooks: {
    packageAfterCopy: async (config, buildPath, electronVersion, platform, arch) => {
      console.log('Running post-package hook...');
      // Add custom post-package logic here
    },
    generateAssets: async (config, platform, arch) => {
      console.log('Generating platform-specific assets...');
      // Add asset generation logic here
    }
  }
};