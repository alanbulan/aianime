const { app, BrowserWindow } = require("electron");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ICON_SIZE = 512;

async function generateIcon() {
  const source = join(
    __dirname,
    "..",
    "..",
    "frontend",
    "public",
    "images",
    "ai-anime-logo-mark.png",
  );
  const outputDirectory = join(__dirname, "..", "build");
  const output = join(outputDirectory, "icon.png");
  const sourceUrl = `data:image/png;base64,${readFileSync(source).toString("base64")}`;
  const markup = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { width: 100%; height: 100%; margin: 0; background: transparent; overflow: hidden; }
          body { display: grid; place-items: center; }
          img { width: 448px; height: 448px; object-fit: contain; }
        </style>
      </head>
      <body><img src="${sourceUrl}" alt=""></body>
    </html>`;

  const window = new BrowserWindow({
    width: ICON_SIZE,
    height: ICON_SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
    },
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(markup)}`);
  await window.webContents.executeJavaScript(
    "document.fonts.ready.then(() => new Promise(requestAnimationFrame))",
  );
  const image = await window.webContents.capturePage({
    x: 0,
    y: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(output, image.toPNG());
  window.destroy();
  console.log(`Windows icon ready: ${output}`);
}

app.whenReady()
  .then(generateIcon)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
