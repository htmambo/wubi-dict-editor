const path = require('path');
const { readFileSync } = require('fs');

try {
  require('dotenv').config();
} catch {
  // dotenv 为可选依赖，未安装时直接使用系统环境变量
}

const { version: appVersion } = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

const displayName = '五笔码表助手';
const iconBase = path.join(__dirname, 'assets/img/appIcon/appIcon');
const entitlements = path.join(__dirname, 'entitlements.mac.plist');
const hasAppleCert = Boolean(process.env.APPLE_SIGNING_IDENTITY);

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    appVersion,
    // 使用 ASCII 名称作为 .app / .exe，避免中文路径导致签名与 Gatekeeper 异常
    name: 'WubiDictEditor',
    executableName: 'WubiDictEditor',
    appBundleId: 'cn.kylebing.WubiDictEditor',
    appCopyright: 'kylebing@163.com',
    icon: iconBase,
    asar: {
        // Worker 文件必须以原始文件形式打包，不能放进 asar 虚拟文件系统
        // 否则 new Worker(workerPath) 在渲染进程内无法加载（Web Worker 不支持 asar）
        // packager 使用 minimatch glob；**/* 匹配任意层级
        unpack: '**/{dictParseWorker,yamlSerializeWorker}.js',
    },
    overwrite: true,
    extendInfo: {
      CFBundleDisplayName: displayName,
      CFBundleName: displayName,
      CFBundleLocalizations: ['zh_CN', 'en'],
    },
    win32metadata: {
      ProductName: '五笔码表助手',
      CompanyName: 'kylebing.cn',
      FileDescription: '五笔码表助手 for 小狼毫',
    },
    ...(process.platform === 'darwin'
      ? hasAppleCert
        ? {
            osxSign: {
              identity: process.env.APPLE_SIGNING_IDENTITY,
              hardenedRuntime: true,
              entitlements,
              'entitlements-inherit': entitlements,
            },
            ...(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD
              ? {
                  osxNotarize: {
                    tool: 'notarytool',
                    appleId: process.env.APPLE_ID,
                    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
                    teamId: process.env.APPLE_TEAM_ID,
                  },
                }
              : {}),
          }
        : {
            // 无 Apple 开发者证书：ad-hoc 签名，本机可运行；分发需用户清除隔离属性
            osxSign: {
              identity: '-',
            },
          }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        title: displayName,
        background: path.join(__dirname, 'assets/img/tool_panel_open.png'),
        format: 'ULFO',
        iconSize: 80,
        contents: (opts) => [
          {
            x: 130,
            y: 220,
            type: 'file',
            path: opts.appPath,
            name: `${displayName}.app`,
          },
          { x: 410, y: 220, type: 'link', path: '/Applications' },
        ],
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'WubiDictEditor',
        setupIcon: path.join(__dirname, 'assets/img/appIcon/appIcon.ico'),
        authors: 'KyleBing',
        description: '五笔码表管理工具',
        // 安装包显示名仍用中文
        title: displayName,
      },
    },
    // 注意：Arch 系（manjaro/arch）无 dpkg/fakeroot/rpmbuild，
    // 但 Debian/Deepin/Ubuntu 上可用 maker-deb 出 .deb。
    // maker-deb 在缺少 dpkg 时会抛错，由调用方（pack-debian.sh）决定是否调用
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        // 显式指定 bin：electron-installer-debian 默认从 package.json#name 推导（=WubiDictEditor），
        // 而 packagerConfig.executableName 才是真正的可执行文件名（WubiDictEditor）。
        // 不指定会触发：could not find the Electron app binary at "…/WubiDictEditor"
        bin: 'WubiDictEditor',
        // .desktop 文件和 apt 元数据使用中文显示名（与 macOS/Windows 的 CFBundleDisplayName/title 对齐）
        productName: displayName,
        description: displayName,
        // 多分辨率 hicolor 图标：electron-installer-debian 拿到对象后会按 resolution 装到
        // /usr/share/icons/hicolor/<resolution>/apps/<appIdentifier>.png
        // 项目里只有 .ico / .icns，提交 appIcon-<size>.png 后才能让 Linux 桌面显示正确图标
        icon: {
          '16x16':   `${iconBase}-16.png`,
          '32x32':   `${iconBase}-32.png`,
          '48x48':   `${iconBase}-48.png`,
          '64x64':   `${iconBase}-64.png`,
          '128x128': `${iconBase}-128.png`,
          '256x256': `${iconBase}-256.png`,
        },
        options: {
          maintainer: 'kylebing@163.com',
          homepage: 'https://github.com/KyleBing/wubi-dict-editor',
          // 自定义 .desktop 模板：注入 StartupWMClass，让任务栏/启动器/Alt+Tab 能匹配运行中的窗口
          desktopTemplate: path.join(__dirname, 'scripts/WubiDictEditor.desktop.ejs'),
          scripts: {
            // postinst 在「configure / triggered」阶段刷新图标与 .desktop 缓存，
            // 否则新装的图标在 GNOME / KDE / XFCE 桌面里看不到或显示为空白。
            postinst: path.join(__dirname, 'scripts/deb-postinst.sh'),
          },
        },
      },
    },
    // Linux 通用 zip（所有 Linux 发行版都可解包）
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux'],
    },
  ],
  hooks: {
    postMake: async (_forgeConfig, makeResults) => {
      makeResults.forEach((result) => {
        console.log(`\n✅ [${result.platform}/${result.arch}]`);
        result.artifacts.forEach((artifact) => console.log(`   ${artifact}`));
      });

      if (process.platform === 'darwin' && !hasAppleCert) {
        console.log('\n⚠️  macOS 未配置正式签名（.env 中 APPLE_SIGNING_IDENTITY）');
        console.log('   用户首次打开若被拦截，请任选其一：');
        console.log('   1. 右键 app → 打开');
        console.log('   2. 终端执行: xattr -cr "/path/to/WubiDictEditor.app"');
        console.log('   正式分发请配置 .env.example 中的 Apple 签名与公证\n');
      }

      return makeResults;
    },
  },
};
