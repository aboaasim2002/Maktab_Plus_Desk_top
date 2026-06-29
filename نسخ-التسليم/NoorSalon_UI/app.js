const loginPreview = document.getElementById("loginPreview");
const loginForm = document.getElementById("loginForm");
const appShell = document.getElementById("appShell");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");

function openView(viewId) {
  const target = document.getElementById(viewId);
  if (!target) return;

  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });

  pageTitle.textContent = target.dataset.title || "NoorSalon";
  sidebar.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginPreview.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.view));
});

document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.viewShortcut));
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.tab).classList.add("active");
  });
});

document.querySelectorAll("input[name='payment']").forEach((input) => {
  input.addEventListener("change", () => {
    const bankReference = document.getElementById("bankReference");
    bankReference.classList.toggle("is-hidden", input.value !== "bank" || !input.checked);
  });
});

document.getElementById("menuButton").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.getElementById("logoutButton").addEventListener("click", () => {
  appShell.classList.add("is-hidden");
  loginPreview.classList.remove("is-hidden");
});
