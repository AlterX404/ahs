document.addEventListener("DOMContentLoaded", async () => {
  const footerContainer = document.getElementById("footer-container");

  if (!footerContainer) return;

  try {
    const response = await fetch("/footer.html");

    if (!response.ok) {
      throw new Error(`Failed to load footer: ${response.status}`);
    }

    footerContainer.innerHTML = await response.text();
  } catch (error) {
    console.error("Footer loading error:", error);
  }
});

document.addEventListener("DOMContentLoaded", loadFooter);

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("footer-container");
    if (!container) return;

    const response = await fetch("/footer.html");
    container.innerHTML = await response.text();

    const year = document.getElementById("footer-year");
    if (year) {
        year.textContent = new Date().getFullYear();
    }
});
