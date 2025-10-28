document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('#menu-toggle');
  const links = document.querySelector('.nav-links');
  const header = document.querySelector('header');

  if (!toggle || !links || !header) return;

  const closeMenu = () => {
    links.classList.remove('open');
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('open');
    header.classList.toggle('nav-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      closeMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (!toggle.contains(event.target) && !links.contains(event.target)) {
      closeMenu();
    }
  });
});
