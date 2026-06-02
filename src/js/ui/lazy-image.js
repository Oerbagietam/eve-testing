export function configureLazyImage(img) {
  if (!img) return;
  img.loading = "lazy";
  img.decoding = "async";
}

export function createLazyImageElement() {
  const img = document.createElement("img");
  configureLazyImage(img);
  return img;
}
