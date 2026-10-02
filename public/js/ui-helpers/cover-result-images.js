export function bindCoverResultFallbacks(container, results) {
  for (const image of container.querySelectorAll('img[data-cover-image-index]')) {
    const result = results[Number(image.dataset.coverImageIndex)];
    if (!result?.url || result.url === result.thumbnailUrl) continue;
    const useOriginal = () => {
      image.removeEventListener('error', useOriginal);
      image.removeAttribute('data-cover-image-index');
      if (image.src !== result.url) image.src = result.url;
    };
    image.addEventListener('error', useOriginal, { once: true });
    // Cached failures may finish before the error listener is attached.
    if (image.complete && image.naturalWidth === 0) useOriginal();
  }
}
