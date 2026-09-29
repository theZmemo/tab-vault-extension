import { readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const artifactsRoot = join(projectRoot, "artifacts");
const outputRoot = join(projectRoot, "store-assets");
const profilePath = join(
  tmpdir(),
  `tab-vault-store-assets-${Date.now().toString(36)}`,
);

async function imageData(path) {
  const content = await readFile(path);
  return `data:image/png;base64,${content.toString("base64")}`;
}

function screenshotMarkup({
  image,
  eyebrow,
  title,
  detail,
  points,
  accent,
}) {
  return `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            width: 1280px;
            height: 800px;
            margin: 0;
            overflow: hidden;
            background: #e9eef3;
            color: #182431;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
              "Microsoft YaHei", sans-serif;
          }
          body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 480px;
            align-items: center;
            gap: 64px;
            padding: 54px 76px;
          }
          main { align-self: center; }
          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            color: #506071;
            font-size: 21px;
            font-weight: 700;
          }
          .brand img {
            width: 48px;
            height: 48px;
            border-radius: 12px;
          }
          .eyebrow {
            margin-top: 72px;
            color: ${accent};
            font-size: 20px;
            font-weight: 750;
          }
          h1 {
            max-width: 570px;
            margin: 14px 0 18px;
            font-size: 48px;
            line-height: 1.16;
          }
          .detail {
            max-width: 560px;
            color: #526171;
            font-size: 22px;
            line-height: 1.6;
          }
          ul {
            display: grid;
            gap: 13px;
            margin: 30px 0 0;
            padding: 0;
            list-style: none;
          }
          li {
            display: flex;
            align-items: center;
            gap: 12px;
            color: #344352;
            font-size: 19px;
            font-weight: 650;
          }
          li::before {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: ${accent};
            content: "";
          }
          .product {
            width: 480px;
            height: 692px;
            overflow: hidden;
            border: 1px solid #c9d2dc;
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 18px 44px rgb(38 53 70 / 18%);
          }
          .product img {
            display: block;
            width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <main>
          <div class="brand">
            <img src="${logo}" alt="" />
            <span>Tab Vault · 标签资产库</span>
          </div>
          <div class="eyebrow">${eyebrow}</div>
          <h1>${title}</h1>
          <div class="detail">${detail}</div>
          <ul>${points.map((point) => `<li>${point}</li>`).join("")}</ul>
        </main>
        <div class="product"><img src="${image}" alt="" /></div>
      </body>
    </html>
  `;
}

await mkdir(outputRoot, { recursive: true });
const [logo, groupsImage, sleepImage] = await Promise.all([
  imageData(join(projectRoot, "public/icons/icon-128.png")),
  imageData(join(artifactsRoot, "group-overview.png")),
  imageData(join(artifactsRoot, "batch-sleep-dialog.png")),
]);

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    env: {
      ...process.env,
      HOME: profilePath,
    },
    args: ["--disable-breakpad", "--disable-crash-reporter"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.setContent(
    screenshotMarkup({
      image: groupsImage,
      eyebrow: "LOCAL-FIRST TAB MANAGER",
      title: "标签资产，一搜即达",
      detail: "关闭标签也不丢记录，用永久分组整理长期工作资料。",
      points: ["中文与 URL 搜索", "20 色永久分组", "规范化去重与会话快照"],
      accent: "#1f9d84",
    }),
  );
  await page.screenshot({
    path: join(outputRoot, "screenshot-groups-1280x800.png"),
  });

  await page.setContent(
    screenshotMarkup({
      image: sleepImage,
      eyebrow: "PROGRESSIVE TAB SLEEP",
      title: "按需释放标签内存",
      detail: "四级模式从原生卸载到本地占位页，按需逐级增强内存释放。",
      points: ["覆盖所有可操作网页", "原 URL 双重保存", "选中后确认恢复"],
      accent: "#1f9d84",
    }),
  );
  await page.screenshot({
    path: join(outputRoot, "screenshot-sleep-1280x800.png"),
  });

  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            width: 440px;
            height: 280px;
            margin: 0;
            overflow: hidden;
            background: #172534;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
              "Microsoft YaHei", sans-serif;
          }
          body {
            display: grid;
            place-items: center;
            border-bottom: 6px solid #43c6aa;
            text-align: center;
          }
          img {
            width: 72px;
            height: 72px;
            margin-bottom: 16px;
            border-radius: 18px;
          }
          strong {
            display: block;
            font-size: 30px;
          }
          span {
            display: block;
            margin-top: 8px;
            color: #b8c4ce;
            font-size: 15px;
          }
        </style>
      </head>
      <body>
        <main>
          <img src="${logo}" alt="" />
          <strong>Tab Vault</strong>
          <span>本地标签资产库</span>
        </main>
      </body>
    </html>
  `);
  await page.screenshot({
    path: join(outputRoot, "small-promo-440x280.png"),
  });
} finally {
  await browser?.close();
  await rm(profilePath, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      screenshots: [
        "store-assets/screenshot-groups-1280x800.png",
        "store-assets/screenshot-sleep-1280x800.png",
      ],
      smallPromo: "store-assets/small-promo-440x280.png",
    },
    null,
    2,
  ),
);
