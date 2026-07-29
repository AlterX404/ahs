async function loadFooter() {
  const footerContainer = document.getElementById("footer-container");

  if (!footerContainer) return;

  try {
    const response = await fetch("/footer.html");

    if (!response.ok) {
      throw new Error(`Footer could not be loaded: ${response.status}`);
    }

    footerContainer.innerHTML = await response.text();

    const yearElement = document.getElementById("footer-year");

    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", loadFooter);
