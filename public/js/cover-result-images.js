export function bindCoverResultFallbacks(container, results) {
  for (const image of container.querySelectorAll('img[data-cover-image-index]')) {
    const result = results[Number(image.dataset.coverImageIndex)];
    if (!result?.url || result.url === result.thumbnailUrl) continue;
    image.addEventListener('error', () => {
      image.removeAttribute('data-cover-image-index');
      image.src = result.url;
    }, { once: true });
  }
}
