(function () {
  const button = document.querySelector('[data-page-star]');
  if (!button) return;

  const label = button.querySelector('[data-page-star-label]');
  const count = button.querySelector('[data-page-star-count]');
  const icon = button.querySelector('.difta-star-icon');
  const storageKey = 'difta3d-page-starred';

  const render = (starred) => {
    button.setAttribute('aria-pressed', String(starred));
    button.setAttribute('aria-label', starred ? 'Remove your star from this project page' : 'Star this project page');
    label.textContent = starred ? 'Starred' : 'Star this page';
    icon.textContent = starred ? '★' : '☆';
    count.textContent = starred ? '1' : '0';
  };

  let starred = false;
  try {
    starred = window.localStorage.getItem(storageKey) === 'true';
  } catch (_) {
    // Private browsing can block localStorage; the button still works for the session.
  }
  render(starred);

  button.addEventListener('click', () => {
    starred = !starred;
    try {
      window.localStorage.setItem(storageKey, String(starred));
    } catch (_) {
      // Keep the in-memory state when persistent storage is unavailable.
    }
    render(starred);
  });
})();
