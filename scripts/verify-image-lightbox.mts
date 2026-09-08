import assert from "node:assert/strict";
import { useImageLightboxStore } from "../src/lib/store/image-lightbox-store";

const store = useImageLightboxStore;

assert.equal(store.getState().isOpen, false);
assert.equal(store.getState().currentIndex, 0);

const testImages = [
  { url: "https://example.com/img1.png", name: "Imagem 1" },
  { url: "https://example.com/img2.png", name: "Imagem 2" },
  { url: "https://example.com/img3.png", name: "Imagem 3" },
];

store.getState().openLightbox(testImages, 1);
assert.equal(store.getState().isOpen, true);
assert.equal(store.getState().images.length, 3);
assert.equal(store.getState().currentIndex, 1);
assert.equal(store.getState().images[store.getState().currentIndex].url, "https://example.com/img2.png");

store.getState().nextImage();
assert.equal(store.getState().currentIndex, 2);

store.getState().nextImage();
assert.equal(store.getState().currentIndex, 0);

store.getState().prevImage();
assert.equal(store.getState().currentIndex, 2);

store.getState().prevImage();
assert.equal(store.getState().currentIndex, 1);

store.getState().setImageIndex(0);
assert.equal(store.getState().currentIndex, 0);

store.getState().setImageIndex(99);
assert.equal(store.getState().currentIndex, 2);

store.getState().setImageIndex(-5);
assert.equal(store.getState().currentIndex, 0);

store.getState().closeLightbox();
assert.equal(store.getState().isOpen, false);

console.log("all image lightbox tests passed");
