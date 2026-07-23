export async function exportPagePng(canvasApp) {
  const tiles = await canvasApp.exportTiles();
  if (!tiles.length) {
    throw new Error("The page is still blank.");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const TILE = 512;
  const images = await Promise.all(
    tiles.map(
      (tile) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            minX = Math.min(minX, tile.tx * TILE);
            minY = Math.min(minY, tile.ty * TILE);
            maxX = Math.max(maxX, tile.tx * TILE + TILE);
            maxY = Math.max(maxY, tile.ty * TILE + TILE);
            resolve({ tile, img });
          };
          img.src = tile.dataUrl;
        })
    )
  );
  const pad = 48;
  const width = Math.max(1, maxX - minX + pad * 2);
  const height = Math.max(1, maxY - minY + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#e8dcc4");
  gradient.addColorStop(1, "#d2bc94");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (const { tile, img } of images) {
    ctx.drawImage(img, tile.tx * TILE - minX + pad, tile.ty * TILE - minY + pad);
  }
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-dairy-${Date.now()}.png`;
  a.click();
}
